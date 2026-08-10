from pydantic import BaseModel, HttpUrl
from typing import Optional, Literal
from enum import Enum


class LocalLLMModel(str, Enum):
    moondream2 = "moondream2"
    llava_7b = "llava:7b"
    llava_13b = "llava:13b"


class CloudLLMProvider(str, Enum):
    claude = "claude"
    groq = "groq"


class ExtractionConfig(BaseModel):
    youtube_url: str
    output_dir: str = "./lecture_output"
    local_llm_model: LocalLLMModel = LocalLLMModel.moondream2
    cloud_llm_provider: CloudLLMProvider = CloudLLMProvider.claude
    cloud_api_key: str
    frame_sample_fps: float = 2.0
    min_segment_duration_sec: float = 10.0
    max_screenshots_per_segment: int = 5
    use_whisper_fallback: bool = True
    embed_images_as_base64: bool = True
    ollama_host: str = "http://localhost:11434"
    retry_count: int = 3
    request_timeout: float = 60.0

class ExtractionRequest(BaseModel):
    config: ExtractionConfig


class SegmentTag(BaseModel):
    start_sec: float
    end_sec: float
    label: str
    confidence: float = 1.0
    screenshot_paths: list[str] = []


class ChapterInfo(BaseModel):
    title: str
    start_sec: float
    end_sec: float
    index: int


class TranscriptSegment(BaseModel):
    start_sec: float
    end_sec: float
    text: str


class PipelineStatus(BaseModel):
    stage: str
    message: str
    progress: float  # 0.0 – 1.0
    level: Literal["info", "success", "warning", "error"] = "info"
    done: bool = False


class JobStatus(BaseModel):
    status: str
