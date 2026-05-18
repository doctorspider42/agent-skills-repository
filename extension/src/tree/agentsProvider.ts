import * as vscode from 'vscode';
import { createApiClient } from '../auth';
import { readConfig, resolveAgentsScopePath, getApiKey } from '../config';
import { collectInstalled, InstalledLookup } from '../agentManifest';
import { AgentStatus, AgentSummary } from '../types';

interface CategoryNode {
  kind: 'category';
  label: string;
  path: string[];
  children: TreeNode[];
}

interface AgentNode {
  kind: 'agent';
  agent: AgentSummary;
  status: AgentStatus;
  installed?: InstalledLookup;
}

interface MessageNode {
  kind: 'message';
  message: string;
}

type TreeNode = CategoryNode | AgentNode | MessageNode;

export class AgentsTreeProvider implements vscode.TreeDataProvider<TreeNode> {
  private readonly _emitter = new vscode.EventEmitter<TreeNode | undefined>();
  readonly onDidChangeTreeData = this._emitter.event;

  private root: TreeNode[] | undefined;
  private agentIndex = new Map<string, AgentNode>();

  constructor(private readonly context: vscode.ExtensionContext) {}

  refresh(): void {
    this.root = undefined;
    this._emitter.fire(undefined);
  }

  findAgent(id: string): AgentNode | undefined {
    return this.agentIndex.get(id);
  }

  getTreeItem(node: TreeNode): vscode.TreeItem {
    if (node.kind === 'message') {
      const item = new vscode.TreeItem(node.message, vscode.TreeItemCollapsibleState.None);
      item.contextValue = 'message';
      item.command = {
        command: 'agentSkills.openSettings',
        title: 'Open Settings'
      };
      item.iconPath = new vscode.ThemeIcon('gear');
      return item;
    }
    if (node.kind === 'category') {
      const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.Collapsed);
      item.iconPath = new vscode.ThemeIcon('folder');
      item.contextValue = 'category';
      return item;
    }
    return agentTreeItem(node);
  }

  async getChildren(node?: TreeNode): Promise<TreeNode[]> {
    if (!node) {
      if (!this.root) {
        this.root = await this.loadRoot();
      }
      return this.root;
    }
    if (node.kind === 'category') return node.children;
    return [];
  }

  private async loadRoot(): Promise<TreeNode[]> {
    const cfg = readConfig();
    if (!cfg.apiUrl) {
      return [msg('Click here to set API URL & auth…')];
    }
    if (cfg.authMode === 'apiKey') {
      const apiKey = await getApiKey(this.context);
      if (!apiKey) return [msg('Click here to set the API key…')];
    } else {
      if (!cfg.entraTenantId || !cfg.entraScope) {
        return [msg('Click here to configure Entra ID (tenant + scope)…')];
      }
    }

    let agents: AgentSummary[];
    try {
      const client = await createApiClient(this.context, { interactive: false });
      if (!client) {
        return [msg(cfg.authMode === 'entra'
          ? 'Sign in with Microsoft to load agents…'
          : 'Click here to set the API key…')];
      }
      agents = await client.listAgents();
    } catch (err) {
      return [msg(`Failed to load: ${(err as Error).message}`)];
    }

    const candidates: { scope: 'project' | 'global'; path: string }[] = [
      { scope: 'project', path: resolveAgentsScopePath('project', cfg) ?? '' },
      { scope: 'global', path: resolveAgentsScopePath('global', cfg) ?? '' }
    ];
    const installed = await collectInstalled(candidates.filter((r) => r.path !== ''));

    this.agentIndex = new Map();
    return buildTree(agents, installed, this.agentIndex);
  }
}

function msg(text: string): MessageNode {
  return { kind: 'message', message: text };
}

function buildTree(
  agents: AgentSummary[],
  installed: Map<string, InstalledLookup>,
  index: Map<string, AgentNode>
): TreeNode[] {
  const rootChildren: TreeNode[] = [];
  const categoryCache = new Map<string, CategoryNode>();

  for (const agent of agents) {
    const status = statusFor(agent, installed.get(agent.id));
    const node: AgentNode = {
      kind: 'agent',
      agent,
      status,
      installed: installed.get(agent.id)
    };
    index.set(agent.id, node);

    let parent = rootChildren;
    let pathKey = '';
    for (const segment of agent.category) {
      pathKey = pathKey ? `${pathKey}/${segment}` : segment;
      let cat = categoryCache.get(pathKey);
      if (!cat) {
        cat = {
          kind: 'category',
          label: segment,
          path: pathKey.split('/'),
          children: []
        };
        categoryCache.set(pathKey, cat);
        parent.push(cat);
      }
      parent = cat.children;
    }
    parent.push(node);
  }

  sortRecursive(rootChildren);
  return rootChildren;
}

function sortRecursive(nodes: TreeNode[]): void {
  nodes.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'category' ? -1 : 1;
    return labelOf(a).localeCompare(labelOf(b));
  });
  for (const n of nodes) {
    if (n.kind === 'category') sortRecursive(n.children);
  }
}

function labelOf(node: TreeNode): string {
  if (node.kind === 'category') return node.label;
  if (node.kind === 'agent') return node.agent.metadata.name || node.agent.directoryName;
  return node.message;
}

function statusFor(agent: AgentSummary, installed?: InstalledLookup): AgentStatus {
  if (!installed) return 'notInstalled';
  if (
    installed.entry.installedVersion &&
    agent.metadata.version &&
    agent.metadata.version !== 'unknown' &&
    installed.entry.installedVersion !== agent.metadata.version
  ) {
    return 'updateAvailable';
  }
  return 'installed';
}

function agentTreeItem(node: AgentNode): vscode.TreeItem {
  const label = node.agent.metadata.name || node.agent.directoryName;
  const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);

  const version = node.agent.metadata.version;
  const installedVer = node.installed?.entry.installedVersion;

  if (node.status === 'installed') {
    item.description = `v${installedVer} • installed`;
    item.iconPath = new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green'));
    item.contextValue = 'agent.installed';
  } else if (node.status === 'updateAvailable') {
    item.description = `v${installedVer} → v${version} • update`;
    item.iconPath = new vscode.ThemeIcon('arrow-up', new vscode.ThemeColor('charts.yellow'));
    item.contextValue = 'agent.updateAvailable';
  } else {
    item.description = `v${version}`;
    item.iconPath = new vscode.ThemeIcon('cloud-download');
    item.contextValue = 'agent.notInstalled';
  }

  const md = new vscode.MarkdownString();
  md.appendMarkdown(`**${label}**\n\n`);
  if (node.agent.metadata.description) {
    md.appendMarkdown(`${node.agent.metadata.description}\n\n`);
  }
  md.appendMarkdown(`- Version: \`${version}\`\n`);
  md.appendMarkdown(`- Author: ${node.agent.metadata.author}\n`);
  md.appendMarkdown(`- Path: \`${node.agent.id}\`\n`);
  if (node.installed) {
    md.appendMarkdown(
      `- Installed: \`${node.installed.entry.installedVersion}\` (${node.installed.scope}) at \`${node.installed.entry.installPath}\`\n`
    );
  }
  if (node.agent.metadataError) {
    md.appendMarkdown(`\n⚠ ${node.agent.metadataError}\n`);
  }
  item.tooltip = md;

  return item;
}

export type { TreeNode as AgentTreeNode, AgentNode };
