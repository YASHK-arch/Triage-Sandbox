"""
Cloud LLM Refiner — reads raw notebooks, sends screenshots + transcripts
to Claude (primary) or Groq (fallback), and produces polished lecture_code notebooks.

Each refined notebook contains:
  - Cell 0: Inferred project file structure as a code tree
  - Per segment: File path comment → refined code cell → explanation markdown cell
"""
import base64
import json
import os
import re
from pathlib import Path
from typing import List, Optional

import nbformat

from models.schemas import CloudLLMProvider
from utils import logger
from utils.notebook_utils import (
    add_code_cell,
    add_markdown_cell,
    create_notebook,
    load_notebook,
    safe_filename,
    save_notebook,
)
from utils.transcript_parser import format_timestamp

STAGE = "LLM_REFINE"

# ── System Prompt ─────────────────────────────────────────────────────────────
REFINER_SYSTEM_PROMPT = """You are an expert programming tutor and code extraction assistant.

You will receive:
1. One or more screenshots from a programming tutorial video showing code in an editor
2. The transcript text from the instructor during that time segment
3. Context about the chapter/topic

Your task:
1. **Extract the complete code** visible in the screenshots. Fill in any truncated or partially visible parts using context from the transcript. Fix obvious typos.
2. **Identify the file** this code belongs to (e.g., app.py, templates/index.html, models.py). Use the editor's title bar or imports as clues.
3. **Infer the project file structure** based on all code you've seen (imports, file paths mentioned, directory trees visible).
4. **Write a clear explanation** of what this code does, incorporating the instructor's commentary from the transcript.

Output a JSON object with EXACTLY this structure:
{
  "file_path": "relative/path/to/file.py",
  "refined_code": "# complete, refined code here\\n...",
  "explanation": "Markdown explanation of what this code does and why...",
  "file_structure": "project/\\n├── app.py\\n├── templates/\\n│   └── index.html\\n...",
  "segment_summary": "One sentence summary of what was taught in this segment"
}

Rules:
- refined_code must be complete, runnable Python/HTML/CSS/JS (not pseudocode)
- file_structure: only include files you're confident about from visual evidence
- explanation: 2-5 sentences, instructor-perspective, references the transcript
- If code is cut off, write what logically follows based on transcript context
- Do NOT include the JSON structure explanation in your output, just the JSON object"""


def _encode_image_to_base64(image_path: str) -> str:
    with open(image_path, "rb") as f:
        return base64.standard_b64encode(f.read()).decode("utf-8")


def _extract_images_from_notebook(nb: nbformat.NotebookNode) -> List[dict]:
    """
    Extract embedded base64 images from notebook markdown cells.
    Returns list of {cell_index, base64_data, tags, caption}
    """
    images = []
    for i, cell in enumerate(nb.cells):
        if cell.cell_type != "markdown":
            continue
        # Match base64 inline images
        pattern = r"!\[([^\]]*)\]\(data:image/(?:png|jpeg|jpg);base64,([A-Za-z0-9+/=]+)\)"
        for m in re.finditer(pattern, cell.source):
            images.append({
                "cell_index": i,
                "caption": m.group(1),
                "base64_data": m.group(2),
                "tags": cell.metadata.get("tags", []),
            })
    return images


def _get_segment_transcript(nb: nbformat.NotebookNode, segment_label: str) -> str:
    """Collect all transcript text associated with a segment label from the notebook."""
    texts = []
    for cell in nb.cells:
        tags = cell.metadata.get("tags", [])
        if segment_label in tags and ("transcript" in tags or "full_transcript" in tags):
            # Strip markdown formatting
            text = re.sub(r"^#+\s*.*$", "", cell.source, flags=re.MULTILINE)
            text = re.sub(r"^\s*>\s*", "", text, flags=re.MULTILINE)
            texts.append(text.strip())
    return "\n\n".join(texts)


def _call_claude(
    images_b64: List[str],
    transcript: str,
    chapter_title: str,
    api_key: str,
) -> dict:
    """Call Anthropic Claude API with images and transcript."""
    import anthropic

    client = anthropic.Anthropic(api_key=api_key)

    content = []
    for b64 in images_b64[:4]:  # Claude max 4 images per call
        content.append({
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": "image/png",
                "data": b64,
            },
        })

    user_text = (
        f"**Chapter/Topic**: {chapter_title}\n\n"
        f"**Instructor Transcript**:\n{transcript[:3000]}\n\n"
        "Please analyze the screenshots and transcript above, then output the JSON."
    )
    content.append({"type": "text", "text": user_text})

    response = client.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=4096,
        system=REFINER_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": content}],
    )
    raw = response.content[0].text.strip()
    return _parse_llm_json(raw)


