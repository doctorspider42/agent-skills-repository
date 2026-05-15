import * as vscode from 'vscode';
import { SkillsApiClient } from '../api/client';
import { getApiKey, readConfig } from '../config';
import { SkillNode } from '../tree/skillsProvider';

const PREVIEW_SCHEME = 'agent-skill-preview';
const SKILL_FILE = 'SKILL.md';

export class SkillPreviewProvider implements vscode.TextDocumentContentProvider {
  private readonly _emitter = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this._emitter.event;
  private readonly previews = new Map<string, string>();

  provideTextDocumentContent(uri: vscode.Uri): string {
    return (
      this.previews.get(uri.toString()) ??
      'Preview is no longer available. Reopen it from the Skills tree.'
    );
  }

  async open(context: vscode.ExtensionContext, node: SkillNode | undefined): Promise<void> {
    if (!node || node.kind !== 'skill') {
      vscode.window.showWarningMessage('Pick a skill in the tree first.');
      return;
    }

    const cfg = readConfig();
    const apiKey = await getApiKey(context);
    if (!cfg.apiUrl || !apiKey) {
      vscode.window.showErrorMessage('Configure apiUrl and API key first.');
      return;
    }

    try {
      const client = new SkillsApiClient(cfg.apiUrl, apiKey, cfg.requestTimeoutMs);
      const content = await client.getSkillFileText(node.skill.id, SKILL_FILE);
      const label = node.skill.metadata.name || node.skill.directoryName;
      const uri = this.uriFor(node.skill.id, label);

      this.previews.set(uri.toString(), content);
      this._emitter.fire(uri);

      const doc = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(doc, {
        preview: true,
        viewColumn: vscode.ViewColumn.Active
      });
    } catch (err) {
      vscode.window.showErrorMessage(`Preview failed: ${(err as Error).message}`);
    }
  }

  private uriFor(skillId: string, label: string): vscode.Uri {
    const safeLabel = label.replace(/[\\/:*?"<>|]/g, '-');
    return vscode.Uri.from({
      scheme: PREVIEW_SCHEME,
      path: `/${safeLabel}.md`,
      query: encodeURIComponent(skillId)
    });
  }
}

export function registerSkillPreviewProvider(
  context: vscode.ExtensionContext
): SkillPreviewProvider {
  const provider = new SkillPreviewProvider();
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(PREVIEW_SCHEME, provider)
  );
  return provider;
}
