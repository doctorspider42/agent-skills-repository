import * as vscode from 'vscode';
import { createApiClient } from '../auth';
import { AuthMode, getApiKey, readConfig, setApiKey } from '../config';
import { InstallScope } from '../types';

interface InboundMessage {
  type: 'ready' | 'save' | 'test' | 'reveal' | 'signIn';
  payload?: {
    apiUrl?: string;
    apiKey?: string;
    authMode?: AuthMode;
    entraTenantId?: string;
    entraClientId?: string;
    entraScope?: string;
    defaultScope?: InstallScope;
    projectSkillsPath?: string;
    globalSkillsPath?: string;
    projectAgentsPath?: string;
    globalAgentsPath?: string;
    source?: 'connection' | 'locations';
  };
}

interface OutboundMessage {
  type: 'state' | 'testResult' | 'saved';
  payload?: unknown;
}

export class SettingsPanel {
  private static current: SettingsPanel | undefined;
  public static readonly viewType = 'agentSkills.settings';

  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];

  public static show(context: vscode.ExtensionContext, onChanged: () => void): void {
    const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;

    if (SettingsPanel.current) {
      SettingsPanel.current.panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      SettingsPanel.viewType,
      'Agent Skills Repository — Settings',
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: []
      }
    );
    SettingsPanel.current = new SettingsPanel(panel, context, onChanged);
  }

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly context: vscode.ExtensionContext,
    private readonly onChanged: () => void
  ) {
    this.panel = panel;
    this.panel.webview.html = this.renderHtml();

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage(
      (msg: InboundMessage) => this.handleMessage(msg),
      null,
      this.disposables
    );
  }

  private dispose(): void {
    SettingsPanel.current = undefined;
    this.panel.dispose();
    while (this.disposables.length) this.disposables.pop()?.dispose();
  }

  private async sendState(): Promise<void> {
    const cfg = readConfig();
    const apiKey = await getApiKey(this.context);
    let entraAccount = '';
    if (cfg.authMode === 'entra' && cfg.entraTenantId && cfg.entraScope) {
      try {
        const scopes = [
          `VSCODE_TENANT:${cfg.entraTenantId}`,
          ...(cfg.entraClientId ? [`VSCODE_CLIENT_ID:${cfg.entraClientId}`] : []),
          cfg.entraScope
        ];
        const session = await vscode.authentication.getSession('microsoft', scopes, {
          createIfNone: false,
          silent: true
        });
        entraAccount = session?.account.label ?? '';
      } catch {
        entraAccount = '';
      }
    }
    await this.post({
      type: 'state',
      payload: {
        apiUrl: cfg.apiUrl,
        authMode: cfg.authMode,
        entraTenantId: cfg.entraTenantId,
        entraClientId: cfg.entraClientId,
        entraScope: cfg.entraScope,
        entraAccount,
        hasApiKey: Boolean(apiKey),
        apiKeyPreview: apiKey ? `${'•'.repeat(Math.max(0, apiKey.length - 4))}${apiKey.slice(-4)}` : '',
        defaultScope: cfg.defaultScope,
        projectSkillsPath: cfg.projectSkillsPath,
        globalSkillsPath: cfg.globalSkillsPath,
        projectAgentsPath: cfg.projectAgentsPath,
        globalAgentsPath: cfg.globalAgentsPath
      }
    });
  }

  private post(msg: OutboundMessage): Thenable<boolean> {
    return this.panel.webview.postMessage(msg);
  }

  private async handleMessage(msg: InboundMessage): Promise<void> {
    switch (msg.type) {
      case 'ready':
        await this.sendState();
        return;

      case 'save': {
        const p = msg.payload ?? {};
        const config = vscode.workspace.getConfiguration('agentSkills');
        const target = vscode.ConfigurationTarget.Global;
        if (typeof p.apiUrl === 'string') {
          await config.update('apiUrl', p.apiUrl.trim().replace(/\/+$/, ''), target);
        }
        if (typeof p.authMode === 'string') {
          await config.update('authMode', p.authMode, target);
        }
        if (typeof p.entraTenantId === 'string') {
          await config.update('entra.tenantId', p.entraTenantId.trim(), target);
        }
        if (typeof p.entraClientId === 'string') {
          await config.update('entra.clientId', p.entraClientId.trim(), target);
        }
        if (typeof p.entraScope === 'string') {
          await config.update('entra.scope', p.entraScope.trim(), target);
        }
        if (typeof p.defaultScope === 'string') {
          await config.update('defaultScope', p.defaultScope, target);
        }
        if (typeof p.projectSkillsPath === 'string') {
          await config.update('projectSkillsPath', p.projectSkillsPath.trim(), target);
        }
        if (typeof p.globalSkillsPath === 'string') {
          await config.update('globalSkillsPath', p.globalSkillsPath.trim(), target);
        }
        if (typeof p.projectAgentsPath === 'string') {
          await config.update('projectAgentsPath', p.projectAgentsPath.trim(), target);
        }
        if (typeof p.globalAgentsPath === 'string') {
          await config.update('globalAgentsPath', p.globalAgentsPath.trim(), target);
        }
        if (typeof p.apiKey === 'string' && p.apiKey.trim() !== '') {
          await setApiKey(this.context, p.apiKey.trim());
        }
        await this.post({ type: 'saved', payload: { source: p.source ?? 'connection' } });
        await this.sendState();
        this.onChanged();
        return;
      }

      case 'test': {
        const client = await createApiClient(this.context, { interactive: true });
        if (!client) {
          await this.post({
            type: 'testResult',
            payload: { ok: false, message: 'Auth not configured — see warnings above.' }
          });
          return;
        }
        try {
          const result = await client.verify();
          const cfg = readConfig();
          const who = result.user?.email || result.user?.name;
          const suffix = who ? ` — signed in as ${who}` : '';
          await this.post({
            type: 'testResult',
            payload: { ok: true, message: `Connected to ${cfg.apiUrl}${suffix}` }
          });
        } catch (err) {
          await this.post({
            type: 'testResult',
            payload: { ok: false, message: (err as Error).message }
          });
        }
        return;
      }

      case 'signIn': {
        await vscode.commands.executeCommand('agentSkills.signIn');
        await this.sendState();
        return;
      }

      case 'reveal': {
        await vscode.commands.executeCommand(
          'workbench.action.openSettings',
          '@ext:doctorspider.agent-skills-repository'
        );
        return;
      }
    }
  }

  private renderHtml(): string {
    const nonce = makeNonce();
    const cspSource = this.panel.webview.cspSource;
    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy"
  content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';" />
<title>Agent Skills Repository — Settings</title>
<style>
  :root { color-scheme: light dark; }
  body {
    font-family: var(--vscode-font-family);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    padding: 24px 32px;
    max-width: 720px;
    margin: 0 auto;
    line-height: 1.5;
  }
  h1 { font-size: 1.4rem; margin: 0 0 4px 0; }
  .subtitle { color: var(--vscode-descriptionForeground); margin-bottom: 24px; }
  .card {
    background: var(--vscode-editorWidget-background, var(--vscode-editor-background));
    border: 1px solid var(--vscode-panel-border, transparent);
    border-radius: 6px;
    padding: 20px 24px;
    margin-bottom: 18px;
  }
  .card h2 {
    font-size: 0.95rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--vscode-descriptionForeground);
    margin: 0 0 16px 0;
  }
  .subsection {
    font-size: 0.78rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--vscode-descriptionForeground);
    margin: 18px 0 8px 0;
    padding-bottom: 4px;
    border-bottom: 1px solid var(--vscode-panel-border, transparent);
    font-weight: 600;
  }
  .subsection:first-of-type { margin-top: 4px; }
  .field { display: flex; flex-direction: column; margin-bottom: 14px; }
  .field label {
    font-weight: 600;
    margin-bottom: 4px;
    font-size: 0.9rem;
  }
  .field .hint {
    color: var(--vscode-descriptionForeground);
    font-size: 0.8rem;
    margin-top: 4px;
  }
  input[type="text"], input[type="password"], select {
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 3px;
    padding: 6px 8px;
    font-family: inherit;
    font-size: 0.9rem;
    outline: none;
  }
  input:focus, select:focus {
    border-color: var(--vscode-focusBorder);
  }
  .key-row { display: flex; gap: 6px; align-items: stretch; }
  .key-row input { flex: 1; }
  .icon-btn {
    background: transparent;
    color: var(--vscode-foreground);
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 3px;
    padding: 0 10px;
    cursor: pointer;
    font-family: inherit;
    font-size: 0.85rem;
  }
  .icon-btn:hover { background: var(--vscode-toolbar-hoverBackground); }
  .actions { display: flex; gap: 8px; margin-top: 8px; align-items: center; }
  .actions .spacer { flex: 1; }
  button.primary {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none;
    border-radius: 3px;
    padding: 7px 16px;
    cursor: pointer;
    font-family: inherit;
    font-size: 0.9rem;
  }
  button.primary:hover { background: var(--vscode-button-hoverBackground); }
  button.secondary {
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    border: none;
    border-radius: 3px;
    padding: 7px 16px;
    cursor: pointer;
    font-family: inherit;
    font-size: 0.9rem;
  }
  button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
  button:disabled { opacity: 0.5; cursor: not-allowed; }
  .status {
    margin-left: 8px;
    font-size: 0.85rem;
    padding: 4px 10px;
    border-radius: 3px;
    display: none;
  }
  .status.show { display: inline-block; }
  .status.ok {
    background: var(--vscode-testing-iconPassed, #2ea043);
    color: white;
  }
  .status.err {
    background: var(--vscode-testing-iconFailed, #f85149);
    color: white;
  }
  .status.info {
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
  }
  .footer-link {
    margin-top: 18px;
    font-size: 0.85rem;
    color: var(--vscode-textLink-foreground);
    cursor: pointer;
    display: inline-block;
  }
  .footer-link:hover { text-decoration: underline; }
  .card-header {
    display: flex;
    align-items: center;
    margin: 0 0 16px 0;
  }
  .card-header h2 { margin: 0; }
  .saved-hint {
    margin-left: auto;
    font-size: 0.75rem;
    color: var(--vscode-descriptionForeground);
    opacity: 0;
    transition: opacity 180ms ease-in-out;
    text-transform: none;
    letter-spacing: 0;
  }
  .saved-hint.show { opacity: 0.85; }
  .key-meta {
    font-size: 0.8rem;
    color: var(--vscode-descriptionForeground);
    margin-top: 4px;
  }
  .key-meta code {
    background: var(--vscode-textBlockQuote-background, transparent);
    padding: 1px 4px;
    border-radius: 2px;
  }
</style>
</head>
<body>

<h1>Agent Skills Repository</h1>
<div class="subtitle">Configure how the extension talks to your Skills API.</div>

<div class="card">
  <h2>Connection</h2>

  <div class="field">
    <label for="apiUrl">API URL</label>
    <input id="apiUrl" type="text" placeholder="https://skills.internal.example.com" autocomplete="off" />
    <div class="hint">Base URL of the Skills API. Trailing slashes are stripped.</div>
  </div>

  <div class="field">
    <label for="authMode">Authentication</label>
    <select id="authMode">
      <option value="apiKey">API Key (legacy)</option>
      <option value="entra">Microsoft Entra ID (SSO)</option>
    </select>
    <div class="hint">Choose how the extension authenticates against the Skills API.</div>
  </div>

  <div id="apiKeyBlock">
    <div class="field">
      <label for="apiKey">API Key</label>
      <div class="key-row">
        <input id="apiKey" type="password" placeholder="Paste a new key to replace…" autocomplete="off" />
        <button type="button" class="icon-btn" id="toggleKey" title="Show / hide key">Show</button>
      </div>
      <div class="key-meta" id="keyMeta">No key stored.</div>
      <div class="hint">Stored in the OS keychain via VS Code SecretStorage. Leave empty to keep the existing key.</div>
    </div>
  </div>

  <div id="entraBlock" style="display:none">
    <div class="field">
      <label for="entraTenantId">Tenant ID</label>
      <input id="entraTenantId" type="text" placeholder="e.g. 00000000-0000-0000-0000-000000000000" autocomplete="off" />
      <div class="hint">GUID of your Microsoft Entra ID tenant.</div>
    </div>
    <div class="field">
      <label for="entraScope">API scope</label>
      <input id="entraScope" type="text" placeholder="api://&lt;api-app-id&gt;/Skills.Access" autocomplete="off" />
      <div class="hint">Scope requested when signing in. Must match the API's expected audience + permission.</div>
    </div>
    <div class="field">
      <label for="entraClientId">Client ID (optional)</label>
      <input id="entraClientId" type="text" placeholder="(leave empty to use VS Code's built-in Microsoft app)" autocomplete="off" />
      <div class="hint">Override only if your tenant blocks VS Code's default app and you registered your own.</div>
    </div>
    <div class="key-meta" id="entraAccount">Not signed in.</div>
    <div class="actions" style="margin-top: 8px;">
      <button type="button" class="secondary" id="signInBtn">Sign in with Microsoft</button>
    </div>
  </div>

  <div class="actions">
    <button type="button" class="secondary" id="testBtn">Test Connection</button>
    <span class="status" id="status"></span>
    <span class="spacer"></span>
    <button type="button" class="primary" id="saveBtn">Save</button>
  </div>
</div>

<div class="card">
  <div class="card-header">
    <h2>Install Locations</h2>
    <span class="saved-hint" id="locationsSaved">Saved</span>
  </div>

  <div class="field">
    <label for="defaultScope">Default scope</label>
    <select id="defaultScope">
      <option value="project">Project</option>
      <option value="global">Global</option>
    </select>
    <div class="hint">Used when installing a skill without choosing a location interactively.</div>
  </div>

  <h3 class="subsection">Project (local)</h3>

  <div class="field">
    <label for="projectSkillsPath">Skills path</label>
    <input id="projectSkillsPath" type="text" placeholder=".github/skills" autocomplete="off" />
    <div class="hint">Relative to the workspace root.</div>
  </div>

  <div class="field">
    <label for="projectAgentsPath">Agents path</label>
    <input id="projectAgentsPath" type="text" placeholder=".github/agents" autocomplete="off" />
    <div class="hint">Relative to the workspace root. Agent <code>.md</code> files are copied here.</div>
  </div>

  <h3 class="subsection">Global</h3>

  <div class="field">
    <label for="globalSkillsPath">Skills path</label>
    <input id="globalSkillsPath" type="text" placeholder="${defaultGlobalSkillsPlaceholder()}" autocomplete="off" />
    <div class="hint">Absolute path. Leave empty to use <code>$HOME/.claude/skills</code>.</div>
  </div>

  <div class="field">
    <label for="globalAgentsPath">Agents path</label>
    <input id="globalAgentsPath" type="text" placeholder="${defaultGlobalAgentsPlaceholder()}" autocomplete="off" />
    <div class="hint">Absolute path. Leave empty to use <code>$HOME/.claude/agents</code>.</div>
  </div>
</div>

<a class="footer-link" id="openNative">Open these settings in the native settings editor →</a>

<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const $ = (id) => document.getElementById(id);

  const els = {
    apiUrl: $('apiUrl'),
    authMode: $('authMode'),
    apiKeyBlock: $('apiKeyBlock'),
    entraBlock: $('entraBlock'),
    apiKey: $('apiKey'),
    keyMeta: $('keyMeta'),
    toggleKey: $('toggleKey'),
    entraTenantId: $('entraTenantId'),
    entraClientId: $('entraClientId'),
    entraScope: $('entraScope'),
    entraAccount: $('entraAccount'),
    signInBtn: $('signInBtn'),
    testBtn: $('testBtn'),
    saveBtn: $('saveBtn'),
    status: $('status'),
    locationsSaved: $('locationsSaved'),
    defaultScope: $('defaultScope'),
    projectSkillsPath: $('projectSkillsPath'),
    globalSkillsPath: $('globalSkillsPath'),
    projectAgentsPath: $('projectAgentsPath'),
    globalAgentsPath: $('globalAgentsPath'),
    openNative: $('openNative')
  };

  function applyAuthModeVisibility() {
    const mode = els.authMode.value;
    els.apiKeyBlock.style.display = mode === 'apiKey' ? '' : 'none';
    els.entraBlock.style.display = mode === 'entra' ? '' : 'none';
  }

  let stateApplying = false;
  let locationSaveTimer;
  let locationsSavedTimer;

  function setStatus(kind, text) {
    els.status.className = 'status show ' + kind;
    els.status.textContent = text;
  }
  function clearStatus() {
    els.status.className = 'status';
    els.status.textContent = '';
  }
  function showLocationsSaved() {
    clearTimeout(locationsSavedTimer);
    els.locationsSaved.classList.add('show');
    locationsSavedTimer = setTimeout(() => {
      els.locationsSaved.classList.remove('show');
    }, 1800);
  }
  function scheduleLocationSave() {
    if (stateApplying) return;
    clearTimeout(locationSaveTimer);
    els.locationsSaved.classList.remove('show');
    locationSaveTimer = setTimeout(() => {
      vscode.postMessage({
        type: 'save',
        payload: {
          source: 'locations',
          defaultScope: els.defaultScope.value,
          projectSkillsPath: els.projectSkillsPath.value,
          globalSkillsPath: els.globalSkillsPath.value,
          projectAgentsPath: els.projectAgentsPath.value,
          globalAgentsPath: els.globalAgentsPath.value
        }
      });
    }, 500);
  }

  els.toggleKey.addEventListener('click', () => {
    const showing = els.apiKey.type === 'text';
    els.apiKey.type = showing ? 'password' : 'text';
    els.toggleKey.textContent = showing ? 'Show' : 'Hide';
  });

  els.authMode.addEventListener('change', applyAuthModeVisibility);
  els.signInBtn.addEventListener('click', () => {
    vscode.postMessage({ type: 'signIn' });
  });

  els.testBtn.addEventListener('click', () => {
    setStatus('info', 'Testing…');
    els.testBtn.disabled = true;
    vscode.postMessage({
      type: 'test',
      payload: { apiUrl: els.apiUrl.value, apiKey: els.apiKey.value }
    });
  });

  els.saveBtn.addEventListener('click', () => {
    els.saveBtn.disabled = true;
    vscode.postMessage({
      type: 'save',
      payload: {
        apiUrl: els.apiUrl.value,
        authMode: els.authMode.value,
        apiKey: els.apiKey.value,
        entraTenantId: els.entraTenantId.value,
        entraClientId: els.entraClientId.value,
        entraScope: els.entraScope.value,
        source: 'connection',
        defaultScope: els.defaultScope.value,
        projectSkillsPath: els.projectSkillsPath.value,
        globalSkillsPath: els.globalSkillsPath.value,
        projectAgentsPath: els.projectAgentsPath.value,
        globalAgentsPath: els.globalAgentsPath.value
      }
    });
  });

  els.openNative.addEventListener('click', () => {
    vscode.postMessage({ type: 'reveal' });
  });

  els.defaultScope.addEventListener('change', scheduleLocationSave);
  els.projectSkillsPath.addEventListener('input', scheduleLocationSave);
  els.globalSkillsPath.addEventListener('input', scheduleLocationSave);
  els.projectAgentsPath.addEventListener('input', scheduleLocationSave);
  els.globalAgentsPath.addEventListener('input', scheduleLocationSave);

  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg.type === 'state') {
      const p = msg.payload;
      stateApplying = true;
      els.apiUrl.value = p.apiUrl || '';
      els.authMode.value = p.authMode || 'apiKey';
      els.entraTenantId.value = p.entraTenantId || '';
      els.entraClientId.value = p.entraClientId || '';
      els.entraScope.value = p.entraScope || '';
      els.entraAccount.textContent = p.entraAccount
        ? 'Signed in as ' + p.entraAccount
        : 'Not signed in.';
      els.defaultScope.value = p.defaultScope || 'project';
      els.projectSkillsPath.value = p.projectSkillsPath || '';
      els.globalSkillsPath.value = p.globalSkillsPath || '';
      els.projectAgentsPath.value = p.projectAgentsPath || '';
      els.globalAgentsPath.value = p.globalAgentsPath || '';
      els.apiKey.value = '';
      els.keyMeta.textContent = p.hasApiKey
        ? 'Stored key: ' + p.apiKeyPreview
        : 'No key stored.';
      applyAuthModeVisibility();
      stateApplying = false;
    } else if (msg.type === 'testResult') {
      els.testBtn.disabled = false;
      setStatus(msg.payload.ok ? 'ok' : 'err', msg.payload.message);
    } else if (msg.type === 'saved') {
      if (msg.payload && msg.payload.source === 'locations') {
        showLocationsSaved();
      } else {
        els.saveBtn.disabled = false;
        setStatus('ok', 'Saved.');
        setTimeout(clearStatus, 2500);
      }
    }
  });

  vscode.postMessage({ type: 'ready' });
</script>
</body>
</html>`;
  }
}

function defaultGlobalSkillsPlaceholder(): string {
  if (process.platform === 'win32') return '%USERPROFILE%\\.claude\\skills';
  return '$HOME/.claude/skills';
}

function defaultGlobalAgentsPlaceholder(): string {
  if (process.platform === 'win32') return '%USERPROFILE%\\.claude\\agents';
  return '$HOME/.claude/agents';
}

function makeNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < 32; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}
