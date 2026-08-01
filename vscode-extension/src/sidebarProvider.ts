import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { TerminalManager } from './terminalManager';

export class LectureForgeSidebarProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;
    private _lastOutputDir?: string;
    private _sseAbortController?: AbortController;
    private _backendStarted = false;

    constructor(
        private readonly _context: vscode.ExtensionContext,
        private readonly _terminalManager: TerminalManager,
    ) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this._context.extensionUri, 'media'),
            ],
        };

        webviewView.webview.html = this._getHtmlContent(webviewView.webview);

        // Handle messages from the WebView UI
        webviewView.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'startExtraction':
                        await this._handleStartExtraction(message.payload);
                        break;
                    case 'cancelExtraction':
                        await this._handleCancel(message.jobId);
                        break;
                    case 'openOutput':
                        this.openOutputFolder();
                        break;
                    case 'checkOllama':
                        await vscode.commands.executeCommand('lectureforge.checkOllama');
                        break;
                    case 'openSettings':
                        vscode.commands.executeCommand('workbench.action.openSettings', 'lectureforge');
                        break;
                    case 'getSettings':
                        this._sendSettings();
                        break;
                    case 'saveApiKey':
                        await this._saveApiKey(message.provider, message.key);
                        break;
                }
            },
            undefined,
            this._context.subscriptions,
        );

        // Send initial settings when sidebar opens
        this._sendSettings();
    }

    public triggerExtraction() {
        this._view?.webview.postMessage({ command: 'triggerStart' });
    }

    public openOutputFolder() {
        if (this._lastOutputDir && fs.existsSync(this._lastOutputDir)) {
            const lectureCodeDir = path.join(this._lastOutputDir, 'lecture_code');
            const dirToOpen = fs.existsSync(lectureCodeDir) ? lectureCodeDir : this._lastOutputDir;
            vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(dirToOpen));
        } else {
            vscode.window.showInformationMessage('No output directory available yet. Run an extraction first.');
        }
    }

    private async _handleStartExtraction(payload: {
        youtubeUrl: string;
        outputDir: string;
        localModel: string;
        cloudProvider: string;
        apiKey: string;
        frameFps: number;
        minSegmentSec: number;
        maxScreenshots: number;
        useWhisper: boolean;
        embedImages: boolean;
    }) {
        // Validate
        if (!payload.youtubeUrl?.trim()) {
            this._postError('Please enter a YouTube URL.');
            return;
        }
        if (!payload.apiKey?.trim()) {
            this._postError(`Please enter your ${payload.cloudProvider} API key.`);
            return;
        }

        // Resolve output directory
        let outputDir = payload.outputDir?.trim();
        if (!outputDir) {
            const wsFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            outputDir = wsFolder
                ? path.join(wsFolder, 'lecture_output')
                : path.join(require('os').homedir(), 'lecture_output');
        }
        this._lastOutputDir = outputDir;

        // Ensure backend is running
        const backendPort = vscode.workspace.getConfiguration('lectureforge').get<number>('backendPort', 8765);
        const backendStarted = await this._ensureBackendRunning(backendPort);
        if (!backendStarted) {
            this._postError('Failed to start backend server. Check the terminal for errors.');
            return;
        }

        // Post request to backend
        const ollamaHost = vscode.workspace.getConfiguration('lectureforge').get<string>('ollamaHost', 'http://localhost:11434');

        try {
            const resp = await fetch(`http://127.0.0.1:${backendPort}/api/start-extraction`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    config: {
                        youtube_url: payload.youtubeUrl,
                        output_dir: outputDir,
                        local_llm_model: payload.localModel,
                        cloud_llm_provider: payload.cloudProvider,
                        cloud_api_key: payload.apiKey,
                        frame_sample_fps: payload.frameFps,
                        min_segment_duration_sec: payload.minSegmentSec,
                        max_screenshots_per_segment: payload.maxScreenshots,
                        use_whisper_fallback: payload.useWhisper,
                        embed_images_as_base64: payload.embedImages,
                        ollama_host: ollamaHost,
                    },
                }),
            });

            const data = await resp.json() as { job_id: string };
            const jobId = data.job_id;

            this._view?.webview.postMessage({
                command: 'extractionStarted',
                jobId,
                outputDir,
            });

            // Start SSE log stream
            this._startSseStream(backendPort, jobId);

        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            this._postError(`Failed to start extraction: ${msg}`);
        }
    }

    private _startSseStream(port: number, jobId: string) {
        // Cancel any existing stream
        this._sseAbortController?.abort();
        this._sseAbortController = new AbortController();

        const streamUrl = `http://127.0.0.1:${port}/api/status`;

        // Poll with fetch in a loop (EventSource not available in VSCode extension host)
        this._pollSseStream(streamUrl, this._sseAbortController.signal);
    }

    private async _pollSseStream(url: string, signal: AbortSignal) {
        try {
            const resp = await fetch(url, { signal });
            if (!resp.body) { return; }

            const reader = resp.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done || signal.aborted) { break; }
                buffer += decoder.decode(value, { stream: true });

                // Parse SSE lines
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const event = JSON.parse(line.slice(6));
                            this._view?.webview.postMessage({ command: 'logEvent', event });
                            if (event.done) {
                                this._view?.webview.postMessage({ command: 'extractionComplete' });
                            }
                        } catch { /* skip malformed events */ }
                    }
                }
            }
        } catch (e: unknown) {
            if (!(e instanceof Error && e.name === 'AbortError')) {
                console.error('[LectureForge] SSE stream error:', e);
            }
        }
    }

    private async _handleCancel(jobId: string) {
        this._sseAbortController?.abort();
        try {
            const port = vscode.workspace.getConfiguration('lectureforge').get<number>('backendPort', 8765);
            await fetch(`http://127.0.0.1:${port}/api/cancel/${jobId}`, { method: 'POST' });
        } catch { /* best effort */ }
        this._view?.webview.postMessage({ command: 'extractionCancelled' });
    }

    private async _ensureBackendRunning(port: number): Promise<boolean> {
        // Check if already running
        try {
            const resp = await fetch(`http://127.0.0.1:${port}/api/health`, {
                signal: AbortSignal.timeout(2000),
            });
            if (resp.ok) {
                this._backendStarted = true;
                return true;
            }
        } catch { /* not running yet */ }

        // Start backend
        this._view?.webview.postMessage({ command: 'backendStarting' });
        const started = await this._terminalManager.startBackend(port);
        if (!started) { return false; }

        // Wait for backend to be ready (max 30s)
        for (let i = 0; i < 30; i++) {
            await new Promise(r => setTimeout(r, 1000));
            try {
                const resp = await fetch(`http://127.0.0.1:${port}/api/health`, {
                    signal: AbortSignal.timeout(1000),
                });
                if (resp.ok) {
                    this._backendStarted = true;
                    this._view?.webview.postMessage({ command: 'backendReady' });
                    return true;
                }
            } catch { /* still starting */ }
            this._view?.webview.postMessage({
                command: 'backendStartProgress',
                attempt: i + 1,
            });
        }

        return false;
    }

    private _sendSettings() {
        const config = vscode.workspace.getConfiguration('lectureforge');
        this._view?.webview.postMessage({
            command: 'settingsLoaded',
            settings: {
                defaultLocalModel: config.get('defaultLocalModel', 'moondream2'),
                defaultCloudProvider: config.get('defaultCloudProvider', 'claude'),
                claudeApiKey: config.get('claudeApiKey', ''),
                groqApiKey: config.get('groqApiKey', ''),
                outputDir: config.get('outputDir', ''),
                frameSampleFps: config.get('frameSampleFps', 2.0),
                useWhisperFallback: config.get('useWhisperFallback', true),
                ollamaHost: config.get('ollamaHost', 'http://localhost:11434'),
                backendPort: config.get('backendPort', 8765),
            },
        });
    }

    private async _saveApiKey(provider: string, key: string) {
        const config = vscode.workspace.getConfiguration('lectureforge');
        const settingKey = provider === 'claude' ? 'claudeApiKey' : 'groqApiKey';
        await config.update(settingKey, key, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage(`✅ ${provider} API key saved to VSCode settings.`);
    }

    private _postError(message: string) {
        this._view?.webview.postMessage({ command: 'error', message });
        vscode.window.showErrorMessage(`LectureForge: ${message}`);
    }

    private _getHtmlContent(webview: vscode.Webview): string {
        const mediaPath = vscode.Uri.joinPath(this._context.extensionUri, 'media');
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaPath, 'style.css'));
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaPath, 'main.js'));
        const nonce = getNonce();

        return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} data: https:; font-src ${webview.cspSource};">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="${styleUri}" rel="stylesheet">
    <title>LectureForge</title>
