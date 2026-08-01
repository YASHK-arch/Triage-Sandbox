"""
YouTube downloader — wraps yt-dlp to fetch:
  - Video file (.mp4)
  - Auto/manual subtitles (.vtt/.srt)
  - Chapter markers (from info JSON)
  - Whisper fallback transcription if subtitles unavailable
"""
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import List, Optional

from models.schemas import ChapterInfo, TranscriptSegment
from utils import logger
from utils.transcript_parser import parse_transcript


STAGE = "DOWNLOAD"


def _run_ytdlp(args: List[str], cwd: str) -> subprocess.CompletedProcess:
    """Run yt-dlp as subprocess and stream output to logger."""
    cmd = [sys.executable, "-m", "yt_dlp"] + args
    logger.info(STAGE, f"Running: {' '.join(cmd[:6])}...", 0.0)
    result = subprocess.run(cmd, capture_output=True, text=True, cwd=cwd)
    if result.returncode != 0:
        logger.error(STAGE, f"yt-dlp error:\n{result.stderr}")
        raise RuntimeError(f"yt-dlp failed: {result.stderr[-500:]}")
    return result


def download_video_and_metadata(
    youtube_url: str,
    output_dir: str,
) -> dict:
    """
    Download video + transcript + chapter info.
    Returns dict with keys: video_path, transcript_path, chapters, info_json_path
    """
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)
    raw_dir = out / "raw"
    raw_dir.mkdir(exist_ok=True)

    logger.info(STAGE, "Fetching video metadata and chapters...", 0.02)

    # ── Step 1: Download info JSON (no video yet) ────────────────────────────
    info_json_path = raw_dir / "info.json"
    _run_ytdlp(
        [
            youtube_url,
            "--skip-download",
            "--write-info-json",
            "--output", str(raw_dir / "%(id)s.%(ext)s"),
        ],
        cwd=str(raw_dir),
    )

    # Find the info.json file
    info_files = list(raw_dir.glob("*.info.json"))
    if not info_files:
        raise FileNotFoundError("yt-dlp did not produce an info.json file")
    info_json_path = info_files[0]
    info = json.loads(info_json_path.read_text(encoding="utf-8"))

    video_id = info.get("id", "video")
    title = info.get("title", "Lecture")
    duration = info.get("duration", 0)
    chapters_raw = info.get("chapters") or []

    logger.info(STAGE, f"Video: {title} ({int(duration//60)}m {int(duration%60)}s)", 0.05)

    # ── Step 2: Download subtitles ───────────────────────────────────────────
    logger.info(STAGE, "Downloading subtitles...", 0.08)
    _run_ytdlp(
        [
            youtube_url,
            "--skip-download",
            "--write-subs",
            "--write-auto-subs",
            "--sub-langs", "en",
            "--sub-format", "vtt",
            "--output", str(raw_dir / "%(id)s.%(ext)s"),
        ],
        cwd=str(raw_dir),
    )

    # Find subtitle file
    subtitle_path: Optional[str] = None
    for ext in [".en.vtt", ".en-orig.vtt", ".en.srt", ".vtt", ".srt"]:
        candidates = list(raw_dir.glob(f"*{ext}"))
        if candidates:
            subtitle_path = str(candidates[0])
            logger.success(STAGE, f"Found subtitle: {candidates[0].name}", 0.10)
            break

    # ── Step 3: Download video ───────────────────────────────────────────────
    logger.info(STAGE, "Downloading video (this may take a while)...", 0.12)
    _run_ytdlp(
        [
            youtube_url,
            "--format", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
            "--output", str(raw_dir / f"{video_id}.mp4"),
            "--no-playlist",
        ],
        cwd=str(raw_dir),
    )

    video_files = list(raw_dir.glob("*.mp4"))
    if not video_files:
        raise FileNotFoundError("yt-dlp did not produce a video file")
    video_path = str(video_files[0])
    logger.success(STAGE, f"Video saved: {Path(video_path).name}", 0.35)

    # ── Step 4: Whisper fallback ─────────────────────────────────────────────
    if subtitle_path is None:
        logger.warning(STAGE, "No subtitles found. Running Whisper transcription (may be slow)...")
        subtitle_path = _transcribe_with_whisper(video_path, raw_dir)

    # ── Step 5: Parse chapters ───────────────────────────────────────────────
    chapters = _parse_chapters(chapters_raw, duration)
    logger.info(STAGE, f"Found {len(chapters)} chapters", 0.40)

    return {
        "video_path": video_path,
        "transcript_path": subtitle_path,
        "chapters": chapters,
        "title": title,
        "duration": duration,
        "info_json_path": str(info_json_path),
    }


def _parse_chapters(chapters_raw: list, total_duration: float) -> List[ChapterInfo]:
    """Convert yt-dlp chapter dicts to ChapterInfo objects."""
    if not chapters_raw:
        # No chapters: treat whole video as one chapter
        return [ChapterInfo(title="Full Lecture", start_sec=0.0, end_sec=total_duration, index=0)]

    chapters: List[ChapterInfo] = []
    for i, ch in enumerate(chapters_raw):
        start = float(ch.get("start_time", 0))
        # End time = start of next chapter or total duration
        if i + 1 < len(chapters_raw):
            end = float(chapters_raw[i + 1].get("start_time", total_duration))
        else:
            end = total_duration
        chapters.append(ChapterInfo(
            title=ch.get("title", f"Chapter {i+1}"),
            start_sec=start,
            end_sec=end,
            index=i,
        ))
    return chapters


def _transcribe_with_whisper(video_path: str, output_dir: Path) -> str:
    """Use faster-whisper (local) to transcribe video audio."""
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        raise RuntimeError(
            "faster-whisper not installed and no YouTube subtitles found. "
            "Install with: pip install faster-whisper"
        )

    logger.info(STAGE, "Loading faster-whisper model (base)...", 0.15)
    model = WhisperModel("base", device="cpu", compute_type="int8")
    logger.info(STAGE, "Transcribing audio... (this may take 5–20 min for a long lecture)", 0.18)
    segments_iter, _ = model.transcribe(video_path, beam_size=5)

    # Write as SRT
    srt_path = output_dir / "transcript_whisper.srt"
    with open(srt_path, "w", encoding="utf-8") as f:
        for i, seg in enumerate(segments_iter, 1):
            start = _sec_to_srt_time(seg.start)
            end = _sec_to_srt_time(seg.end)
            text = seg.text.strip()
            f.write(f"{i}\n{start} --> {end}\n{text}\n\n")

    logger.success(STAGE, f"Whisper transcription complete: {srt_path.name}", 0.35)
    return str(srt_path)


def _sec_to_srt_time(sec: float) -> str:
    h = int(sec // 3600)
    m = int((sec % 3600) // 60)
    s = int(sec % 60)
    ms = int((sec % 1) * 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def load_transcript_segments(transcript_path: str) -> List[TranscriptSegment]:
    """Parse transcript file into timed segments."""
    return parse_transcript(transcript_path)
