import * as vscode from 'vscode';
import { createApiClient } from '../auth';
import { readConfig } from '../config';

export async function testConnection(context: vscode.ExtensionContext): Promise<void> {
  const cfg = readConfig();
  if (!cfg.apiUrl) {
    vscode.window.showWarningMessage('Set "agentSkills.apiUrl" first.');
    return;
  }

  const client = await createApiClient(context, { interactive: true });
  if (!client) return;

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'Testing Skills API…' },
    async () => {
      try {
        const res = await client.verify();
        const who = res.user?.email || res.user?.name;
        const modeLabel =
          cfg.authMode === 'entra' && who ? ` — signed in as ${who}` : '';
        vscode.window.showInformationMessage(
          `Connection OK — ${cfg.apiUrl}${modeLabel}`
        );
      } catch (err) {
        vscode.window.showErrorMessage(`Connection failed: ${(err as Error).message}`);
      }
    }
  );
}
