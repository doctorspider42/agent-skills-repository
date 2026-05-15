import * as vscode from 'vscode';
import { ResolvedConfig, resolveAgentsScopePath } from '../config';
import { InstallScope } from '../types';

export interface AgentInstallTarget {
  scope: InstallScope;
  rootDir: string;
}

interface PickItem extends vscode.QuickPickItem {
  scope?: InstallScope;
  rootDir?: string;
  custom?: boolean;
}

export async function pickAgentInstallTarget(
  cfg: ResolvedConfig
): Promise<AgentInstallTarget | undefined> {
  const items: PickItem[] = [];

  const globalPath = resolveAgentsScopePath('global', cfg);
  if (globalPath) {
    items.push({
      label: '$(globe) Global',
      description: globalPath,
      detail: 'Available to every Claude Code session for the current user.',
      scope: 'global',
      rootDir: globalPath
    });
  }

  const projectPath = resolveAgentsScopePath('project', cfg);

  if (projectPath) {
    items.push({
      label: `$(folder) Project — ${cfg.projectAgentsPath}`,
      description: projectPath,
      detail: 'Lives in the current workspace and is committed with the repo.',
      scope: 'project',
      rootDir: projectPath
    });
  } else {
    items.push({
      label: `$(folder) Project — ${cfg.projectAgentsPath}`,
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
    title: 'Install Agent — choose location',
    placeHolder: 'Where should the agent be installed?',
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
