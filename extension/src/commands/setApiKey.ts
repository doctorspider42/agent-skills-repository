import * as vscode from 'vscode';
import { setApiKey } from '../config';

export async function setApiKeyCommand(context: vscode.ExtensionContext): Promise<void> {
  const value = await vscode.window.showInputBox({
    title: 'Agent Skills API Key',
    prompt: 'Paste your API key — stored securely in the OS keychain.',
    password: true,
    ignoreFocusOut: true,
    placeHolder: 'sk-...'
  });
  if (value === undefined) return; // cancelled
  if (value.trim() === '') {
    vscode.window.showWarningMessage('API key is empty — nothing saved.');
    return;
  }
  await setApiKey(context, value.trim());
  vscode.window.showInformationMessage('Agent Skills API key saved.');
}

export async function clearApiKeyCommand(context: vscode.ExtensionContext): Promise<void> {
  await setApiKey(context, undefined);
  vscode.window.showInformationMessage('Agent Skills API key cleared.');
}
