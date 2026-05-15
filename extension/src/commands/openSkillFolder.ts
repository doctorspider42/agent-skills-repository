import * as vscode from 'vscode';
import { SkillNode } from '../tree/skillsProvider';

export async function openSkillFolderCommand(node: SkillNode | undefined): Promise<void> {
  if (!node || node.kind !== 'skill' || !node.installed) {
    vscode.window.showWarningMessage('Pick an installed skill first.');
    return;
  }
  const uri = vscode.Uri.file(node.installed.entry.installPath);
  await vscode.commands.executeCommand('revealFileInOS', uri);
}
