import * as vscode from 'vscode';
import { createApiClient } from '../auth';
import { readConfig } from '../config';
import { installAgent } from '../agentInstaller';
import { AgentsTreeProvider, AgentNode } from '../tree/agentsProvider';
import { pickAgentInstallTarget } from './pickAgentInstallTarget';

export async function installAgentCommand(
  context: vscode.ExtensionContext,
  provider: AgentsTreeProvider,
  node: AgentNode | undefined
): Promise<void> {
  if (!node || node.kind !== 'agent') {
    vscode.window.showWarningMessage('Pick an agent in the tree first.');
    return;
  }
  const cfg = readConfig();
  const client = await createApiClient(context, { interactive: true });
  if (!client) return;

  const target = await pickAgentInstallTarget(cfg);
  if (!target) return;

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Installing ${node.agent.metadata.name}…`
    },
    async () => {
      try {
        const detail = await client.getAgent(node.agent.id);
        const entry = await installAgent(client, {
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
