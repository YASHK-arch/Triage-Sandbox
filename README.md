# 🎓 LectureForge

> Transform YouTube programming lectures into polished, topic-wise Jupyter notebooks with AI-extracted and refined code.

## What It Does

LectureForge automates the painful process of following along with long programming tutorials. It:

1. **Downloads** the YouTube video + transcript + chapter markers via `yt-dlp`
2. **Detects** code-writing segments using a **local LLM (Ollama/moondream2)** — no cloud API cost for this step
3. **Extracts** smart screenshots (1–5 per segment based on length)
4. **Builds raw notebooks** — one per YouTube chapter/topic, with screenshots and transcripts embedded
5. **Refines code** via **Claude Sonnet or Groq** — fills in truncated code, infers file structure, adds explanations
6. Delivers a **`lecture_code/`** folder of polished Jupyter notebooks you can run immediately

All managed through a beautiful **VSCode sidebar extension** with live log streaming.

---

## Prerequisites

| Tool | Purpose | Install |
|---|---|---|
| Python 3.10+ | Backend runtime | [python.org](https://python.org) |
| [Ollama](https://ollama.ai) | Local LLM server | [ollama.ai](https://ollama.ai) |
| `moondream2` model | Screen detection | `ollama pull moondream2` |
| FFmpeg | Video processing (yt-dlp) | [ffmpeg.org](https://ffmpeg.org) or `choco install ffmpeg` |
| Node.js 18+ | VSCode extension build | [nodejs.org](https://nodejs.org) |
| Claude or Groq API key | Code refinement | [anthropic.com](https://anthropic.com) / [groq.com](https://groq.com) |

---

## Installation

### 1. Backend Setup

```bash
cd backend
pip install -r requirements.txt
```

### 2. Start Ollama & Pull Model

```bash
# Install Ollama from https://ollama.ai
ollama pull moondream2      # Fast, 2GB, CPU-friendly
# OR for better accuracy (needs 8GB VRAM):
ollama pull llava:7b
```

### 3. VSCode Extension

```bash
cd vscode-extension
npm install
npm run compile
```

Then in VSCode:
- Open Command Palette → `Extensions: Install from VSIX...`
- Or press `F5` in the extension folder to run in Development Host

### 4. Configure API Key

In VSCode Settings (`Ctrl+,`), search for `LectureForge`:
- Set `lectureforge.claudeApiKey` (recommended)
- Or `lectureforge.groqApiKey` (free tier)

---

## Usage

1. Open the **LectureForge** icon in the VSCode Activity Bar (left sidebar)
2. Paste a YouTube lecture URL (e.g., a 2-hour Flask tutorial)
3. Select your local LLM model and cloud LLM provider
4. Enter your API key
5. Click **▶ Extract & Build Notebooks**
6. Watch the live logs — the terminal panel shows every step
7. When done, click **📂 Open lecture_code Folder** to view your notebooks

---

## Output Structure

```
lecture_output/
├── raw/
│   ├── video.mp4
│   ├── video.en.vtt          # Transcript
│   └── info.json             # Video metadata + chapters
├── frames/                   # Sampled frames (auto-cleaned optionally)
├── screenshots/
│   ├── code_segment_001/
│   ├── code_segment_002/
│   └── ...
├── raw_notebooks/            # Stage 4 output
│   ├── 00_intro_to_flask.ipynb
│   ├── 01_routing_and_views.ipynb
│   └── ...
└── lecture_code/             # ✅ FINAL OUTPUT — open these!
    ├── 00_intro_to_flask.ipynb
    ├── 01_routing_and_views.ipynb
    └── ...
```

Each final notebook contains:
- **Cell 0**: Inferred project file structure tree
- Per code segment: `# File: app.py` → **complete code cell** → **explanation markdown**
- Reference screenshot for context

---

## Settings Reference

| Setting | Default | Description |
|---|---|---|
| `lectureforge.defaultLocalModel` | `moondream2` | Ollama model for screen detection |
| `lectureforge.defaultCloudProvider` | `claude` | Cloud LLM for refinement |
| `lectureforge.frameSampleFps` | `2.0` | Video sampling rate (fps). Higher = slower but more thorough |
| `lectureforge.ollamaHost` | `http://localhost:11434` | Ollama server URL |
| `lectureforge.pythonPath` | `python` | Python interpreter path |
| `lectureforge.useWhisperFallback` | `true` | Use Whisper if no YouTube captions |
| `lectureforge.outputDir` | *(workspace)* | Output folder. Blank = current workspace |

---

## How the Screen Detection Works

The local LLM (moondream2/llava) receives each sampled frame and answers:

> *"Is this a code editor with someone actively typing code? Yes/No"*

A **motion pre-filter** skips static frames automatically (no LLM call needed), making the process much faster. Detected frames are grouped into segments, nearby segments are merged, and short segments are pruned.

**Estimated processing time** for a 2-hour lecture:
- Download: ~5–15 min (depends on internet speed)
- Frame extraction: ~2 min
- Screen detection: ~10–70 min (GPU vs CPU, model size)
- Notebook building: ~5 min
- Cloud LLM refinement: ~5–15 min (depends on number of segments)

---

## Troubleshooting

### "Cannot connect to Ollama"
```bash
ollama serve        # Start Ollama server
ollama pull moondream2  # Ensure model is downloaded
```

### "No subtitles found"
Enable `lectureforge.useWhisperFallback` in settings. The pipeline will use local Whisper to transcribe audio (adds ~10–30 min for a 2hr video on CPU).

### Backend won't start
Check the `🎓 LectureForge` terminal in VSCode for error messages. Common issues:
- Missing Python packages: `cd backend && pip install -r requirements.txt`
- Port conflict: Change `lectureforge.backendPort` in settings

---

## Architecture

```
VSCode Extension (TypeScript)
    │  HTTP + SSE
    ▼
FastAPI Backend (Python)
    │
    ├── Stage 1: yt-dlp → video + transcript + chapters
    ├── Stage 2: OpenCV → frame extraction at 2fps
    ├── Stage 3: Ollama/moondream2 → code segment detection
    ├── Stage 4: nbformat → raw notebook generation
    └── Stage 5: Claude/Groq → code refinement + explanation
```

---

## License

MIT
