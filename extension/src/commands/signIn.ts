import * as vscode from 'vscode';
import { buildEntraScopes } from '../auth';
import { readConfig } from '../config';

export async function signInCommand(): Promise<void> {
  const cfg = readConfig();
  if (cfg.authMode !== 'entra') {
    const choice = await vscode.window.showWarningMessage(
      `Auth mode is currently "${cfg.authMode}". Switch to Entra to sign in with Microsoft?`,
      'Switch to Entra',
      'Cancel'
    );
    if (choice !== 'Switch to Entra') return;
    await vscode.workspace
      .getConfiguration('agentSkills')
      .update('authMode', 'entra', vscode.ConfigurationTarget.Global);
  }

  const refreshed = readConfig();
  const scopes = buildEntraScopes(refreshed);
  if (!scopes) {
    vscode.window.showErrorMessage(
      'Configure "agentSkills.entra.tenantId" and "agentSkills.entra.scope" before signing in.'
    );
    return;
  }

  try {
    const session = await vscode.authentication.getSession('microsoft', scopes, {
      createIfNone: true
    });
    if (session) {
      vscode.window.showInformationMessage(
        `Signed in as ${session.account.label}.`
      );
    }
  } catch (err) {
    vscode.window.showErrorMessage(`Sign-in failed: ${(err as Error).message}`);
  }
}

export async function signOutCommand(): Promise<void> {
  // VS Code does not expose a programmatic "delete session" for the built-in
  // microsoft provider — point the user at the Accounts UI in the activity bar.
  vscode.window.showInformationMessage(
    'To sign out, open the Accounts menu (bottom-left avatar) → Microsoft → Sign out.'
  );
}
