import * as vscode from 'vscode';
import { LectureForgeSidebarProvider } from './sidebarProvider';
import { TerminalManager } from './terminalManager';

let terminalManager: TerminalManager;

export function activate(context: vscode.ExtensionContext) {
    console.log('[LectureForge] Extension activating...');

    terminalManager = new TerminalManager(context);
    const sidebarProvider = new LectureForgeSidebarProvider(context, terminalManager);

    // Register sidebar WebView
    const sidebarDisposable = vscode.window.registerWebviewViewProvider(
        'lectureforge.sidebar',
        sidebarProvider,
        { webviewOptions: { retainContextWhenHidden: true } }
    );

    // Register commands
    const openSidebar = vscode.commands.registerCommand('lectureforge.openSidebar', () => {
        vscode.commands.executeCommand('workbench.view.extension.lectureforge');
    });

    const startExtraction = vscode.commands.registerCommand('lectureforge.startExtraction', () => {
        sidebarProvider.triggerExtraction();
    });

    const openOutput = vscode.commands.registerCommand('lectureforge.openOutput', () => {
        sidebarProvider.openOutputFolder();
    });

    const checkOllama = vscode.commands.registerCommand('lectureforge.checkOllama', async () => {
        const config = vscode.workspace.getConfiguration('lectureforge');
        const ollamaHost = config.get<string>('ollamaHost', 'http://localhost:11434');
        try {
            const response = await fetch(`${ollamaHost}/api/tags`);
            if (response.ok) {
                const data = await response.json() as { models?: Array<{ name: string }> };
                const models = (data.models || []).map((m: { name: string }) => m.name).join(', ');
                vscode.window.showInformationMessage(`✅ Ollama is running. Models: ${models || 'none'}`);
            } else {
                vscode.window.showWarningMessage(`⚠️ Ollama responded with status ${response.status}`);
            }
        } catch (e) {
            vscode.window.showErrorMessage(
                `❌ Cannot connect to Ollama at ${ollamaHost}. ` +
                'Please install Ollama from https://ollama.ai and run: ollama pull moondream2'
            );
        }
    });

    context.subscriptions.push(
        sidebarDisposable,
        openSidebar,
        startExtraction,
        openOutput,
        checkOllama,
    );

    console.log('[LectureForge] Extension activated.');
}

export function deactivate() {
    terminalManager?.dispose();
}
