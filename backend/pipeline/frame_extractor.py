"""
Frame extractor — samples video at configurable FPS using OpenCV.
Produces a list of (timestamp_sec, frame_path) tuples.
"""
import cv2
import os
from pathlib import Path
from typing import List, Tuple

from utils import logger

STAGE = "FRAME_EXTRACT"


def extract_frames_at_fps(
    video_path: str,
    output_dir: str,
    sample_fps: float = 2.0,
) -> List[Tuple[float, str]]:
    """
    Extract frames from video at sample_fps rate.
    Saves frames as PNG files and returns list of (timestamp_sec, frame_path).
    """
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open video: {video_path}")

    video_fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration_sec = total_frames / video_fps if video_fps > 0 else 0
    frame_interval = max(1, int(video_fps / sample_fps))

    logger.info(
        STAGE,
        f"Video: {video_fps:.1f}fps, {total_frames} frames, "
        f"~{duration_sec/60:.1f}min. Sampling every {frame_interval} frames ({sample_fps}fps)",
        0.0,
    )

    frames: List[Tuple[float, str]] = []
    frame_idx = 0
    saved = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        if frame_idx % frame_interval == 0:
            ts = frame_idx / video_fps
            frame_name = f"frame_{frame_idx:08d}_{ts:.2f}s.png"
            frame_path = str(out / frame_name)
            cv2.imwrite(frame_path, frame)
            frames.append((ts, frame_path))
            saved += 1

            if saved % 100 == 0:
                progress = frame_idx / total_frames
                logger.info(STAGE, f"Extracted {saved} frames... ({progress*100:.0f}%)", progress)

        frame_idx += 1

    cap.release()
    logger.success(STAGE, f"Extracted {saved} sample frames from {Path(video_path).name}", 1.0)
    return frames


def extract_specific_frames(
    video_path: str,
    timestamps: List[float],
    output_dir: str,
) -> List[Tuple[float, str]]:
    """
    Extract frames at specific timestamps (in seconds).
    Returns list of (timestamp_sec, frame_path).
    """
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open video: {video_path}")

    video_fps = cap.get(cv2.CAP_PROP_FPS)
    frames: List[Tuple[float, str]] = []

    for ts in sorted(timestamps):
        frame_pos = int(ts * video_fps)
        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_pos)
        ret, frame = cap.read()
        if not ret:
            logger.warning(STAGE, f"Could not read frame at {ts:.2f}s")
            continue
        actual_ts = cap.get(cv2.CAP_PROP_POS_MSEC) / 1000.0
        frame_name = f"screenshot_{ts:.2f}s.png"
        frame_path = str(out / frame_name)
        cv2.imwrite(frame_path, frame)
        frames.append((actual_ts, frame_path))

    cap.release()
    logger.success(STAGE, f"Extracted {len(frames)} targeted screenshots", 1.0)
    return frames


def decide_screenshot_count(segment_duration_sec: float, max_count: int = 5) -> int:
    """
    Decide how many screenshots to extract from a segment based on duration.
    Short (<30s): 1, Medium (30s–2m): 2, Long (2–5m): 3, Very long (>5m): 4–5
    """
    if segment_duration_sec < 30:
        return 1
    elif segment_duration_sec < 120:
        return 2
    elif segment_duration_sec < 300:
        return 3
    elif segment_duration_sec < 600:
        return 4
    else:
        return min(5, max_count)


def get_segment_screenshot_timestamps(
    start_sec: float,
    end_sec: float,
    n_screenshots: int,
) -> List[float]:
    """Evenly spaced timestamps within a segment, avoiding the very start/end."""
    if n_screenshots == 1:
        return [(start_sec + end_sec) / 2]
    duration = end_sec - start_sec
    padding = duration * 0.1  # 10% padding each side
    step = (duration - 2 * padding) / (n_screenshots - 1)
    return [start_sec + padding + i * step for i in range(n_screenshots)]
