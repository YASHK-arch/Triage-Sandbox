"""
Screen change detector using Ollama local LLM (moondream2 / llava).

Strategy:
1. Sample frames at configured FPS (from frame_extractor)
2. For each frame, ask local LLM: "Is this a code editor with active typing?"
3. Group consecutive 'yes' frames into code segments
4. Merge adjacent segments with small gaps
5. Prune segments shorter than min_duration_sec
"""
import base64
import os
import time
from pathlib import Path
from typing import List, Optional, Tuple

import cv2
import numpy as np

try:
    import ollama
    HAS_OLLAMA = True
except ImportError:
    HAS_OLLAMA = False

from models.schemas import SegmentTag
from utils import logger

STAGE = "SCREEN_DETECT"

DETECTION_PROMPT = """You are analyzing a screenshot from a programming tutorial video.

Answer ONLY with a JSON object in this exact format:
{"is_coding": true/false, "workspace_type": "vscode|terminal|browser|other|none", "confidence": 0.0-1.0}

is_coding = true IF:
- A code editor (VS Code, PyCharm, Vim, Sublime, etc.) is visible with code being written
- A terminal with commands being typed is visible

is_coding = false IF:
- Slide presentation
- Browser showing documentation
- Blank screen or desktop
- Person talking without code on screen
- Browser showing a running web app (not the editor)

Be strict: only mark true when actively writing/editing code."""