def _call_groq(
    images_b64: List[str],
    transcript: str,
    chapter_title: str,
    api_key: str,
) -> dict:
    """Call Groq API with images and transcript (uses llama-3.2-90b-vision-preview)."""
    from groq import Groq

    client = Groq(api_key=api_key)

    content = []
    # Groq vision: first image only for now
    if images_b64:
        content.append({
            "type": "image_url",
            "image_url": {"url": f"data:image/png;base64,{images_b64[0]}"},
        })

    user_text = (
        f"Chapter/Topic: {chapter_title}\n\n"
        f"Instructor Transcript:\n{transcript[:2000]}\n\n"
        "Analyze the screenshot and transcript. Output ONLY the JSON object."
    )
    content.append({"type": "text", "text": user_text})

    response = client.chat.completions.create(
        model="llama-3.2-90b-vision-preview",
        messages=[
            {"role": "system", "content": REFINER_SYSTEM_PROMPT},
            {"role": "user", "content": content},
        ],
        max_tokens=4096,
        temperature=0.1,
    )
    raw = response.choices[0].message.content.strip()
    return _parse_llm_json(raw)


def _parse_llm_json(raw: str) -> dict:
    """Extract and parse JSON from LLM response."""
    start = raw.find("{")
    end = raw.rfind("}") + 1
    if start >= 0 and end > start:
        try:
            return json.loads(raw[start:end])
        except json.JSONDecodeError:
            pass
    # Fallback: return raw as explanation
    return {
        "file_path": "unknown.py",
        "refined_code": f"# Could not parse code from LLM response\n# Raw output:\n# {raw[:500]}",
        "explanation": raw[:1000],
        "file_structure": "",
        "segment_summary": "Code extraction failed — see raw output above",
    }


def refine_notebooks(
    raw_notebook_paths: List[str],
    output_dir: str,
    provider: CloudLLMProvider,
    api_key: str,
    video_title: str,
) -> List[str]:
    """
    Main refinement function. Processes each raw notebook through the cloud LLM
    and produces polished notebooks in lecture_code/.

    Returns list of output notebook paths.
    """
    out = Path(output_dir) / "lecture_code"
    out.mkdir(parents=True, exist_ok=True)

    logger.info(STAGE, f"Starting LLM refinement ({provider.value}) on {len(raw_notebook_paths)} notebooks...", 0.0)

    refined_paths: List[str] = []
    # Track global file structure across all notebooks
    global_file_structure: Optional[str] = None

    for nb_idx, raw_path in enumerate(raw_notebook_paths):
        progress = nb_idx / len(raw_notebook_paths)
        nb_filename = Path(raw_path).name
        logger.info(STAGE, f"[{nb_idx+1}/{len(raw_notebook_paths)}] Refining: {nb_filename}", progress)

        try:
            refined_path = _refine_single_notebook(
                raw_path=raw_path,
                output_dir=str(out),
                provider=provider,
                api_key=api_key,
                video_title=video_title,
                global_file_structure=global_file_structure,
            )
            refined_paths.append(refined_path)
            logger.success(STAGE, f"Refined: {Path(refined_path).name}", progress)

            # Update global file structure from first successful extraction
            if global_file_structure is None:
                try:
                    refined_nb = load_notebook(refined_path)
                    for cell in refined_nb.cells:
                        if "file_structure" in cell.metadata.get("tags", []):
                            global_file_structure = cell.source
                            break
                except Exception:
                    pass

        except Exception as e:
            logger.error(STAGE, f"Failed to refine {nb_filename}: {e}")
            # Copy raw notebook as fallback
            import shutil
            fallback_path = str(out / nb_filename)
            shutil.copy2(raw_path, fallback_path)
            refined_paths.append(fallback_path)

    logger.success(STAGE, f"Refinement complete: {len(refined_paths)} notebooks in {out}", 1.0)
    return refined_paths


