import * as vscode from 'vscode';
import { SkillsApiClient, AuthHeadersProvider } from './api/client';
import { getApiKey, readConfig, ResolvedConfig } from './config';

export type AuthHeaders = Record<string, string>;

export interface AuthSession {
  mode: 'apiKey' | 'entra';
  // entra-only
  accountLabel?: string;
  accountEmail?: string;
}

const MICROSOFT_PROVIDER_ID = 'microsoft';

/**
 * Resolve auth headers for an outbound API request.
 * For Entra: fetches (and silently refreshes) a session via VS Code's built-in Microsoft auth provider.
 * For API key: returns the legacy `x-api-key` header.
 */
export async function resolveAuthHeaders(
  context: vscode.ExtensionContext,
  options: { createIfNone?: boolean; forceNewSession?: boolean } = {}
): Promise<{ headers: AuthHeaders; session: AuthSession } | undefined> {
  const cfg = readConfig();
  if (cfg.authMode === 'entra') {
    const scopes = buildEntraScopes(cfg);
    if (!scopes) {
      throw new Error(
        'Entra auth is selected but agentSkills.entra.tenantId and agentSkills.entra.scope are not set.'
      );
    }
    const session = await vscode.authentication.getSession(
      MICROSOFT_PROVIDER_ID,
      scopes,
      {
        createIfNone: options.createIfNone ?? false,
        forceNewSession: options.forceNewSession ?? false,
        silent: options.createIfNone === false && !options.forceNewSession
      }
    );
    if (!session) return undefined;
    return {
      headers: { Authorization: `Bearer ${session.accessToken}` },
      session: {
        mode: 'entra',
        accountLabel: session.account.label,
        accountEmail: session.account.label
      }
    };
  }

  const key = await getApiKey(context);
  if (!key) return undefined;
  return {
    headers: { 'x-api-key': key },
    session: { mode: 'apiKey' }
  };
}

/** Builds the scope array for vscode.authentication.getSession('microsoft', …). */
export function buildEntraScopes(cfg: ResolvedConfig): string[] | undefined {
  if (!cfg.entraTenantId || !cfg.entraScope) return undefined;
  const scopes: string[] = [];
  // VS Code-specific scope modifiers — see https://github.com/microsoft/vscode/blob/main/extensions/microsoft-authentication/README.md
  scopes.push(`VSCODE_TENANT:${cfg.entraTenantId}`);
  if (cfg.entraClientId) {
    scopes.push(`VSCODE_CLIENT_ID:${cfg.entraClientId}`);
  }
  scopes.push(cfg.entraScope);
  return scopes;
}

/** Human-readable description of the missing piece (for tree messages, etc). */
export function describeMissingAuth(cfg: ResolvedConfig): string | undefined {
  if (!cfg.apiUrl) return 'Click here to set the API URL…';
  if (cfg.authMode === 'apiKey') {
    return undefined; // caller checks API key separately
  }
  if (!cfg.entraTenantId || !cfg.entraScope) {
    return 'Click here to configure Entra ID (tenant + scope)…';
  }
  return undefined;
}

/**
 * Build an API client wired up to the currently configured auth mode.
 * Returns undefined (and shows a user-facing warning) if prerequisites are missing.
 *
 * Pass `interactive: true` to surface the Microsoft sign-in prompt when no session exists.
 */
export async function createApiClient(
  context: vscode.ExtensionContext,
  options: { interactive?: boolean } = {}
): Promise<SkillsApiClient | undefined> {
  const cfg = readConfig();
  if (!cfg.apiUrl) {
    vscode.window.showErrorMessage('Set "agentSkills.apiUrl" first.');
    return undefined;
  }

  if (cfg.authMode === 'apiKey') {
    const key = await getApiKey(context);
    if (!key) {
      vscode.window.showErrorMessage(
        'No API key configured. Run "Agent Skills: Set API Key".'
      );
      return undefined;
    }
    const provider: AuthHeadersProvider = async () => ({ 'x-api-key': key });
    return new SkillsApiClient(cfg.apiUrl, provider, cfg.requestTimeoutMs);
  }

  // Entra
  const scopes = buildEntraScopes(cfg);
  if (!scopes) {
    vscode.window.showErrorMessage(
      'Entra mode requires "agentSkills.entra.tenantId" and "agentSkills.entra.scope".'
    );
    return undefined;
  }

  // Probe once to make sure we *can* get a session.
  const session = await vscode.authentication.getSession(
    'microsoft',
    scopes,
    { createIfNone: options.interactive ?? false, silent: !options.interactive }
  );
  if (!session) {
    if (options.interactive) {
      vscode.window.showWarningMessage('Microsoft sign-in cancelled.');
    } else {
      vscode.window.showInformationMessage(
        'Not signed in. Run "Agent Skills: Sign in with Microsoft".'
      );
    }
    return undefined;
  }

  const provider: AuthHeadersProvider = async (opts) => {
    const s = await vscode.authentication.getSession('microsoft', scopes, {
      createIfNone: false,
      forceNewSession: opts?.forceRefresh ?? false,
      silent: !opts?.forceRefresh
    });
    if (!s) throw new Error('No Microsoft session available.');
    return { Authorization: `Bearer ${s.accessToken}` };
  };
  return new SkillsApiClient(cfg.apiUrl, provider, cfg.requestTimeoutMs);
}
