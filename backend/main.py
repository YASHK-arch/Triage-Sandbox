"""
LectureForge FastAPI Server — Pipeline Orchestrator

Endpoints:
  POST /api/start-extraction  — Start the full pipeline
  GET  /api/status            — SSE stream of live log events
  GET  /api/health            — Health check + Ollama status
  GET  /api/output/{job_id}   — Get output notebook paths
  POST /api/cancel/{job_id}   — Cancel running job
"""
import asyncio
import os
import sys
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncIterator, Optional

from fastapi import BackgroundTasks, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

# Add backend root to sys.path
sys.path.insert(0, str(Path(__file__).parent))

from models.schemas import (
    ChapterInfo,
    CloudLLMProvider,
    ExtractionConfig,
    ExtractionRequest,
)
from pipeline.downloader import download_video_and_metadata, load_transcript_segments
from pipeline.frame_extractor import extract_frames_at_fps
from pipeline.llm_refiner import refine_notebooks
from pipeline.notebook_builder import build_raw_notebooks
from pipeline.screen_detector import detect_code_segments
from utils import logger


# ── Job State ─────────────────────────────────────────────────────────────────
class JobState:
    def __init__(self):
        self.jobs: dict = {}  # job_id → {status, config, result, task}

    def create(self, job_id: str, config: ExtractionConfig):
        self.jobs[job_id] = {
            "status": "running",
            "config": config.model_dump(),
            "result": None,
            "error": None,
        }

    def finish(self, job_id: str, result: dict):
        if job_id in self.jobs:
            self.jobs[job_id]["status"] = "done"
            self.jobs[job_id]["result"] = result

    def fail(self, job_id: str, error: str):
        if job_id in self.jobs:
            self.jobs[job_id]["status"] = "error"
            self.jobs[job_id]["error"] = error

    def get(self, job_id: str) -> Optional[dict]:
        return self.jobs.get(job_id)


_job_state = JobState()


# ── FastAPI App ───────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("SERVER", "LectureForge API started", 0.0)
    yield
    logger.info("SERVER", "LectureForge API shutting down", 0.0)


