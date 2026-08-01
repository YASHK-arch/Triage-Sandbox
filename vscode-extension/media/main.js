// @ts-check
// LectureForge Sidebar WebView Script
// This runs inside the VSCode WebView (sandboxed browser context)

(function () {
    'use strict';

    // VSCode API
    const vscode = acquireVsCodeApi();

    // ── DOM References ─────────────────────────────────────────────────────────
    const $ = (/** @type {string} */ id) => document.getElementById(id);

    const statusBar = $('status-bar');
    const statusDot = $('status-dot');
    const statusText = $('status-text');

    const formPanel = $('form-panel');
    const progressPanel = $('progress-panel');
    const logPanel = $('log-panel');
    const completePanel = $('complete-panel');

    const youtubeUrlInput = /** @type {HTMLInputElement} */ ($('youtube-url'));
    const outputDirInput = /** @type {HTMLInputElement} */ ($('output-dir'));
    const localModelSelect = /** @type {HTMLSelectElement} */ ($('local-model'));
    const cloudProviderSelect = /** @type {HTMLSelectElement} */ ($('cloud-provider'));
    const apiKeyInput = /** @type {HTMLInputElement} */ ($('api-key'));
    const apiKeyLabel = $('api-key-label');
    const frameFpsInput = /** @type {HTMLInputElement} */ ($('frame-fps'));
    const minSegmentInput = /** @type {HTMLInputElement} */ ($('min-segment'));
    const maxScreenshotsInput = /** @type {HTMLInputElement} */ ($('max-screenshots'));
    const useWhisperCb = /** @type {HTMLInputElement} */ ($('use-whisper'));
    const embedImagesCb = /** @type {HTMLInputElement} */ ($('embed-images'));

    const btnStart = $('btn-start');
    const btnCancel = $('btn-cancel');
    const btnOpenOutput = $('btn-open-output');
    const btnOpenFinal = $('btn-open-final');
    const btnNewExtraction = $('btn-new-extraction');
    const btnSaveKey = $('btn-save-key');
    const btnSettings = $('btn-settings');
    const btnCheckOllama = $('btn-check-ollama');
    const btnClearLogs = $('btn-clear-logs');

    const progressBar = $('progress-bar');
    const progressPct = $('progress-pct');
    const logOutput = $('log-output');
    const completeSummary = $('complete-summary');

    // ── State ───────────────────────────────────────────────────────────────────
    let currentJobId = null;
    let currentOutputDir = null;
    let stageStats = {};

    // ── Event Listeners ─────────────────────────────────────────────────────────
    btnStart?.addEventListener('click', handleStart);
    btnCancel?.addEventListener('click', handleCancel);
    btnOpenOutput?.addEventListener('click', () => vscode.postMessage({ command: 'openOutput' }));
    btnOpenFinal?.addEventListener('click', () => vscode.postMessage({ command: 'openOutput' }));
    btnNewExtraction?.addEventListener('click', resetToForm);
    btnSaveKey?.addEventListener('click', saveApiKey);
    btnSettings?.addEventListener('click', () => vscode.postMessage({ command: 'openSettings' }));
    btnCheckOllama?.addEventListener('click', () => vscode.postMessage({ command: 'checkOllama' }));
    btnClearLogs?.addEventListener('click', clearLogs);

    cloudProviderSelect?.addEventListener('change', updateApiKeyLabel);

    // ── Request settings on load ────────────────────────────────────────────────
    vscode.postMessage({ command: 'getSettings' });

    // ── Message Handler (from extension host) ──────────────────────────────────
    window.addEventListener('message', (event) => {
        const msg = event.data;
        switch (msg.command) {
            case 'settingsLoaded':
                applySettings(msg.settings);
                break;
            case 'extractionStarted':
                onExtractionStarted(msg.jobId, msg.outputDir);
                break;
            case 'logEvent':
                onLogEvent(msg.event);
                break;
            case 'extractionComplete':
                onExtractionComplete();
                break;
            case 'extractionCancelled':
                onExtractionCancelled();
                break;
            case 'backendStarting':
                setStatus('running', '⏳ Starting backend server...');
                break;
            case 'backendStartProgress':
                setStatus('running', `⏳ Backend starting... (${msg.attempt}/30)`);
                break;
            case 'backendReady':
                setStatus('running', '✅ Backend ready');
                break;
            case 'error':
                onError(msg.message);
                break;
            case 'triggerStart':
                handleStart();
                break;
        }
    });

    // ── Functions ───────────────────────────────────────────────────────────────

    function handleStart() {
        const url = youtubeUrlInput?.value?.trim();
        if (!url) {
            showInlineError('Please enter a YouTube URL');
            youtubeUrlInput?.focus();
            return;
        }

        const apiKey = apiKeyInput?.value?.trim();
        if (!apiKey) {
            showInlineError(`Please enter your ${cloudProviderSelect?.value || 'cloud LLM'} API key`);
            apiKeyInput?.focus();
            return;
        }

        const payload = {
            youtubeUrl: url,
            outputDir: outputDirInput?.value?.trim() || '',
            localModel: localModelSelect?.value || 'moondream2',
            cloudProvider: cloudProviderSelect?.value || 'claude',
            apiKey: apiKey,
            frameFps: parseFloat(frameFpsInput?.value || '2'),
            minSegmentSec: parseFloat(minSegmentInput?.value || '10'),
            maxScreenshots: parseInt(maxScreenshotsInput?.value || '5'),
            useWhisper: useWhisperCb?.checked ?? true,
            embedImages: embedImagesCb?.checked ?? true,
        };

        vscode.postMessage({ command: 'startExtraction', payload });
        setStatus('running', '⏳ Initializing...');
    }

    function handleCancel() {
        if (currentJobId) {
            vscode.postMessage({ command: 'cancelExtraction', jobId: currentJobId });
        }
    }

    function onExtractionStarted(jobId, outputDir) {
        currentJobId = jobId;
        currentOutputDir = outputDir;
        stageStats = {};

        // Show progress UI
        formPanel.style.display = 'none';
        progressPanel.style.display = 'block';
        logPanel.style.display = 'block';
        completePanel.style.display = 'none';

        btnStart.style.display = 'none';
        btnCancel.style.display = 'flex';
        btnOpenOutput.style.display = 'none';

        clearLogs();
        resetStages();
        setStatus('running', `🔄 Job ${jobId} — Processing...`);

        addLog({
            ts: new Date().toISOString(),
            stage: 'SYSTEM',
            message: `Job ${jobId} started. Output: ${outputDir}`,
            level: 'info',
            progress: 0,
        });
    }

    function onLogEvent(event) {
        addLog(event);
        updateProgress(event.progress);
        updateStage(event.stage, event.level);
        setStatus('running', `[${event.stage}] ${event.message}`);
    }

    function onExtractionComplete() {
        setStatus('success', '✅ Extraction complete!');

        formPanel.style.display = 'none';
        progressPanel.style.display = 'none';
        logPanel.style.display = 'block';
        completePanel.style.display = 'block';

        btnStart.style.display = 'none';
        btnCancel.style.display = 'none';
        btnOpenOutput.style.display = 'flex';

        updateProgress(1.0);
        markAllStagesDone();

        if (completeSummary) {
            completeSummary.textContent =
                `Your lecture notebooks are ready in the lecture_code folder. ` +
                `Click below to open them in your file explorer.`;
        }
    }

    function onExtractionCancelled() {
        setStatus('warning', '⚠️ Extraction cancelled');
        resetToForm();
        addLog({
            ts: new Date().toISOString(),
            stage: 'SYSTEM',
            message: 'Extraction cancelled by user',
            level: 'warning',
            progress: 0,
        });
    }

    function onError(message) {
        setStatus('error', `❌ ${message}`);
        addLog({
            ts: new Date().toISOString(),
            stage: 'ERROR',
            message: message,
            level: 'error',
            progress: 0,
        });

        // Re-enable form
        btnStart.style.display = 'flex';
        btnCancel.style.display = 'none';
        formPanel.style.display = 'block';
    }

    function addLog(event) {
        if (!logOutput) return;

        const entry = document.createElement('div');
        entry.className = `log-entry ${event.level}`;

        const ts = new Date(event.ts).toLocaleTimeString('en', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        entry.innerHTML = `
            <span class="log-ts">${ts}</span>
            <span class="log-stage">[${event.stage}]</span>
            <span class="log-msg">${escapeHtml(event.message)}</span>
        `;
        logOutput.appendChild(entry);

        // Auto-scroll to bottom
        logOutput.scrollTop = logOutput.scrollHeight;

        // Keep log size manageable
        while (logOutput.children.length > 500) {
            logOutput.removeChild(logOutput.firstChild);
        }
    }

    function updateProgress(progress) {
        const pct = Math.round(progress * 100);
        if (progressBar) progressBar.style.width = `${pct}%`;
        if (progressPct) progressPct.textContent = `${pct}%`;
    }

    function updateStage(stageName, level) {
        const el = $(`stage-${stageName}`);
        if (!el) return;

        el.classList.remove('active', 'done', 'error');

        if (level === 'error') {
            el.classList.add('error');
            el.querySelector('.stage-status').textContent = 'ERR';
        } else {
            el.classList.add('active');
            el.querySelector('.stage-status').textContent = '▶';
        }
    }

    function markAllStagesDone() {
        const stageIds = ['DOWNLOAD', 'FRAME_EXTRACT', 'SCREEN_DETECT', 'NOTEBOOK_BUILD', 'LLM_REFINE'];
        for (const id of stageIds) {
            const el = $(`stage-${id}`);
            if (el) {
                el.classList.remove('active', 'error');
                el.classList.add('done');
                el.querySelector('.stage-status').textContent = '✓';
            }
        }
    }

    function resetStages() {
        const stageIds = ['DOWNLOAD', 'FRAME_EXTRACT', 'SCREEN_DETECT', 'NOTEBOOK_BUILD', 'LLM_REFINE'];
        for (const id of stageIds) {
            const el = $(`stage-${id}`);
            if (el) {
                el.classList.remove('active', 'done', 'error');
                el.querySelector('.stage-status').textContent = '—';
            }
        }
    }

    function resetToForm() {
        currentJobId = null;
        formPanel.style.display = 'block';
        progressPanel.style.display = 'none';
        completePanel.style.display = 'none';
        btnStart.style.display = 'flex';
        btnCancel.style.display = 'none';
        btnOpenOutput.style.display = currentOutputDir ? 'flex' : 'none';
        updateProgress(0);
        resetStages();
        setStatus('idle', 'Ready');
    }

    function setStatus(type, text) {
        if (!statusBar) return;
        statusBar.className = `status-bar ${type}`;
        if (statusText) statusText.textContent = text;
    }

    function clearLogs() {
        if (logOutput) logOutput.innerHTML = '';
    }

    function updateApiKeyLabel() {
        const provider = cloudProviderSelect?.value || 'claude';
        const labels = {
            claude: 'Anthropic API Key (Claude)',
            groq: 'Groq API Key (free tier available)',
        };
        if (apiKeyLabel) apiKeyLabel.textContent = labels[provider] || 'API Key';
        if (apiKeyInput) apiKeyInput.placeholder = `Enter your ${provider} API key...`;
    }

    function saveApiKey() {
        const key = apiKeyInput?.value?.trim();
        const provider = cloudProviderSelect?.value || 'claude';
        if (!key) {
            showInlineError('Please enter an API key first');
            return;
        }
        vscode.postMessage({ command: 'saveApiKey', provider, key });
    }

    function applySettings(settings) {
        if (!settings) return;
        if (localModelSelect && settings.defaultLocalModel) {
            localModelSelect.value = settings.defaultLocalModel;
        }
        if (cloudProviderSelect && settings.defaultCloudProvider) {
            cloudProviderSelect.value = settings.defaultCloudProvider;
        }
        if (apiKeyInput) {
            const provider = settings.defaultCloudProvider || 'claude';
            const key = provider === 'claude' ? settings.claudeApiKey : settings.groqApiKey;
            if (key) apiKeyInput.value = key;
        }
        if (outputDirInput && settings.outputDir) {
            outputDirInput.value = settings.outputDir;
        }
        if (frameFpsInput && settings.frameSampleFps) {
            frameFpsInput.value = String(settings.frameSampleFps);
        }
        if (useWhisperCb) {
            useWhisperCb.checked = settings.useWhisperFallback ?? true;
        }
        updateApiKeyLabel();
    }

    function showInlineError(message) {
        setStatus('error', `❌ ${message}`);
        setTimeout(() => setStatus('idle', 'Ready'), 3000);
    }

    function escapeHtml(text) {
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

})();
