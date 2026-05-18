# Configuring Microsoft Entra ID (Azure AD) SSO

End-to-end walkthrough for replacing the static API key with Microsoft / company
SSO. This is the **detailed reference** — for the architectural overview see the
"Auth" section of [`api/README.md`](../api/README.md) and the [extension README](../extension/README.md).

You will configure **three things**:

1. **Two App Registrations** in your Entra ID tenant (one for the API, one for the VS Code client — the second is optional but recommended).
2. **API server env vars** (`AUTH_MODE`, `ENTRA_*`).
3. **VS Code extension settings** (`agentSkills.authMode`, `agentSkills.entra.*`).

> **Who needs to do this?** Steps 1 and 2 are one-time and require an Entra ID
> Global / Cloud Application Administrator. Step 3 is per-user.

---

## Prerequisites

- An Azure subscription on the same tenant as your company Microsoft accounts.
- Access to **Azure Portal → Microsoft Entra ID** with permission to create App Registrations and grant admin consent.
- Skills API already deployed somewhere your users can reach (App Service, Container Apps, on-prem behind VPN, etc.) — the auth setup doesn't care *where* it runs.

---

## Step 1 — Find your Tenant ID

This is the GUID identifying your whole organisation.

1. [Azure Portal](https://portal.azure.com/) → search "Microsoft Entra ID" → click it.
2. On the **Overview** blade you'll see **Tenant ID** (a GUID like `e8a1f527-…-…-…-…`).
3. Copy it — you'll need it for both the API (`ENTRA_TENANT_ID`) and the extension (`agentSkills.entra.tenantId`).

---

## Step 2 — Register the API app ("skills-api")

This represents your backend. Tokens issued by Entra will name this app as their
**audience** (`aud` claim).

1. **Microsoft Entra ID → App registrations → + New registration**.
2. Fields:
   - **Name**: `skills-api` (or whatever — only humans see it).
   - **Supported account types**: *Accounts in this organizational directory only — single tenant*.
   - **Redirect URI**: leave empty (this app is the resource, not the client).
3. Click **Register**.

On the **Overview** page of the newly created app, copy:

| Where on the screen          | Value name                              | Used as                              |
|------------------------------|-----------------------------------------|--------------------------------------|
| "Application (client) ID"    | API app **client ID** (GUID)            | Building the Application ID URI      |
| "Directory (tenant) ID"      | (same Tenant ID as step 1)              | sanity-check                         |

### 2a — Expose an API & define a scope

1. In the `skills-api` app → **Expose an API** (left nav).
2. **Application ID URI** → click **Add** → accept the default `api://<api-app-client-id>` (or set a friendly URI like `api://skills.example.com`). **Save**.

   > **Write this value down** — this is what goes into:
   > - API env `ENTRA_API_AUDIENCE`
   > - the **beginning** of the extension's `agentSkills.entra.scope`

3. Under **Scopes defined by this API** → **+ Add a scope**:
   - **Scope name**: `Skills.Access`
   - **Who can consent?**: *Admins and users* (or *Admins only* if you want a consent gate).
   - **Admin / user consent display name + description**: short human-readable strings, e.g. *"Access Skills repository"* / *"Allows the extension to read and download skills."*
   - **State**: *Enabled*.
   - **Add scope**.

   The full scope identifier will now be shown — it looks like:

   ```
   api://<api-app-client-id>/Skills.Access
   ```

   **This whole string** is what you put into the extension's
   `agentSkills.entra.scope` setting later.

---

## Step 3 — Register the VS Code client app ("skills-vscode") *(optional but recommended)*

If you skip this, the extension will use VS Code's built-in Microsoft client. That
works in most tenants, but some Conditional Access policies block it. With your
own client app you also get cleaner audit logs ("who signed in to skills-vscode")
and full control over consent.

1. **Microsoft Entra ID → App registrations → + New registration**.
2. Fields:
   - **Name**: `skills-vscode`.
   - **Supported account types**: *Single tenant*.
   - **Redirect URI**:
     - **Platform**: *Mobile and desktop applications*.
     - **URI**: `https://vscode.dev/redirect` (this is the URI VS Code's Microsoft provider uses).
3. **Register**.
4. On the new app's **Overview**, copy **Application (client) ID** — this is what goes into the extension setting `agentSkills.entra.clientId`.
5. Left nav → **Authentication**:
   - Confirm there's a redirect URI under "Mobile and desktop applications" pointing at `https://vscode.dev/redirect`.
   - Under **Advanced settings** → **Allow public client flows** → set to **Yes** → **Save**.
     (Public client = no client secret; required for PKCE.)
6. Left nav → **API permissions** → **+ Add a permission** → **My APIs** → pick `skills-api` → **Delegated permissions** → tick `Skills.Access` → **Add permissions**.
7. Click **Grant admin consent for \<tenant\>** → **Yes**. Without this step every user gets a consent prompt on first login (annoying but not blocking).

---

## Step 4 — Configure the API server

Edit `api/.env` (or App Settings on Azure App Service / Container Apps secrets / Key Vault references — wherever you keep them):

```env
# Switch to dual mode while you migrate clients off API keys; flip to 'entra' once everyone is on the new extension version.
AUTH_MODE=both

# From Step 1
ENTRA_TENANT_ID=<your-tenant-id-guid>

# From Step 2a — the Application ID URI of the skills-api app
ENTRA_API_AUDIENCE=api://<api-app-client-id>

# The scope name you defined in Step 2a — must be EXACTLY what you'll require.
ENTRA_REQUIRED_SCOPE=Skills.Access

# Optional: if you ever want to accept tokens from multiple tenants, comma-separated GUIDs.
# Defaults to ENTRA_TENANT_ID alone if left empty.
ENTRA_ALLOWED_TENANTS=

# Optional: clock skew tolerance in seconds. 300 (5 min) is the default and usually fine.
ENTRA_CLOCK_TOLERANCE_SECONDS=300

# Keep the legacy keys around during migration. Drop this whole line once AUTH_MODE=entra.
API_KEYS=dev-key-change-me
```

Restart the API. Verify:

```sh
curl https://<your-api-host>/auth/mode
# → { "authMode": "both" }
```

A request without any auth should now get `401`:

```sh
curl -i https://<your-api-host>/auth/verify
# HTTP/1.1 401 Unauthorized
# { "error": "unauthorized", "message": "Missing credentials …" }
```

---

## Step 5 — Configure the VS Code extension

In each developer's VS Code (Settings → Agent Skills Repository, or the in-extension Settings panel):

| Setting                          | Value                                                        | Where it comes from                              |
|----------------------------------|--------------------------------------------------------------|--------------------------------------------------|
| `agentSkills.apiUrl`             | `https://<your-api-host>`                                    | Wherever you deployed the API.                   |
| `agentSkills.authMode`           | `entra`                                                      | Switches the extension into SSO mode.            |
| `agentSkills.entra.tenantId`     | The Tenant ID GUID                                           | Step 1.                                          |
| `agentSkills.entra.scope`        | `api://<api-app-client-id>/Skills.Access`                    | Step 2a — the full scope shown in *Expose an API*. |
| `agentSkills.entra.clientId`     | The `skills-vscode` Application (client) ID, **or** empty    | Step 3, leave empty to use VS Code's built-in app. |

The fastest path: open **Command Palette → Agent Skills: Open Settings** and fill the
**Authentication** section. The legacy *API Key* block is hidden as soon as you pick
*Microsoft Entra ID (SSO)* from the dropdown.

Then:

1. **Command Palette → Agent Skills: Sign in with Microsoft.** A Microsoft popup opens (or
   the system browser, on first run); pick your work account. After consent, the
   bottom-left **Accounts** icon shows you're signed in.
2. **Command Palette → Agent Skills: Test Connection.** Should report:

   ```
   Connection OK — https://<your-api-host> — signed in as <you@example.com>
   ```

If you instead see:

- *"AADSTS65001: The user or administrator has not consented…"* → admin consent
  wasn't granted in Step 3.7, **or** the scope in the extension doesn't match the
  scope defined on the API app.
- *"Token claim invalid: aud …"* → the extension's `agentSkills.entra.scope`
  doesn't match the API's `ENTRA_API_AUDIENCE`. They have to share the same
  `api://<id>` prefix.
- *"Token is missing required scope/role 'Skills.Access'"* → the scope name in
  the extension setting doesn't match `ENTRA_REQUIRED_SCOPE` on the API.

---

## Step 6 — Roll-out

Recommended order (so nobody loses access mid-migration):

1. Deploy the API with `AUTH_MODE=both` and the `ENTRA_*` env vars. Existing extensions on the old version keep working with their API keys.
2. Ship the new extension version (v0.4+) to the team. They opt in by switching `agentSkills.authMode` to `entra` in their settings.
3. After every active user has signed in at least once (watch the API logs — each successful Entra request logs the user's `oid`), flip the server to `AUTH_MODE=entra` and remove `API_KEYS` from the secrets store.
4. Optionally: pin extension version ≥ 0.4 via your MDM / VS Code policy.

---

## Quick reference — every value & where it comes from

| Knob                                  | Format / example                                         | Source                                                                                                  |
|---------------------------------------|----------------------------------------------------------|---------------------------------------------------------------------------------------------------------|
| `ENTRA_TENANT_ID`                     | `e8a1f527-…`                                             | **Entra ID → Overview → Tenant ID** (Step 1)                                                            |
| `ENTRA_API_AUDIENCE`                  | `api://<api-app-client-id>` or `api://skills.example.com`| **App reg `skills-api` → Expose an API → Application ID URI** (Step 2a)                                 |
| `ENTRA_REQUIRED_SCOPE`                | `Skills.Access`                                          | **App reg `skills-api` → Expose an API → Scopes → Scope name** (Step 2a)                                |
| `agentSkills.entra.tenantId`          | (same GUID as `ENTRA_TENANT_ID`)                         | Step 1                                                                                                  |
| `agentSkills.entra.scope`             | `api://<api-app-client-id>/Skills.Access`                | Step 2a — concatenation of *Application ID URI* + `/` + *Scope name*                                    |
| `agentSkills.entra.clientId` *(opt.)* | `b3c9c8d2-…`                                             | **App reg `skills-vscode` → Overview → Application (client) ID** (Step 3)                                |

> **Common mistake:** `ENTRA_API_AUDIENCE` is *just* the Application ID URI
> (`api://...`), while `agentSkills.entra.scope` is the **full scope string**
> (`api://.../Skills.Access`). They are related but **not** the same.

---

## Troubleshooting

### "User account is not found in the directory"
The user is signing in with a personal Microsoft account but your `skills-api`
is single-tenant. Either use a work account or change the app's supported
account types in *Authentication → Supported account types*.

### Conditional Access blocks the sign-in
If your tenant requires MFA / device compliance / specific networks, the
Microsoft popup may fail silently in the Extension Development Host. Test in a
real, signed-in VS Code instance; ask your admin to scope a Conditional Access
exception to the `skills-vscode` app if necessary.

### Sign-out doesn't seem to work
VS Code doesn't expose a programmatic way to clear a session from the built-in
Microsoft provider. Use the **Accounts** icon (bottom-left of VS Code) →
**Microsoft → Sign out**. The Skills tree will refresh automatically.

### Token expired errors right after sign-in
Check the server's clock — `ENTRA_CLOCK_TOLERANCE_SECONDS` defaults to 5 minutes.
A drifting App Service host can reject otherwise-valid tokens. Sync NTP or
bump the tolerance.
