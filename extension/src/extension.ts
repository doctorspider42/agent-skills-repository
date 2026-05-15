import * as vscode from 'vscode';
import { SkillsTreeProvider, SkillNode } from './tree/skillsProvider';
import { installSkillCommand } from './commands/install';
import { uninstallSkillCommand } from './commands/uninstall';
import { updateSkillCommand } from './commands/update';
import { testConnection } from './commands/testConnection';
import { setApiKeyCommand, clearApiKeyCommand } from './commands/setApiKey';
import { openSkillFolderCommand } from './commands/openSkillFolder';
import { registerSkillPreviewProvider } from './commands/preview';
import { SettingsPanel } from './webview/settingsPanel';

export function activate(context: vscode.ExtensionContext): void {
  const provider = new SkillsTreeProvider(context);
  const previewProvider = registerSkillPreviewProvider(context);

  const view = vscode.window.createTreeView('agentSkillsExplorer', {
    treeDataProvider: provider,
    showCollapseAll: true
  });
  context.subscriptions.push(view);

  context.subscriptions.push(
    vscode.commands.registerCommand('agentSkills.refresh', () => provider.refresh()),
    vscode.commands.registerCommand('agentSkills.testConnection', () => testConnection(context)),
    vscode.commands.registerCommand('agentSkills.setApiKey', () => setApiKeyCommand(context)),
    vscode.commands.registerCommand('agentSkills.clearApiKey', () => clearApiKeyCommand(context)),
    vscode.commands.registerCommand('agentSkills.install', (node?: SkillNode) =>
      installSkillCommand(context, provider, node)
    ),
    vscode.commands.registerCommand('agentSkills.uninstall', (node?: SkillNode) =>
      uninstallSkillCommand(provider, node)
    ),
    vscode.commands.registerCommand('agentSkills.update', (node?: SkillNode) =>
      updateSkillCommand(context, provider, node)
    ),
    vscode.commands.registerCommand('agentSkills.preview', (node?: SkillNode) =>
      previewProvider.open(context, node)
    ),
    vscode.commands.registerCommand('agentSkills.openSkillFolder', (node?: SkillNode) =>
      openSkillFolderCommand(node)
    ),
    vscode.commands.registerCommand('agentSkills.openSettings', () =>
      SettingsPanel.show(context, () => provider.refresh())
    )
  );

  // Re-render when settings change so apiUrl/scope edits show immediately.
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('agentSkills')) provider.refresh();
    })
  );
}

export function deactivate(): void {
  // no-op
}
