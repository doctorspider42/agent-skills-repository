import * as vscode from 'vscode';
import { uninstallSkill } from '../installer';
import { SkillNode, SkillsTreeProvider } from '../tree/skillsProvider';

export async function uninstallSkillCommand(
  provider: SkillsTreeProvider,
  node: SkillNode | undefined
): Promise<void> {
  if (!node || node.kind !== 'skill' || !node.installed) {
    vscode.window.showWarningMessage('Pick an installed skill in the tree first.');
    return;
  }

  const choice = await vscode.window.showWarningMessage(
    `Uninstall ${node.installed.entry.name}? Files at ${node.installed.entry.installPath} will be deleted.`,
    { modal: true },
    'Uninstall'
  );
  if (choice !== 'Uninstall') return;

  try {
    await uninstallSkill(
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
