import * as vscode from 'vscode';
import { uninstallAgent } from '../agentInstaller';
import { AgentNode, AgentsTreeProvider } from '../tree/agentsProvider';

export async function uninstallAgentCommand(
  provider: AgentsTreeProvider,
  node: AgentNode | undefined
): Promise<void> {
  if (!node || node.kind !== 'agent' || !node.installed) {
    vscode.window.showWarningMessage('Pick an installed agent in the tree first.');
    return;
  }

  const choice = await vscode.window.showWarningMessage(
    `Uninstall ${node.installed.entry.name}? Files at ${node.installed.entry.installPath} will be deleted.`,
    { modal: true },
    'Uninstall'
  );
  if (choice !== 'Uninstall') return;

  try {
    await uninstallAgent(
      node.installed.rootDir,
      node.installed.entry.id,
      node.installed.entry.installPath
    );
    provider.refresh();
    vscode.window.showInformationMessage(`Uninstalled ${node.installed.entry.name}.`);
  } catch (err) {
    vscode.window.showErrorMessage(`Uninstall failed: ${(err as Error).message}`);
  }
}
