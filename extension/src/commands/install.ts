import * as vscode from 'vscode';
import { SkillsApiClient } from '../api/client';
import { getApiKey, readConfig } from '../config';
import { installSkill } from '../installer';
import { SkillsTreeProvider } from '../tree/skillsProvider';
import { SkillNode } from '../tree/skillsProvider';
import { pickInstallTarget } from './pickInstallTarget';

export async function installSkillCommand(
  context: vscode.ExtensionContext,
  provider: SkillsTreeProvider,
  node: SkillNode | undefined
): Promise<void> {
  if (!node || node.kind !== 'skill') {
    vscode.window.showWarningMessage('Pick a skill in the tree first.');
    return;
  }
  const cfg = readConfig();
  const apiKey = await getApiKey(context);
  if (!cfg.apiUrl || !apiKey) {
    vscode.window.showErrorMessage('Configure apiUrl and API key first.');
    return;
  }

  const target = await pickInstallTarget(cfg);
  if (!target) return;

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Installing ${node.skill.metadata.name}…`
    },
    async () => {
      try {
        const client = new SkillsApiClient(cfg.apiUrl, apiKey, cfg.requestTimeoutMs);
        const detail = await client.getSkill(node.skill.id);
        const entry = await installSkill(client, {
          detail,
          installRoot: target.rootDir,
          scope: target.scope,
          source: cfg.apiUrl
        });
        provider.refresh();
        vscode.window.showInformationMessage(
          `Installed ${entry.name} v${entry.installedVersion} → ${entry.installPath}`
        );
      } catch (err) {
        vscode.window.showErrorMessage(`Install failed: ${(err as Error).message}`);
      }
    }
  );
}
