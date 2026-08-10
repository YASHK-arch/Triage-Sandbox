import * as vscode from 'vscode';

export function activateTelemetry(context: vscode.ExtensionContext) {
  const reporter = new TelemetryReporter('extension.id', '1.0.0', 'key');
  context.subscriptions.push(reporter);
  reporter.sendTelemetryEvent('extension_activated');
}