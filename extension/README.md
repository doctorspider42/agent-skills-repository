# Agent Skills Repository — VS Code extension

Browse, install and update agent skills hosted in your private Skills API.

## Features

- Tree view of all available skills, grouped by category path.
- Three states per skill: not installed, installed, **update available** (badge
  appears when the version in the catalogue differs from the locally installed
  one).
- Right-click actions: Preview / Install / Uninstall / Update / Reveal in Explorer.
- Read-only skill preview opens `SKILL.md` directly from the repository before
  installation.
- Install location picker: **Global** (`~/.claude/skills`), **Project**
  (`./.github/skills` or `./.claude/skills`) or any custom directory.
- Two authentication modes (per the `agentSkills.authMode` setting):
  - `apiKey` — legacy shared key stored in the OS keychain via `vscode.SecretStorage`.
  - `entra` — sign in with your Microsoft / company account via Entra ID (Azure AD).
    Uses VS Code's built-in Microsoft provider (automatic token refresh, no client secret).
- "Test Connection" command pings `GET /auth/verify` to validate the URL + credentials,
  and (in Entra mode) reports the signed-in account.

## Setup

1. Install the extension (`npm install && npm run build`, then F5 to launch an
   Extension Development Host, or `vsce package` to produce a `.vsix`).
2. Open the **Agent Skills Repository** view (gear icon → Open Settings) and set:
   - **API URL** — your Skills API base URL.
   - **API key** — paste it; stored in the OS-native secret store.
   - **Default scope** — `global` or `project`.
   - **Project skills path** — defaults to `.github/skills`.
   - **Global skills path** — defaults to `~/.claude/skills`.
3. Click **Test Connection** to verify. It now asserts the endpoint returns
   `{ok:true}`, so a stray app on the same port can't pass.
4. Use **Refresh** to load the catalogue.

## How install tracking works

Each install directory keeps a `.skills-manifest.json` with one entry per
installed skill:

```json
{
  "version": 1,
  "skills": {
    "general/git/commit-helper": {
      "id": "general/git/commit-helper",
      "name": "Commit Helper",
      "installedVersion": "1.2.0",
      "source": "https://skills.example.com",
      "installedAt": "2026-05-15T10:00:00.000Z",
      "files": ["SKILL.md", "skill.yml"],
      "scope": "project",
      "installPath": "/abs/path/.github/skills/commit-helper"
    }
  }
}
```

The extension reads this file from both the project and global locations to
decide whether a skill is installed and which version. Don't edit it by hand
unless you know what you're doing — uninstall through the UI instead.

## Commands

| Command                          | Title                       |
|----------------------------------|-----------------------------|
| `agentSkills.refresh`            | Refresh tree                |
| `agentSkills.openSettings`       | Open Settings (webview)     |
| `agentSkills.testConnection`     | Test Connection             |
| `agentSkills.setApiKey`          | Set API Key                 |
| `agentSkills.clearApiKey`        | Clear API Key               |
| `agentSkills.signIn`             | Sign in with Microsoft      |
| `agentSkills.signOut`            | Sign out (Accounts menu)    |
| `agentSkills.preview`            | Preview Skill               |
| `agentSkills.install`            | Install (tree context)      |
| `agentSkills.uninstall`          | Uninstall (tree context)    |
| `agentSkills.update`             | Update (tree context)       |
| `agentSkills.openSkillFolder`    | Reveal installed folder     |
