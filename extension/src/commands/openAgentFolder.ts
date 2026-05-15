import * as vscode from 'vscode';
import { AgentNode } from '../tree/agentsProvider';

export async function openAgentFolderCommand(node: AgentNode | undefined): Promise<void> {
  if (!node || node.kind !== 'agent' || !node.installed) {
    vscode.window.showWarningMessage('Pick an installed agent first.');
    return;
  }
  const uri = vscode.Uri.file(node.installed.entry.installPath);
  await vscode.commands.executeCommand('revealFileInOS', uri);
}
