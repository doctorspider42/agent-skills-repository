import * as vscode from 'vscode';
import { createApiClient } from '../auth';
import { AgentNode } from '../tree/agentsProvider';

const PREVIEW_SCHEME = 'agent-preview';

export class AgentPreviewProvider implements vscode.TextDocumentContentProvider {
  private readonly _emitter = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this._emitter.event;
  private readonly previews = new Map<string, string>();

  provideTextDocumentContent(uri: vscode.Uri): string {
    return (
      this.previews.get(uri.toString()) ??
      'Preview is no longer available. Reopen it from the Agents tree.'
    );
  }

  async open(context: vscode.ExtensionContext, node: AgentNode | undefined): Promise<void> {
    if (!node || node.kind !== 'agent') {
      vscode.window.showWarningMessage('Pick an agent in the tree first.');
      return;
    }

    const client = await createApiClient(context, { interactive: true });
    if (!client) return;

    try {
      const markerFile = `${node.agent.directoryName}.md`;
      const content = await client.getAgentFileText(node.agent.id, markerFile);
      const label = node.agent.metadata.name || node.agent.directoryName;
      const uri = this.uriFor(node.agent.id, label);

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

  private uriFor(agentId: string, label: string): vscode.Uri {
    const safeLabel = label.replace(/[\\/:*?"<>|]/g, '-');
    return vscode.Uri.from({
      scheme: PREVIEW_SCHEME,
      path: `/${safeLabel}.md`,
      query: encodeURIComponent(agentId)
    });
  }
}

export function registerAgentPreviewProvider(
  context: vscode.ExtensionContext
): AgentPreviewProvider {
  const provider = new AgentPreviewProvider();
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(PREVIEW_SCHEME, provider)
  );
  return provider;
}
