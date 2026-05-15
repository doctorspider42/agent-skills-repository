import * as vscode from 'vscode';
import { ResolvedConfig, resolveScopePath } from '../config';
import { InstallScope } from '../types';

export interface InstallTarget {
  scope: InstallScope;
  rootDir: string;
}

interface PickItem extends vscode.QuickPickItem {
  scope?: InstallScope;
  rootDir?: string;
  custom?: boolean;
}

export async function pickInstallTarget(cfg: ResolvedConfig): Promise<InstallTarget | undefined> {
  const items: PickItem[] = [];

  const globalPath = resolveScopePath('global', cfg);
  if (globalPath) {
    items.push({
      label: '$(globe) Global',
      description: globalPath,
      detail: 'Available to every Claude Code session for the current user.',
      scope: 'global',
      rootDir: globalPath
    });
  }

  const projectPath = resolveScopePath('project', cfg);

  if (projectPath) {
    items.push({
      label: `$(folder) Project — ${cfg.projectSkillsPath}`,
      description: projectPath,
      detail: 'Lives in the current workspace and is committed with the repo.',
      scope: 'project',
      rootDir: projectPath
    });
  } else {
    // Relative projectSkillsPath but no workspace folder open — show the option
    // anyway so the user knows it exists, with a clear "open a folder first" hint.
    items.push({
      label: `$(folder) Project — ${cfg.projectSkillsPath}`,
      description: '(no workspace folder open)',
      detail: 'Open a workspace folder to enable the Project scope, or use Custom below.',
      scope: 'project',
      rootDir: ''
    });
  }

  items.push({
    label: '$(edit) Custom location…',
    detail: 'Pick a directory manually.',
    custom: true
  });

  const pick = await vscode.window.showQuickPick(items, {
    title: 'Install Skill — choose location',
    placeHolder: 'Where should the skill be installed?',
    ignoreFocusOut: true
  });
  if (!pick) return undefined;

  if (pick.custom) {
    const folderPick = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: 'Install here'
    });
    if (!folderPick || folderPick.length === 0) return undefined;

    const scopeChoice = await vscode.window.showQuickPick(
      [
        { label: 'global', detail: 'Recorded as a global install in the manifest.' },
        { label: 'project', detail: 'Recorded as a project install in the manifest.' }
      ],
      { title: 'Scope label for this install', ignoreFocusOut: true }
    );
    if (!scopeChoice) return undefined;

    return {
      scope: scopeChoice.label as InstallScope,
      rootDir: folderPick[0].fsPath
    };
  }

  if (pick.scope === 'project' && !pick.rootDir) {
    const choice = await vscode.window.showWarningMessage(
      'Project scope needs an open workspace folder.',
      { modal: true },
      'Open Folder…'
    );
    if (choice === 'Open Folder…') {
      await vscode.commands.executeCommand('vscode.openFolder');
    }
    return undefined;
  }

  return { scope: pick.scope!, rootDir: pick.rootDir! };
}
