"""
Notebook utilities — helpers for building .ipynb files via nbformat.
"""
import base64
import json
from pathlib import Path
from typing import Optional

import nbformat
from nbformat.v4 import new_notebook, new_markdown_cell, new_code_cell


def create_notebook(metadata_extra: Optional[dict] = None) -> nbformat.NotebookNode:
    """Create an empty v4 notebook with LectureForge metadata."""
    nb = new_notebook()
    nb.metadata["lectureforge"] = metadata_extra or {}
    nb.metadata["kernelspec"] = {
        "display_name": "Python 3",
        "language": "python",
        "name": "python3",
    }
    nb.metadata["language_info"] = {"name": "python"}
    return nb


def add_markdown_cell(nb: nbformat.NotebookNode, text: str, tags: Optional[list] = None) -> None:
    """Append a markdown cell to a notebook."""
    cell = new_markdown_cell(text)
    if tags:
        cell.metadata["tags"] = tags
    nb.cells.append(cell)


def add_code_cell(nb: nbformat.NotebookNode, source: str, tags: Optional[list] = None) -> None:
    """Append a code cell to a notebook."""
    cell = new_code_cell(source)
    if tags:
        cell.metadata["tags"] = tags
    nb.cells.append(cell)


def image_to_base64(image_path: str) -> str:
    """Return base64-encoded PNG string from image file."""
    with open(image_path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")


def add_image_markdown_cell(
    nb: nbformat.NotebookNode,
    image_path: str,
    caption: str = "",
    embed: bool = True,
    tags: Optional[list] = None,
) -> None:
    """
    Add an image to a notebook as a markdown cell.
    If embed=True, embeds as base64 inline. Otherwise uses file path.
    """
    if embed:
        b64 = image_to_base64(image_path)
        img_md = f"![{caption}](data:image/png;base64,{b64})"
    else:
        rel_path = image_path.replace("\\", "/")
        img_md = f"![{caption}]({rel_path})"

    text = f"{img_md}\n\n*{caption}*" if caption else img_md
    add_markdown_cell(nb, text, tags=tags)


def save_notebook(nb: nbformat.NotebookNode, path: str) -> None:
    """Validate and save notebook to disk."""
    nbformat.validate(nb)
    with open(path, "w", encoding="utf-8") as f:
        nbformat.write(nb, f)


def load_notebook(path: str) -> nbformat.NotebookNode:
    """Load notebook from disk."""
    with open(path, "r", encoding="utf-8") as f:
        return nbformat.read(f, as_version=4)


def notebook_to_json_str(nb: nbformat.NotebookNode) -> str:
    """Serialize notebook to JSON string (for LLM input)."""
    return nbformat.writes(nb)


def safe_filename(title: str, index: int) -> str:
    """Convert chapter title to safe notebook filename."""
    import re
    clean = re.sub(r"[^\w\s-]", "", title.lower())
    clean = re.sub(r"[\s-]+", "_", clean).strip("_")
    return f"{index:02d}_{clean}.ipynb"
