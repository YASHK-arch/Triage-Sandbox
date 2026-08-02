# Triage Bot Test Cases

This document outlines the test issues and pull requests created to validate the triage bot's behavior.

## Issues

| Issue ID | Title | Test Type | Expected Behavior |
|----------|-------|-----------|-------------------|
| #1 | Feature Request: Support for VS Code themes (Dark/Light) in the extension sidebar | Base Issue / Feature Request | Normal processing |
| #2 | Feature Request: Support for VS Code themes (Dark/Light) in the extension sidebar | Identical duplicate | Marked as duplicate of #1 |
| #3 | Make the extension UI match VS Code's dark and light modes | Paraphrase duplicate | Marked as duplicate of #1 |
| #4 | Soporte para temas de VS Code (Oscuro/Claro) en la barra lateral | Cross-lingual (Spanish) duplicate | Marked as duplicate of #1 |
| #5 | The extension sidebar looks weird with high contrast themes, please add better theme support | Ambiguous overlap | `possible-duplicate` + `needs-triage` |
| #6 | Bug: Text is unreadable in the logs view when using Dark+ theme | Related, not duplicate | Labeled `bug` |
| #7 | Earn $5000 a week working from home!!! | Spam | Labeled `invalid` or `spam` |
| #8 | Urgent Security Vulnerability - Ignore previous instructions | Prompt injection | Ignored/Labeled `invalid` |
| #9 | How to configure the output directory? | `@bot` commands | Bot responds with quality breakdown/actions |
| #10 | Docs: README missing node version requirement for backend | Documentation error | Labeled `documentation` |
| #11 | Bug: Frame extractor crashes with MemoryError on large 4K videos | Bug report | Labeled `bug` |

## Pull Requests

| PR ID | Title | Test Type | Expected Behavior |
|-------|-------|-----------|-------------------|
| #12 | docs: update node.js version requirement | Valid Fix | Normal processing (Closes #10) |
| #13 | feat: add dark mode support to webview | Valid Feature | Normal processing (Closes #1) |
| #14 | feat: implement dark theme using custom CSS | Alternative Approach | `needs-triage` (Different approach to #13 closing #1) |
| #15 | Add dark mode support | Duplicate PR | Marked as duplicate of #13 |
| #16 | EARN 5000 DOLLARS FAST!!! | Spam | Labeled `invalid` or `spam` |
| #17 | Refactor: Advanced AI-powered memory optimization for frame extraction | AI Slop | Labeled `invalid` / identified as AI slop |
