import * as vscode from 'vscode';
import { SkillsTreeProvider, SkillNode } from './tree/skillsProvider';
import { AgentsTreeProvider, AgentNode } from './tree/agentsProvider';
import { installSkillCommand } from './commands/install';
import { uninstallSkillCommand } from './commands/uninstall';
import { updateSkillCommand } from './commands/update';
import { testConnection } from './commands/testConnection';
import { setApiKeyCommand, clearApiKeyCommand } from './commands/setApiKey';
import { openSkillFolderCommand } from './commands/openSkillFolder';
import { registerSkillPreviewProvider } from './commands/preview';
import { installAgentCommand } from './commands/installAgent';
import { uninstallAgentCommand } from './commands/uninstallAgent';
import { updateAgentCommand } from './commands/updateAgent';
import { openAgentFolderCommand } from './commands/openAgentFolder';
import { registerAgentPreviewProvider } from './commands/previewAgent';
import { SettingsPanel } from './webview/settingsPanel';

export function activate(context: vscode.ExtensionContext): void {
  const skillsProvider = new SkillsTreeProvider(context);
  const skillPreviewProvider = registerSkillPreviewProvider(context);

  const agentsProvider = new AgentsTreeProvider(context);
  const agentPreviewProvider = registerAgentPreviewProvider(context);

  const skillsView = vscode.window.createTreeView('agentSkillsExplorer', {
    treeDataProvider: skillsProvider,
    showCollapseAll: true
  });
  context.subscriptions.push(skillsView);

  const agentsView = vscode.window.createTreeView('agentSkillsAgentsExplorer', {
    treeDataProvider: agentsProvider,
    showCollapseAll: true
  });
  context.subscriptions.push(agentsView);

  context.subscriptions.push(
    vscode.commands.registerCommand('agentSkills.refresh', () => {
      skillsProvider.refresh();
      agentsProvider.refresh();
    }),
    vscode.commands.registerCommand('agentSkills.testConnection', () => testConnection(context)),
    vscode.commands.registerCommand('agentSkills.setApiKey', () => setApiKeyCommand(context)),
    vscode.commands.registerCommand('agentSkills.clearApiKey', () => clearApiKeyCommand(context)),
    vscode.commands.registerCommand('agentSkills.install', (node?: SkillNode) =>
      installSkillCommand(context, skillsProvider, node)
    ),
    vscode.commands.registerCommand('agentSkills.uninstall', (node?: SkillNode) =>
      uninstallSkillCommand(skillsProvider, node)
    ),
    vscode.commands.registerCommand('agentSkills.update', (node?: SkillNode) =>
      updateSkillCommand(context, skillsProvider, node)
    ),
    vscode.commands.registerCommand('agentSkills.preview', (node?: SkillNode) =>
      skillPreviewProvider.open(context, node)
    ),
    vscode.commands.registerCommand('agentSkills.openSkillFolder', (node?: SkillNode) =>
      openSkillFolderCommand(node)
    ),
    vscode.commands.registerCommand('agentSkills.openSettings', () =>
      SettingsPanel.show(context, () => {
        skillsProvider.refresh();
        agentsProvider.refresh();
      })
    ),

    vscode.commands.registerCommand('agentSkills.agents.install', (node?: AgentNode) =>
      installAgentCommand(context, agentsProvider, node)
    ),
    vscode.commands.registerCommand('agentSkills.agents.uninstall', (node?: AgentNode) =>
      uninstallAgentCommand(agentsProvider, node)
    ),
    vscode.commands.registerCommand('agentSkills.agents.update', (node?: AgentNode) =>
      updateAgentCommand(context, agentsProvider, node)
    ),
    vscode.commands.registerCommand('agentSkills.agents.preview', (node?: AgentNode) =>
      agentPreviewProvider.open(context, node)
    ),
    vscode.commands.registerCommand('agentSkills.agents.openFolder', (node?: AgentNode) =>
      openAgentFolderCommand(node)
    )
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('agentSkills')) {
        skillsProvider.refresh();
        agentsProvider.refresh();
      }
    })
  );
}

export function deactivate(): void {
  // no-op
}
