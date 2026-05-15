import * as vscode from 'vscode';
import { SkillsApiClient } from '../api/client';
import { readConfig, resolveScopePath, getApiKey } from '../config';
import { collectInstalled, InstalledLookup } from '../manifest';
import { SkillStatus, SkillSummary } from '../types';

interface CategoryNode {
  kind: 'category';
  label: string;
  path: string[];
  children: TreeNode[];
}

interface SkillNode {
  kind: 'skill';
  skill: SkillSummary;
  status: SkillStatus;
  installed?: InstalledLookup;
}

interface MessageNode {
  kind: 'message';
  message: string;
}

type TreeNode = CategoryNode | SkillNode | MessageNode;

export class SkillsTreeProvider implements vscode.TreeDataProvider<TreeNode> {
  private readonly _emitter = new vscode.EventEmitter<TreeNode | undefined>();
  readonly onDidChangeTreeData = this._emitter.event;

  private root: TreeNode[] | undefined;
  private skillIndex = new Map<string, SkillNode>();

  constructor(private readonly context: vscode.ExtensionContext) {}

  refresh(): void {
    this.root = undefined;
    this._emitter.fire(undefined);
  }

  findSkill(id: string): SkillNode | undefined {
    return this.skillIndex.get(id);
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
    return skillTreeItem(node);
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
      return [msg('Click here to set API URL & key…')];
    }
    const apiKey = await getApiKey(this.context);
    if (!apiKey) {
      return [msg('Click here to set the API key…')];
    }

    let skills: SkillSummary[];
    try {
      const client = new SkillsApiClient(cfg.apiUrl, apiKey, cfg.requestTimeoutMs);
      skills = await client.listSkills();
    } catch (err) {
      return [msg(`Failed to load: ${(err as Error).message}`)];
    }

    const candidates: { scope: 'project' | 'global'; path: string }[] = [
      { scope: 'project', path: resolveScopePath('project', cfg) ?? '' },
      { scope: 'global', path: resolveScopePath('global', cfg) ?? '' }
    ];
    const installed = await collectInstalled(candidates.filter((r) => r.path !== ''));

    this.skillIndex = new Map();
    const tree = buildTree(skills, installed, this.skillIndex);
    return tree;
  }
}

function msg(text: string): MessageNode {
  return { kind: 'message', message: text };
}

function buildTree(
  skills: SkillSummary[],
  installed: Map<string, InstalledLookup>,
  index: Map<string, SkillNode>
): TreeNode[] {
  const rootChildren: TreeNode[] = [];
  const categoryCache = new Map<string, CategoryNode>();

  for (const skill of skills) {
    const status = statusFor(skill, installed.get(skill.id));
    const node: SkillNode = {
      kind: 'skill',
      skill,
      status,
      installed: installed.get(skill.id)
    };
    index.set(skill.id, node);

    let parent = rootChildren;
    let pathKey = '';
    for (const segment of skill.category) {
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
  if (node.kind === 'skill') return node.skill.metadata.name || node.skill.directoryName;
  return node.message;
}

function statusFor(skill: SkillSummary, installed?: InstalledLookup): SkillStatus {
  if (!installed) return 'notInstalled';
  if (
    installed.entry.installedVersion &&
    skill.metadata.version &&
    skill.metadata.version !== 'unknown' &&
    installed.entry.installedVersion !== skill.metadata.version
  ) {
    return 'updateAvailable';
  }
  return 'installed';
}

function skillTreeItem(node: SkillNode): vscode.TreeItem {
  const label = node.skill.metadata.name || node.skill.directoryName;
  const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);

  const version = node.skill.metadata.version;
  const installedVer = node.installed?.entry.installedVersion;

  if (node.status === 'installed') {
    item.description = `v${installedVer} • installed`;
    item.iconPath = new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green'));
    item.contextValue = 'skill.installed';
  } else if (node.status === 'updateAvailable') {
    item.description = `v${installedVer} → v${version} • update`;
    item.iconPath = new vscode.ThemeIcon('arrow-up', new vscode.ThemeColor('charts.yellow'));
    item.contextValue = 'skill.updateAvailable';
  } else {
    item.description = `v${version}`;
    item.iconPath = new vscode.ThemeIcon('cloud-download');
    item.contextValue = 'skill.notInstalled';
  }

  const md = new vscode.MarkdownString();
  md.appendMarkdown(`**${label}**\n\n`);
  if (node.skill.metadata.description) {
    md.appendMarkdown(`${node.skill.metadata.description}\n\n`);
  }
  md.appendMarkdown(`- Version: \`${version}\`\n`);
  md.appendMarkdown(`- Author: ${node.skill.metadata.author}\n`);
  md.appendMarkdown(`- Path: \`${node.skill.id}\`\n`);
  if (node.installed) {
    md.appendMarkdown(
      `- Installed: \`${node.installed.entry.installedVersion}\` (${node.installed.scope}) at \`${node.installed.entry.installPath}\`\n`
    );
  }
  if (node.skill.metadataError) {
    md.appendMarkdown(`\n⚠ ${node.skill.metadataError}\n`);
  }
  item.tooltip = md;

  return item;
}

export type { TreeNode, SkillNode };
