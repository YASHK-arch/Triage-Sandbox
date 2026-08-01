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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const sidebarProvider_1 = require("./sidebarProvider");
const terminalManager_1 = require("./terminalManager");
let terminalManager;
function activate(context) {
    console.log('[LectureForge] Extension activating...');
    terminalManager = new terminalManager_1.TerminalManager(context);
    const sidebarProvider = new sidebarProvider_1.LectureForgeSidebarProvider(context, terminalManager);
    // Register sidebar WebView
    const sidebarDisposable = vscode.window.registerWebviewViewProvider('lectureforge.sidebar', sidebarProvider, { webviewOptions: { retainContextWhenHidden: true } });
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
        const ollamaHost = config.get('ollamaHost', 'http://localhost:11434');
        try {
            const response = await fetch(`${ollamaHost}/api/tags`);
            if (response.ok) {
                const data = await response.json();
                const models = (data.models || []).map((m) => m.name).join(', ');
                vscode.window.showInformationMessage(`✅ Ollama is running. Models: ${models || 'none'}`);
            }
            else {
                vscode.window.showWarningMessage(`⚠️ Ollama responded with status ${response.status}`);
            }
        }
        catch (e) {
            vscode.window.showErrorMessage(`❌ Cannot connect to Ollama at ${ollamaHost}. ` +
                'Please install Ollama from https://ollama.ai and run: ollama pull moondream2');
        }
    });
    context.subscriptions.push(sidebarDisposable, openSidebar, startExtraction, openOutput, checkOllama);
    console.log('[LectureForge] Extension activated.');
}
function deactivate() {
    terminalManager?.dispose();
}
//# sourceMappingURL=extension.js.map