def _frame_to_base64(frame_path: str) -> str:
    """Read image file and return base64 string."""
    with open(frame_path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")


def _analyze_frame_ollama(
    frame_path: str,
    model: str,
    ollama_host: str,
) -> dict:
    """Send frame to Ollama local LLM and return parsed response."""
    if not HAS_OLLAMA:
        raise RuntimeError("ollama Python package not installed. Run: pip install ollama")

    import json

    client = ollama.Client(host=ollama_host)
    b64 = _frame_to_base64(frame_path)

    try:
        response = client.chat(
            model=model,
            messages=[
                {
                    "role": "user",
                    "content": DETECTION_PROMPT,
                    "images": [b64],
                }
            ],
            options={"temperature": 0, "num_predict": 80},
        )
        raw = response["message"]["content"].strip()
        # Extract JSON from response (model may add extra text)
        start = raw.find("{")
        end = raw.rfind("}") + 1
        if start >= 0 and end > start:
            return json.loads(raw[start:end])
    except Exception as e:
        logger.warning(STAGE, f"Ollama error for {Path(frame_path).name}: {e}")
    return {"is_coding": False, "workspace_type": "none", "confidence": 0.0}


def _fast_motion_detection(
    frames: List[Tuple[float, str]],
    prev_frame_cache: dict,
    motion_threshold: float = 0.02,
) -> bool:
    """
    Quick pre-filter using pixel difference to skip frames with no change.
    Returns True if significant motion/change detected (worth sending to LLM).
    """
    if len(frames) < 2:
        return True

    ts, path = frames[-1]
    prev_ts, prev_path = frames[-2]

    try:
        curr = cv2.imread(path, cv2.IMREAD_GRAYSCALE)
        prev = cv2.imread(prev_path, cv2.IMREAD_GRAYSCALE)
        if curr is None or prev is None:
            return True
        # Resize for speed
        curr_small = cv2.resize(curr, (160, 90))
        prev_small = cv2.resize(prev, (160, 90))
        diff = np.mean(np.abs(curr_small.astype(float) - prev_small.astype(float))) / 255.0
        return diff > motion_threshold
    except Exception:
        return True


def detect_code_segments(
    frames: List[Tuple[float, str]],
    model: str = "moondream2",
    ollama_host: str = "http://localhost:11434",
    min_segment_duration: float = 10.0,
    max_gap_to_merge: float = 15.0,
    motion_threshold: float = 0.02,
) -> List[SegmentTag]:
    """
    Main detection function. Analyzes frames and returns code writing segments.

    Args:
        frames: List of (timestamp_sec, frame_path) from frame_extractor
        model: Ollama model name
        ollama_host: Ollama server URL
        min_segment_duration: Minimum seconds to keep a segment
        max_gap_to_merge: Max gap in seconds between segments to merge them
        motion_threshold: Pixel diff threshold for motion pre-filter

    Returns:
        List of SegmentTag objects sorted by start_sec
    """
    if not frames:
        return []

    # ── Check Ollama is running ──────────────────────────────────────────────
    logger.info(STAGE, f"Connecting to Ollama at {ollama_host}, model={model}...", 0.0)
    _check_ollama_available(ollama_host, model)

    total = len(frames)
    logger.info(STAGE, f"Analyzing {total} frames for code-writing activity...", 0.0)

    # ── Frame-by-frame analysis ──────────────────────────────────────────────
    detections: List[Tuple[float, bool, float]] = []  # (ts, is_coding, confidence)
    prev_frame: Optional[Tuple[float, str]] = None
    skipped = 0

    for i, (ts, path) in enumerate(frames):
        progress = 0.05 + (i / total) * 0.85

        # Motion pre-filter: skip static frames
        if prev_frame is not None:
            current_pair = [prev_frame, (ts, path)]
            has_motion = _fast_motion_detection(current_pair, {}, motion_threshold)
            if not has_motion:
                # Reuse previous detection
                if detections:
                    detections.append((ts, detections[-1][1], detections[-1][2]))
                else:
                    detections.append((ts, False, 0.0))
                skipped += 1
                prev_frame = (ts, path)
                continue

        result = _analyze_frame_ollama(path, model, ollama_host)
        is_coding = result.get("is_coding", False)
        confidence = result.get("confidence", 0.5)
        detections.append((ts, is_coding, confidence))

        if i % 50 == 0:
            logger.info(
                STAGE,
                f"Frame {i+1}/{total} ({ts:.1f}s) — {'✓ CODING' if is_coding else '✗ other'} "
                f"[skipped {skipped} static frames]",
                progress,
            )
        prev_frame = (ts, path)

    logger.info(STAGE, f"Analysis complete. Skipped {skipped}/{total} static frames.", 0.92)

    # ── Group consecutive coding frames into segments ────────────────────────
    segments = _group_detections_into_segments(detections)
    logger.info(STAGE, f"Found {len(segments)} raw code segments", 0.94)

    # ── Merge segments with small gaps ────────────────────────────────────────
    segments = _merge_nearby_segments(segments, max_gap_to_merge)
    logger.info(STAGE, f"After merging: {len(segments)} segments", 0.96)

    # ── Prune short segments ─────────────────────────────────────────────────
    segments = [s for s in segments if (s.end_sec - s.start_sec) >= min_segment_duration]
    logger.success(STAGE, f"Final: {len(segments)} code segments (≥{min_segment_duration}s each)", 1.0)

    for s in segments:
        duration = s.end_sec - s.start_sec
        from utils.transcript_parser import format_timestamp
        logger.info(
            STAGE,
            f"  [{format_timestamp(s.start_sec)} → {format_timestamp(s.end_sec)}] "
            f"({duration:.0f}s) conf={s.confidence:.2f}",
            1.0,
        )

    return segments


def _group_detections_into_segments(
    detections: List[Tuple[float, bool, float]],
) -> List[SegmentTag]:
    """Convert (ts, is_coding, confidence) list into SegmentTag objects."""
    segments: List[SegmentTag] = []
    in_segment = False
    seg_start = 0.0
    seg_confidences: List[float] = []
    label_counter = 1

    for ts, is_coding, confidence in detections:
        if is_coding and not in_segment:
            in_segment = True
            seg_start = ts
            seg_confidences = [confidence]
        elif is_coding and in_segment:
            seg_confidences.append(confidence)
        elif not is_coding and in_segment:
            in_segment = False
            avg_conf = sum(seg_confidences) / len(seg_confidences)
            segments.append(SegmentTag(
                start_sec=seg_start,
                end_sec=ts,
                label=f"code_segment_{label_counter:03d}",
                confidence=avg_conf,
            ))
            label_counter += 1
            seg_confidences = []

    # Close any open segment
    if in_segment and detections:
        last_ts = detections[-1][0]
        avg_conf = sum(seg_confidences) / max(1, len(seg_confidences))
        segments.append(SegmentTag(
            start_sec=seg_start,
            end_sec=last_ts,
            label=f"code_segment_{label_counter:03d}",
            confidence=avg_conf,
        ))

    return segments


def _merge_nearby_segments(
    segments: List[SegmentTag],
    max_gap: float,
) -> List[SegmentTag]:
    """Merge segments that are closer than max_gap seconds apart."""
    if not segments:
        return segments
    merged: List[SegmentTag] = [segments[0]]
    for seg in segments[1:]:
        last = merged[-1]
        if seg.start_sec - last.end_sec <= max_gap:
            # Merge
            merged[-1] = SegmentTag(
                start_sec=last.start_sec,
                end_sec=seg.end_sec,
                label=last.label,
                confidence=(last.confidence + seg.confidence) / 2,
            )
        else:
            merged.append(seg)
    return merged


def _check_ollama_available(ollama_host: str, model: str):
    """Verify Ollama is running and model is available."""
    import httpx
    try:
        resp = httpx.get(f"{ollama_host}/api/tags", timeout=5.0)
        resp.raise_for_status()
        tags = resp.json().get("models", [])
        model_names = [m.get("name", "") for m in tags]
        model_short = model.split(":")[0]
        has_model = any(model_short in name for name in model_names)
        if not has_model:
            logger.warning(
                STAGE,
                f"Model '{model}' not found in Ollama. Available: {model_names[:5]}. "
                f"Run: ollama pull {model}",
            )
    except Exception as e:
        logger.error(STAGE, f"Cannot connect to Ollama at {ollama_host}: {e}")
        raise RuntimeError(
            f"Ollama is not running at {ollama_host}. "
            "Please install and start Ollama: https://ollama.ai"
        )
