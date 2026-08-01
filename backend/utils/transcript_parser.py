"""
Transcript parser — converts YouTube VTT / SRT subtitle files into
a list of timed TranscriptSegment objects.
Also handles merging short segments and extracting text for a time range.
"""
import re
from pathlib import Path
from typing import List

try:
    import webvtt
    HAS_WEBVTT = True
except ImportError:
    HAS_WEBVTT = False

try:
    import srt
    HAS_SRT = True
except ImportError:
    HAS_SRT = False

from models.schemas import TranscriptSegment


def _time_to_sec(ts: str) -> float:
    """Convert HH:MM:SS.mmm or MM:SS.mmm to seconds."""
    ts = ts.strip().replace(",", ".")
    parts = ts.split(":")
    if len(parts) == 3:
        h, m, s = parts
    elif len(parts) == 2:
        h, m, s = "0", parts[0], parts[1]
    else:
        return float(parts[0])
    return int(h) * 3600 + int(m) * 60 + float(s)


def parse_vtt(path: str) -> List[TranscriptSegment]:
    """Parse a WebVTT file into segments."""
    segments: List[TranscriptSegment] = []
    if not HAS_WEBVTT:
        return _parse_vtt_manual(path)

    for caption in webvtt.read(path):
        text = caption.text.strip()
        if not text:
            continue
        segments.append(TranscriptSegment(
            start_sec=_time_to_sec(caption.start),
            end_sec=_time_to_sec(caption.end),
            text=text,
        ))
    return segments


def _parse_vtt_manual(path: str) -> List[TranscriptSegment]:
    """Manual VTT parser as fallback."""
    content = Path(path).read_text(encoding="utf-8")
    segments: List[TranscriptSegment] = []
    # Regex for timestamp lines: 00:00:01.000 --> 00:00:04.000
    block_pattern = re.compile(
        r"(\d{1,2}:\d{2}:\d{2}[\.,]\d{3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}[\.,]\d{3})\s*\n((?:.+\n?)+)",
        re.MULTILINE,
    )
    for m in block_pattern.finditer(content):
        start_sec = _time_to_sec(m.group(1))
        end_sec = _time_to_sec(m.group(2))
        text = re.sub(r"<[^>]+>", "", m.group(3)).strip()  # Strip VTT inline tags
        if text:
            segments.append(TranscriptSegment(start_sec=start_sec, end_sec=end_sec, text=text))
    return segments


def parse_srt(path: str) -> List[TranscriptSegment]:
    """Parse an SRT file into segments."""
    if not HAS_SRT:
        raise RuntimeError("srt library not installed. Run: pip install srt")
    content = Path(path).read_text(encoding="utf-8")
    parsed = srt.parse(content)
    segments: List[TranscriptSegment] = []
    for sub in parsed:
        text = sub.content.strip()
        # Remove HTML tags common in SRT files
        text = re.sub(r"<[^>]+>", "", text).strip()
        if text:
            segments.append(TranscriptSegment(
                start_sec=sub.start.total_seconds(),
                end_sec=sub.end.total_seconds(),
                text=text,
            ))
    return segments


def parse_transcript(path: str) -> List[TranscriptSegment]:
    """Auto-detect format and parse transcript file."""
    p = Path(path)
    ext = p.suffix.lower()
    if ext == ".vtt":
        return parse_vtt(path)
    elif ext in (".srt", ".sbv"):
        return parse_srt(path)
    else:
        # Try VTT first, then SRT
        try:
            return parse_vtt(path)
        except Exception:
            return parse_srt(path)


def merge_short_segments(
    segments: List[TranscriptSegment],
    min_duration: float = 2.0,
) -> List[TranscriptSegment]:
    """Merge adjacent segments shorter than min_duration into their neighbours."""
    if not segments:
        return segments
    merged: List[TranscriptSegment] = []
    buffer = segments[0]
    for seg in segments[1:]:
        dur = buffer.end_sec - buffer.start_sec
        if dur < min_duration:
            # Extend buffer with next segment
            buffer = TranscriptSegment(
                start_sec=buffer.start_sec,
                end_sec=seg.end_sec,
                text=buffer.text + " " + seg.text,
            )
        else:
            merged.append(buffer)
            buffer = seg
    merged.append(buffer)
    return merged


def get_text_for_range(
    segments: List[TranscriptSegment],
    start_sec: float,
    end_sec: float,
) -> str:
    """Return concatenated transcript text overlapping with [start_sec, end_sec]."""
    chunks = []
    for seg in segments:
        # Overlap check
        if seg.end_sec > start_sec and seg.start_sec < end_sec:
            chunks.append(seg.text)
    return " ".join(chunks).strip()


def format_timestamp(sec: float) -> str:
    """Format seconds to HH:MM:SS string."""
    h = int(sec // 3600)
    m = int((sec % 3600) // 60)
    s = int(sec % 60)
    return f"{h:02d}:{m:02d}:{s:02d}"
