import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as cp from 'child_process';

export class TerminalManager {
    private _terminal?: vscode.Terminal;
    private _backendProcess?: cp.ChildProcess;
    private _context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
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
    public async startBackend(port: number): Promise<boolean> {
        const config = vscode.workspace.getConfiguration('lectureforge');
        const pythonPath = config.get<string>('pythonPath', 'python');

        // Find backend directory (relative to extension)
        const extensionDir = this._context.extensionUri.fsPath;
        const backendDir = path.resolve(extensionDir, '..', 'backend');

        if (!fs.existsSync(backendDir)) {
            vscode.window.showErrorMessage(
                `LectureForge backend not found at: ${backendDir}. ` +
                'Please ensure the backend folder exists next to the extension.'
            );
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
        } catch { /* not running */ }

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
        this._terminal.sendText(
            'echo "╔══════════════════════════════════════╗" && ' +
            'echo "║       LectureForge Backend           ║" && ' +
            'echo "╚══════════════════════════════════════╝"'
        );

        // Install dependencies check
        this._terminal.sendText(
            `${pythonPath} -c "import fastapi" 2>/dev/null || ` +
            `(echo "[LectureForge] Installing backend dependencies..." && ` +
            `${pythonPath} -m pip install -r requirements.txt --quiet)`
        );

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

        vscode.window.showInformationMessage(
            '🎓 LectureForge backend starting... Check the terminal for logs.',
        );

        return true;
    }

    /**
     * Show a message in the terminal with LectureForge prefix.
     */
    public log(message: string) {
        this._terminal?.sendText(`echo "[LectureForge] ${message}"`);
    }

    /**
     * Open the output directory in a new VSCode window.
     */
    public openDirectory(dirPath: string) {
        if (fs.existsSync(dirPath)) {
            vscode.commands.executeCommand(
                'vscode.openFolder',
                vscode.Uri.file(dirPath),
                { forceNewWindow: false }
            );
        }
    }

    public dispose() {
        this._backendProcess?.kill();
        // Note: We intentionally don't dispose the terminal so users can see logs after
    }
}
