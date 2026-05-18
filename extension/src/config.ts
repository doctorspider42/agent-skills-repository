import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import { InstallScope } from './types';

const NAMESPACE = 'agentSkills';
const SECRET_API_KEY = 'agentSkills.apiKey';

export type AuthMode = 'apiKey' | 'entra';

export interface ResolvedConfig {
  apiUrl: string;
  authMode: AuthMode;
  entraTenantId: string;
  entraClientId: string;
  entraScope: string;
  defaultScope: InstallScope;
  globalSkillsPath: string;
  projectSkillsPath: string;
  globalAgentsPath: string;
  projectAgentsPath: string;
  requestTimeoutMs: number;
}

export function readConfig(): ResolvedConfig {
  const c = vscode.workspace.getConfiguration(NAMESPACE);
  const apiUrl = (c.get<string>('apiUrl') ?? '').trim().replace(/\/+$/, '');
  const authMode = (c.get<AuthMode>('authMode') ?? 'apiKey') as AuthMode;
  const entraTenantId = (c.get<string>('entra.tenantId') ?? '').trim();
  const entraClientId = (c.get<string>('entra.clientId') ?? '').trim();
  const entraScope = (c.get<string>('entra.scope') ?? '').trim();
  const defaultScope = (c.get<InstallScope>('defaultScope') ?? 'project');
  const globalPathSetting = (c.get<string>('globalSkillsPath') ?? '').trim();
  const projectPathSetting = (c.get<string>('projectSkillsPath') ?? '.github/skills').trim();
  const globalAgentsSetting = (c.get<string>('globalAgentsPath') ?? '').trim();
  const projectAgentsSetting = (c.get<string>('projectAgentsPath') ?? '.github/agents').trim();
  const requestTimeoutMs = c.get<number>('requestTimeoutMs') ?? 30000;

  return {
    apiUrl,
    authMode,
    entraTenantId,
    entraClientId,
    entraScope,
    defaultScope,
    globalSkillsPath: globalPathSetting || path.join(os.homedir(), '.claude', 'skills'),
    projectSkillsPath: projectPathSetting || '.github/skills',
    globalAgentsPath: globalAgentsSetting || path.join(os.homedir(), '.claude', 'agents'),
    projectAgentsPath: projectAgentsSetting || '.github/agents',
    requestTimeoutMs
  };
}

export async function getApiKey(context: vscode.ExtensionContext): Promise<string | undefined> {
  return context.secrets.get(SECRET_API_KEY);
}

export async function setApiKey(
  context: vscode.ExtensionContext,
  value: string | undefined
): Promise<void> {
  if (!value) {
    await context.secrets.delete(SECRET_API_KEY);
  } else {
    await context.secrets.store(SECRET_API_KEY, value);
  }
}

export interface InstallTarget {
  scope: InstallScope;
  absolutePath: string;
}

export function resolveScopePath(
  scope: InstallScope,
  cfg: ResolvedConfig
): string | undefined {
  if (scope === 'global') return cfg.globalSkillsPath;

  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) return undefined;
  return path.isAbsolute(cfg.projectSkillsPath)
    ? cfg.projectSkillsPath
    : path.join(folder.uri.fsPath, cfg.projectSkillsPath);
}

export function resolveAgentsScopePath(
  scope: InstallScope,
  cfg: ResolvedConfig
): string | undefined {
  if (scope === 'global') return cfg.globalAgentsPath;

  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) return undefined;
  return path.isAbsolute(cfg.projectAgentsPath)
    ? cfg.projectAgentsPath
    : path.join(folder.uri.fsPath, cfg.projectAgentsPath);
}
