import * as vscode from 'vscode';
import { createApiClient } from '../auth';
import { readConfig } from '../config';
import { installAgent, uninstallAgent } from '../agentInstaller';
import { AgentNode, AgentsTreeProvider } from '../tree/agentsProvider';

export async function updateAgentCommand(
  context: vscode.ExtensionContext,
  provider: AgentsTreeProvider,
  node: AgentNode | undefined
): Promise<void> {
  if (!node || node.kind !== 'agent' || !node.installed) {
    vscode.window.showWarningMessage('Pick an installed agent to update.');
    return;
  }
  const cfg = readConfig();
  const client = await createApiClient(context, { interactive: true });
  if (!client) return;

  const installed = node.installed;
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Updating ${installed.entry.name}…`
    },
    async () => {
      try {
        const detail = await client.getAgent(installed.entry.id);

        await uninstallAgent(installed.rootDir, installed.entry.id, installed.entry.installPath);
        const entry = await installAgent(client, {
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