</head>
<body>
    <div id="app">
        <div class="header">
            <div class="logo">
                <span class="logo-icon">📚</span>
                <div>
                    <h1>LectureForge</h1>
                    <p class="tagline">YouTube Lecture → Jupyter Notebooks</p>
                </div>
            </div>
            <div class="header-actions">
                <button id="btn-settings" class="icon-btn" title="Settings">⚙️</button>
                <button id="btn-check-ollama" class="icon-btn" title="Check Ollama">🔍</button>
            </div>
        </div>

        <!-- Status Bar -->
        <div id="status-bar" class="status-bar idle">
            <span id="status-dot" class="status-dot"></span>
            <span id="status-text">Ready</span>
        </div>

        <!-- Main Form -->
        <div id="form-panel" class="panel">
            <div class="form-group">
                <label for="youtube-url">YouTube URL</label>
                <input
                    type="url"
                    id="youtube-url"
                    placeholder="https://www.youtube.com/watch?v=..."
                    autocomplete="off"
                    spellcheck="false"
                />
            </div>

            <div class="form-group">
                <label for="output-dir">Output Directory <span class="hint">(blank = workspace)</span></label>
                <input type="text" id="output-dir" placeholder="Leave blank to use workspace folder" />
            </div>

            <div class="form-row">
                <div class="form-group">
                    <label for="local-model">Local LLM (Screen)</label>
                    <select id="local-model">
                        <option value="moondream2">moondream2 (fast, CPU)</option>
                        <option value="llava:7b">llava:7b (accurate, GPU)</option>
                        <option value="llava:13b">llava:13b (best, 16GB+)</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="cloud-provider">Cloud LLM (Refine)</label>
                    <select id="cloud-provider">
                        <option value="claude">Claude Sonnet</option>
                        <option value="groq">Groq (free tier)</option>
                    </select>
                </div>
            </div>

            <div class="form-group">
                <label for="api-key" id="api-key-label">API Key</label>
                <div class="input-row">
                    <input type="password" id="api-key" placeholder="Enter your API key..." autocomplete="off" />
                    <button id="btn-save-key" class="small-btn" title="Save key to VSCode settings">💾</button>
                </div>
            </div>

            <!-- Advanced Settings (collapsible) -->
            <details class="advanced-details">
                <summary>⚙️ Advanced Settings</summary>
                <div class="advanced-content">
                    <div class="form-row">
                        <div class="form-group">
                            <label for="frame-fps">Sample FPS</label>
                            <input type="number" id="frame-fps" value="2" min="0.5" max="5" step="0.5" />
                            <span class="hint">Higher = more accurate, slower</span>
                        </div>
                        <div class="form-group">
                            <label for="min-segment">Min Segment (s)</label>
                            <input type="number" id="min-segment" value="10" min="5" max="60" />
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label for="max-screenshots">Max Screenshots</label>
                            <input type="number" id="max-screenshots" value="5" min="1" max="10" />
                        </div>
                        <div class="form-group">
                            <label>Options</label>
                            <label class="checkbox-label">
                                <input type="checkbox" id="use-whisper" checked />
                                Whisper fallback
                            </label>
                            <label class="checkbox-label">
                                <input type="checkbox" id="embed-images" checked />
                                Embed images (base64)
                            </label>
                        </div>
                    </div>
                </div>
            </details>

            <div class="form-actions">
                <button id="btn-start" class="btn-primary">
                    <span class="btn-icon">▶</span> Extract & Build Notebooks
                </button>
                <button id="btn-cancel" class="btn-danger" style="display:none">
                    <span class="btn-icon">■</span> Cancel
                </button>
                <button id="btn-open-output" class="btn-secondary" style="display:none">
                    <span class="btn-icon">📂</span> Open Output
                </button>
            </div>
        </div>

        <!-- Progress Panel -->
        <div id="progress-panel" class="panel" style="display:none">
            <div class="progress-header">
                <span class="progress-title">🔄 Processing...</span>
                <span id="progress-pct" class="progress-pct">0%</span>
            </div>
            <div class="progress-bar-wrap">
                <div id="progress-bar" class="progress-bar" style="width:0%"></div>
            </div>

            <!-- Stage indicators -->
            <div class="stages">
                <div class="stage" id="stage-DOWNLOAD">
                    <span class="stage-icon">⬇️</span>
                    <span class="stage-name">Download</span>
                    <span class="stage-status">—</span>
                </div>
                <div class="stage" id="stage-FRAME_EXTRACT">
                    <span class="stage-icon">🎞️</span>
                    <span class="stage-name">Frames</span>
                    <span class="stage-status">—</span>
                </div>
                <div class="stage" id="stage-SCREEN_DETECT">
                    <span class="stage-icon">🤖</span>
                    <span class="stage-name">Detect</span>
                    <span class="stage-status">—</span>
                </div>
                <div class="stage" id="stage-NOTEBOOK_BUILD">
                    <span class="stage-icon">📓</span>
                    <span class="stage-name">Notebooks</span>
                    <span class="stage-status">—</span>
                </div>
                <div class="stage" id="stage-LLM_REFINE">
                    <span class="stage-icon">✨</span>
                    <span class="stage-name">Refine</span>
                    <span class="stage-status">—</span>
                </div>
            </div>
        </div>

        <!-- Log Terminal -->
        <div id="log-panel" class="panel log-panel" style="display:none">
            <div class="log-header">
                <span>📋 Live Logs</span>
                <button id="btn-clear-logs" class="icon-btn small" title="Clear logs">🗑️</button>
            </div>
            <div id="log-output" class="log-output" aria-live="polite"></div>
        </div>

        <!-- Completion Panel -->
        <div id="complete-panel" class="panel complete-panel" style="display:none">
            <div class="complete-icon">🎉</div>
            <h2>Notebooks Ready!</h2>
            <p id="complete-summary"></p>
            <button id="btn-open-final" class="btn-primary">
                📂 Open lecture_code Folder
            </button>
            <button id="btn-new-extraction" class="btn-secondary">
                ▶ New Extraction
            </button>
        </div>
    </div>

    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
    }
}

function getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
