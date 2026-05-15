import * as vscode from 'vscode';
import { SkillsApiClient } from '../api/client';
import { getApiKey, readConfig } from '../config';

export async function testConnection(context: vscode.ExtensionContext): Promise<void> {
  const cfg = readConfig();
  if (!cfg.apiUrl) {
    vscode.window.showWarningMessage('Set "agentSkills.apiUrl" first.');
    return;
  }
  const apiKey = await getApiKey(context);
  if (!apiKey) {
    vscode.window.showWarningMessage('No API key configured. Run "Agent Skills: Set API Key".');
    return;
  }

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'Testing Skills API…' },
    async () => {
      try {
        const client = new SkillsApiClient(cfg.apiUrl, apiKey, cfg.requestTimeoutMs);
        await client.verify();
        vscode.window.showInformationMessage(`Connection OK — ${cfg.apiUrl}`);
      } catch (err) {
        vscode.window.showErrorMessage(`Connection failed: ${(err as Error).message}`);
      }
    }
  );
}
