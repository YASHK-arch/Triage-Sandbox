"""
Structured logger with SSE (Server-Sent Events) broadcasting.
All pipeline stages write through this module so the VSCode extension
sidebar receives live log updates.
"""
import asyncio
import json
import logging
import sys
from datetime import datetime
from typing import AsyncIterator
from collections import deque

from rich.console import Console
from rich.logging import RichHandler

# ── Rich console for terminal output ──────────────────────────────────────────
console = Console(stderr=True)

logging.basicConfig(
    level=logging.DEBUG,
    format="%(message)s",
    datefmt="[%X]",
    handlers=[RichHandler(console=console, rich_tracebacks=True, markup=True)],
)
log = logging.getLogger("lectureforge")


# ── SSE Event Queue ────────────────────────────────────────────────────────────
_sse_queue: asyncio.Queue = asyncio.Queue(maxsize=500)
_history: deque = deque(maxlen=200)  # keep last 200 events for late subscribers


def _make_event(stage: str, message: str, level: str, progress: float, done: bool = False) -> dict:
    return {
        "ts": datetime.utcnow().isoformat(),
        "stage": stage,
        "message": message,
        "level": level,
        "progress": progress,
        "done": done,
    }


def _emit(stage: str, message: str, level: str, progress: float, done: bool = False):
    """Push event to SSE queue and rich terminal."""
    event = _make_event(stage, message, level, progress, done)
    _history.append(event)

    # Terminal log
    color_map = {"info": "cyan", "success": "green", "warning": "yellow", "error": "red"}
    color = color_map.get(level, "white")
    log.info(f"[bold {color}][{stage}][/bold {color}] {message}")

    # Non-blocking push to queue
    try:
        _sse_queue.put_nowait(event)
    except asyncio.QueueFull:
        pass  # Drop if full — SSE consumer is too slow


def info(stage: str, message: str, progress: float = 0.0):
    _emit(stage, message, "info", progress)


def success(stage: str, message: str, progress: float = 1.0):
    _emit(stage, message, "success", progress)


def warning(stage: str, message: str, progress: float = 0.0):
    _emit(stage, message, "warning", progress)


def error(stage: str, message: str, progress: float = 0.0, traceback: str = None):
    if traceback:
        message = f"{message}\\n{traceback}"
    _emit(stage, message, "error", progress)


def done(stage: str, message: str = "Complete"):
    _emit(stage, message, "success", 1.0, done=True)


async def sse_event_stream() -> AsyncIterator[str]:
    """
    Async generator that yields SSE-formatted strings.
    Replays history first so late subscribers get full context.
    """
    # Replay history for new subscriber
    for event in list(_history):
        yield f"data: {json.dumps(event)}\n\n"

    # Stream live events
    while True:
        try:
            event = await asyncio.wait_for(_sse_queue.get(), timeout=30.0)
            yield f"data: {json.dumps(event)}\n\n"
            if event.get("done"):
                break
        except asyncio.TimeoutError:
            # Heartbeat to keep connection alive
            yield ": heartbeat\n\n"