def _refine_single_notebook(
    raw_path: str,
    output_dir: str,
    provider: CloudLLMProvider,
    api_key: str,
    video_title: str,
    global_file_structure: Optional[str],
) -> str:
    """Refine one notebook: extract images, call LLM, build polished output."""
    raw_nb = load_notebook(raw_path)
    chapter_title = raw_nb.metadata.get("lectureforge", {}).get("chapter_title", Path(raw_path).stem)

    # Create refined notebook
    refined_nb = create_notebook(metadata_extra={
        "lecture_title": video_title,
        "chapter_title": chapter_title,
        "refined": True,
        "provider": provider.value,
    })

    # ── Title header ──────────────────────────────────────────────────────────
    add_markdown_cell(
        refined_nb,
        f"# 🎓 {chapter_title}\n\n"
        f"**Lecture**: {video_title}  \n"
        f"**Status**: ✅ LLM-Refined (`{provider.value}`)  \n"
        f"> *Code extracted, completed, and explained by LectureForge AI*",
        tags=["header"],
    )

    # ── Collect segments from raw notebook ────────────────────────────────────
    # Find all unique segment labels
    segment_labels = []
    seen = set()
    for cell in raw_nb.cells:
        tags = cell.metadata.get("tags", [])
        for tag in tags:
            if tag.startswith("code_segment_") and tag not in seen:
                segment_labels.append(tag)
                seen.add(tag)

    if not segment_labels:
        add_markdown_cell(
            refined_nb,
            "⚠️ *No code segments found in this chapter to refine.*",
            tags=["no_segments"],
        )
        out_path = str(Path(output_dir) / Path(raw_path).name)
        save_notebook(refined_nb, out_path)
        return out_path

    # Placeholder for file structure (filled in after first LLM call)
    file_structure_placeholder_idx = len(refined_nb.cells)
    add_code_cell(
        refined_nb,
        "# 📁 Inferred Project File Structure\n# (populated after refinement)",
        tags=["file_structure"],
    )

    collected_file_structures: List[str] = []
    if global_file_structure:
        collected_file_structures.append(global_file_structure)

    # ── Process each segment ──────────────────────────────────────────────────
    for seg_label in segment_labels:
        logger.info(STAGE, f"  Processing segment: {seg_label}", 0.5)

        # Collect images for this segment
        images_b64 = []
        for cell in raw_nb.cells:
            tags = cell.metadata.get("tags", [])
            if seg_label in tags and "screenshot" in tags:
                pattern = r"data:image/(?:png|jpeg);base64,([A-Za-z0-9+/=]+)"
                for m in re.finditer(pattern, cell.source):
                    images_b64.append(m.group(1))

        # Get transcript for segment
        transcript = _get_segment_transcript(raw_nb, seg_label)

        # Get segment timing from header cell
        seg_start = seg_end = None
        for cell in raw_nb.cells:
            tags = cell.metadata.get("tags", [])
            if seg_label in tags and "segment_header" in tags:
                ts_pattern = r"`(\d{2}:\d{2}:\d{2})`\s*→\s*`(\d{2}:\d{2}:\d{2})`"
                m = re.search(ts_pattern, cell.source)
                if m:
                    seg_start, seg_end = m.group(1), m.group(2)

        if not images_b64 and not transcript:
            logger.warning(STAGE, f"  No images or transcript for {seg_label}, skipping")
            continue

        # ── LLM call ──────────────────────────────────────────────────────────
        try:
            if provider == CloudLLMProvider.claude:
                result = _call_claude(images_b64, transcript, chapter_title, api_key)
            else:
                result = _call_groq(images_b64, transcript, chapter_title, api_key)
        except Exception as e:
            logger.error(STAGE, f"  LLM call failed for {seg_label}: {e}")
            result = {
                "file_path": "unknown.py",
                "refined_code": f"# LLM call failed: {e}\n# Transcript context:\n# {transcript[:300]}",
                "explanation": f"LLM refinement failed: {e}",
                "file_structure": "",
                "segment_summary": "Refinement failed",
            }

        file_path = result.get("file_path", "unknown.py")
        refined_code = result.get("refined_code", "# No code extracted")
        explanation = result.get("explanation", "")
        file_structure = result.get("file_structure", "")
        summary = result.get("segment_summary", seg_label)

        if file_structure:
            collected_file_structures.append(file_structure)

        # ── Add cells to refined notebook ─────────────────────────────────────
        timing_str = f"`{seg_start}` → `{seg_end}`" if seg_start else seg_label
        add_markdown_cell(
            refined_nb,
            f"---\n\n## 📄 `{file_path}` — {summary}\n\n"
            f"**Segment**: {seg_label} | **Time**: {timing_str}",
            tags=["segment_header", seg_label],
        )

        # Refined code cell
        file_comment = f"# File: {file_path}\n"
        add_code_cell(
            refined_nb,
            file_comment + refined_code,
            tags=["refined_code", seg_label, file_path.replace("/", "_")],
        )

        # Explanation cell
        if explanation:
            add_markdown_cell(
                refined_nb,
                f"### 💡 Explanation\n\n{explanation}",
                tags=["explanation", seg_label],
            )

        # Embed first screenshot for reference
        if images_b64:
            shot_md = f"![{seg_label} screenshot](data:image/png;base64,{images_b64[0]})\n\n*Source screenshot for reference*"
            add_markdown_cell(
                refined_nb,
                shot_md,
                tags=["reference_screenshot", seg_label],
            )

    # ── Update file structure cell ─────────────────────────────────────────────
    if collected_file_structures:
        best_structure = max(collected_file_structures, key=len)
        refined_nb.cells[file_structure_placeholder_idx].source = (
            f"# 📁 Inferred Project File Structure\n"
            f"# Based on code screenshots and imports analysis\n\n"
            f'"""\n{best_structure}\n"""'
        )

    out_path = str(Path(output_dir) / Path(raw_path).name)
    save_notebook(refined_nb, out_path)
    return out_path
