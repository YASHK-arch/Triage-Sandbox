"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.TerminalManager = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
class TerminalManager {
    constructor(context) {
        this._context = context;
        // Clean up terminal on context dispose
        context.subscriptions.push({
            dispose: () => this.dispose(),
        });
    }
    /**
     * Start the FastAPI backend server in the integrated terminal.
     * Shows a dedicated "LectureForge Backend" terminal with live logs.
     */
    async startBackend(port) {
        const config = vscode.workspace.getConfiguration('lectureforge');
        const pythonPath = config.get('pythonPath', 'python');
        // Find backend directory (relative to extension)
        const extensionDir = this._context.extensionUri.fsPath;
        const backendDir = path.resolve(extensionDir, '..', 'backend');
        if (!fs.existsSync(backendDir)) {
            vscode.window.showErrorMessage(`LectureForge backend not found at: ${backendDir}. ` +
                'Please ensure the backend folder exists next to the extension.');
            return false;
        }
        // Check if backend is already running on port
        try {
            const resp = await fetch(`http://127.0.0.1:${port}/api/health`, {
                signal: AbortSignal.timeout(1000),
            });
            if (resp.ok) {
                return true; // Already running
            }
        }
        catch { /* not running */ }
        // Create or reuse the LectureForge terminal
        this._terminal?.dispose();
        this._terminal = vscode.window.createTerminal({
            name: '🎓 LectureForge',
            cwd: backendDir,
            env: {
                ...process.env,
                PYTHONUNBUFFERED: '1',
                PYTHONPATH: backendDir,
            },
            iconPath: new vscode.ThemeIcon('book'),
            color: new vscode.ThemeColor('terminal.ansiCyan'),
        });
        this._terminal.show(false); // false = don't steal focus
        // Print banner
        this._terminal.sendText('echo "╔══════════════════════════════════════╗" && ' +
            'echo "║       LectureForge Backend           ║" && ' +
            'echo "╚══════════════════════════════════════╝"');
        // Install dependencies check
        this._terminal.sendText(`${pythonPath} -c "import fastapi" 2>/dev/null || ` +
            `(echo "[LectureForge] Installing backend dependencies..." && ` +
            `${pythonPath} -m pip install -r requirements.txt --quiet)`);
        // Start uvicorn server
        const startCmd = [
            pythonPath,
            '-m', 'uvicorn',
            'main:app',
            '--host', '127.0.0.1',
            '--port', String(port),
            '--log-level', 'info',
            '--no-access-log',
        ].join(' ');
        this._terminal.sendText(`echo "[LectureForge] Starting server on port ${port}..." && ${startCmd}`);
        vscode.window.showInformationMessage('🎓 LectureForge backend starting... Check the terminal for logs.');
        return true;
    }
    /**
     * Show a message in the terminal with LectureForge prefix.
     */
    log(message) {
        this._terminal?.sendText(`echo "[LectureForge] ${message}"`);
    }
    /**
     * Open the output directory in a new VSCode window.
     */
    openDirectory(dirPath) {
        if (fs.existsSync(dirPath)) {
            vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(dirPath), { forceNewWindow: false });
        }
    }
    dispose() {
        this._backendProcess?.kill();
        // Note: We intentionally don't dispose the terminal so users can see logs after
    }
}
exports.TerminalManager = TerminalManager;
//# sourceMappingURL=terminalManager.js.map