import * as vscode from 'vscode';
import { SkillsApiClient } from '../api/client';
import { getApiKey, readConfig } from '../config';
import { installSkill, uninstallSkill } from '../installer';
import { SkillNode, SkillsTreeProvider } from '../tree/skillsProvider';

export async function updateSkillCommand(
  context: vscode.ExtensionContext,
  provider: SkillsTreeProvider,
  node: SkillNode | undefined
): Promise<void> {
  if (!node || node.kind !== 'skill' || !node.installed) {
    vscode.window.showWarningMessage('Pick an installed skill to update.');
    return;
  }
  const cfg = readConfig();
  const apiKey = await getApiKey(context);
  if (!cfg.apiUrl || !apiKey) {
    vscode.window.showErrorMessage('Configure apiUrl and API key first.');
    return;
  }

  const installed = node.installed;
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Updating ${installed.entry.name}…`
    },
    async () => {
      try {
        const client = new SkillsApiClient(cfg.apiUrl, apiKey, cfg.requestTimeoutMs);
        const detail = await client.getSkill(installed.entry.id);

        // Remove the old directory then re-install in the same location.
        await uninstallSkill(installed.rootDir, installed.entry.id, installed.entry.installPath);
        const entry = await installSkill(client, {
          detail,
          installRoot: installed.rootDir,
          scope: installed.scope,
          source: cfg.apiUrl
        });
        provider.refresh();
        vscode.window.showInformationMessage(
          `Updated ${entry.name} to v${entry.installedVersion}.`
        );
      } catch (err) {
        vscode.window.showErrorMessage(`Update failed: ${(err as Error).message}`);
      }
    }
  );
}