app = FastAPI(
    title="LectureForge API",
    description="YouTube Lecture Code Extractor & Notebook Maker",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Restricted in production; VSCode webview needs this
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/api/health")
async def health():
    """Health check + Ollama connectivity check."""
    import httpx
    ollama_status = "unknown"
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get("http://localhost:11434/api/tags", timeout=3.0)
            tags = resp.json().get("models", [])
            ollama_status = f"ok ({len(tags)} models)"
    except Exception as e:
        ollama_status = f"unavailable: {e}"

    return {
        "status": "ok",
        "ollama": ollama_status,
        "active_jobs": len([j for j in _job_state.jobs.values() if j["status"] == "running"]),
    }


@app.post("/api/start-extraction")
async def start_extraction(request: ExtractionRequest, background_tasks: BackgroundTasks):
    """Start the full extraction pipeline in the background. Returns job_id."""
    job_id = str(uuid.uuid4())[:8]
    _job_state.create(job_id, request.config)

    logger.info("SERVER", f"Job {job_id} created for: {request.config.youtube_url}", 0.0)

    # Reset SSE queue for new job
    while not logger._sse_queue.empty():
        try:
            logger._sse_queue.get_nowait()
        except Exception:
            break
    logger._history.clear()

    background_tasks.add_task(_run_pipeline, job_id, request.config)

    return {"job_id": job_id, "status": "started"}


@app.get("/api/status")
async def status_stream():
    """SSE stream — sends real-time log events to the VSCode sidebar."""
    return StreamingResponse(
        logger.sse_event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@app.get("/api/output/{job_id}")
async def get_output(job_id: str):
    """Get the output notebook paths for a completed job."""
    job = _job_state.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
    return job


@app.post("/api/cancel/{job_id}")
async def cancel_job(job_id: str):
    """Cancel a running job (best-effort)."""
    job = _job_state.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
    _job_state.fail(job_id, "Cancelled by user")
    logger.warning("SERVER", f"Job {job_id} cancelled by user")
    return {"status": "cancelled"}


# ── Pipeline Orchestrator ─────────────────────────────────────────────────────

async def _run_pipeline(job_id: str, config: ExtractionConfig):
    """Main pipeline runner — executes all stages sequentially."""
    try:
        loop = asyncio.get_event_loop()

        logger.info("PIPELINE", f"═══ LectureForge Pipeline Started ═══", 0.0)
        logger.info("PIPELINE", f"URL: {config.youtube_url}", 0.0)
        logger.info("PIPELINE", f"Local LLM: {config.local_llm_model.value}", 0.0)
        logger.info("PIPELINE", f"Cloud LLM: {config.cloud_llm_provider.value}", 0.0)
        logger.info("PIPELINE", f"Output: {config.output_dir}", 0.0)

        # ── Stage 1: Download ─────────────────────────────────────────────────
        logger.info("PIPELINE", "▶ Stage 1/5: Downloading video & transcript...", 0.02)
        download_result = await loop.run_in_executor(
            None,
            download_video_and_metadata,
            config.youtube_url,
            config.output_dir,
        )

        video_path = download_result["video_path"]
        transcript_path = download_result["transcript_path"]
        chapters = download_result["chapters"]
        video_title = download_result["title"]

        logger.success("PIPELINE", f"Stage 1 complete: {video_title} ({len(chapters)} chapters)", 0.20)

        # ── Parse transcript ──────────────────────────────────────────────────
        logger.info("PIPELINE", "Parsing transcript...", 0.21)
        transcript_segments = await loop.run_in_executor(
            None, load_transcript_segments, transcript_path
        )
        logger.success("PIPELINE", f"Parsed {len(transcript_segments)} transcript segments", 0.22)

        # ── Stage 2: Extract frames ────────────────────────────────────────────
        logger.info("PIPELINE", f"▶ Stage 2/5: Extracting frames at {config.frame_sample_fps}fps...", 0.23)
        frames_dir = str(Path(config.output_dir) / "frames")
        frames = await loop.run_in_executor(
            None,
            extract_frames_at_fps,
            video_path,
            frames_dir,
            config.frame_sample_fps,
        )
        logger.success("PIPELINE", f"Stage 2 complete: {len(frames)} frames extracted", 0.40)

        # ── Stage 3: Screen detection ─────────────────────────────────────────
        logger.info("PIPELINE", "▶ Stage 3/5: Running local LLM screen detection...", 0.41)
        logger.info(
            "PIPELINE",
            f"⏳ This is the longest stage. Estimated time: "
            f"{len(frames) * 0.3 / 60:.0f}–{len(frames) * 1.0 / 60:.0f} min "
            f"(depends on GPU/CPU and model)",
            0.41,
        )
        segments = await loop.run_in_executor(
            None,
            detect_code_segments,
            frames,
            config.local_llm_model.value,
            config.ollama_host,
            config.min_segment_duration_sec,
            15.0,  # max_gap_to_merge
            0.02,  # motion_threshold
        )
        logger.success("PIPELINE", f"Stage 3 complete: {len(segments)} code segments detected", 0.65)

        # ── Stage 4: Build raw notebooks ──────────────────────────────────────
        logger.info("PIPELINE", "▶ Stage 4/5: Building raw notebooks...", 0.66)
        raw_nb_paths = await loop.run_in_executor(
            None,
            build_raw_notebooks,
            chapters,
            segments,
            transcript_segments,
            video_path,
            config.output_dir,
            video_title,
            config.embed_images_as_base64,
            config.max_screenshots_per_segment,
        )
        logger.success("PIPELINE", f"Stage 4 complete: {len(raw_nb_paths)} raw notebooks", 0.80)

        # ── Stage 5: Cloud LLM refinement ─────────────────────────────────────
        logger.info("PIPELINE", "▶ Stage 5/5: Cloud LLM refinement pass...", 0.81)
        refined_nb_paths = await loop.run_in_executor(
            None,
            refine_notebooks,
            raw_nb_paths,
            config.output_dir,
            config.cloud_llm_provider,
            config.cloud_api_key,
            video_title,
        )
        logger.success("PIPELINE", f"Stage 5 complete: {len(refined_nb_paths)} refined notebooks", 0.98)

        # ── Done ──────────────────────────────────────────────────────────────
        result = {
            "video_title": video_title,
            "chapters": len(chapters),
            "code_segments": len(segments),
            "raw_notebooks": raw_nb_paths,
            "refined_notebooks": refined_nb_paths,
            "lecture_code_dir": str(Path(config.output_dir) / "lecture_code"),
        }

        _job_state.finish(job_id, result)

        logger.success(
            "PIPELINE",
            f"═══ COMPLETE ═══ {len(refined_nb_paths)} polished notebooks ready in: "
            f"{Path(config.output_dir) / 'lecture_code'}",
            1.0,
        )
        logger.done("PIPELINE", "All done! Open the lecture_code folder to view your notebooks.")

    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        logger.error("PIPELINE", f"Pipeline failed: {e}\n{tb}", 0.0)
        _job_state.fail(job_id, str(e))
        logger.done("PIPELINE", f"Failed: {e}")


# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="127.0.0.1",
        port=8765,
        reload=False,
        log_level="info",
    )


@app.get('/api/ping')
def ping():
    return {'ping': 'pong'}
