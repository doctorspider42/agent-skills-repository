# Skills API

Node + TypeScript REST API that exposes Claude Code skills stored in an Azure
Blob Storage container.

## Storage layout

Blobs live in one container (default `skills`):

```
<category>/[<sub>/...]/<skill-name>/SKILL.md
<category>/[<sub>/...]/<skill-name>/skill.yml      (optional)
<category>/[<sub>/...]/<skill-name>/...            (any extra files)
```

Any directory containing `SKILL.md` is treated as a skill. See
[../docs/skill-yml-schema.md](../docs/skill-yml-schema.md) for the metadata
format.

## Setup

```sh
cp .env.example .env
# edit .env — supply AZURE_STORAGE_CONNECTION_STRING and an API_KEYS list

npm install
npm run dev      # ts-node-dev with auto-reload
# or
npm run build && npm start
```

### Seeding example skills

The repo ships with a few demo skills under [`../example-skills/`](../example-skills).
After Azurite (or a real Azure account) is reachable via your `.env`, upload them
in one shot:

```sh
npm run seed                       # uploads ../example-skills
npm run seed -- ./my-skills        # custom source directory
npm run seed -- ./my-skills --wipe # delete every existing blob first
```

The script creates the container if it doesn't exist, walks the source
recursively, skips dot-files, and sets a sensible `Content-Type` per
extension (`.md` → markdown, `.yml` → yaml, etc.).

## Auth

Two schemes are supported, selected via `AUTH_MODE` (`apikey` | `entra` | `both`).

### API key (legacy)

Provide the key via either header:

```
x-api-key: <key>
Authorization: Bearer <key>
```

Keys are configured in `API_KEYS` (comma-separated).

### Entra ID (Microsoft / Azure AD SSO)

When `AUTH_MODE=entra` (or `both`), the API also accepts JWT access tokens issued
by your Entra ID tenant:

```
Authorization: Bearer eyJ0eXAi... (RS256 JWT)
```

The token is validated against the tenant's JWKS endpoint (`iss`, `aud`, `exp`,
signature, optional `scp`/`roles`). Required env vars:

- `ENTRA_TENANT_ID` — your tenant GUID.
- `ENTRA_API_AUDIENCE` — App ID URI of the API App Registration (e.g.
  `api://<api-app-id>`). Must equal the JWT's `aud`.
- `ENTRA_REQUIRED_SCOPE` — optional, e.g. `Skills.Access`. Validated against
  delegated `scp` (user tokens) and `roles` (app-only tokens).
- `ENTRA_ALLOWED_TENANTS` — optional comma list (defaults to `ENTRA_TENANT_ID`).

In `both` mode the middleware tries Entra first if the value looks like a JWT,
then falls back to API key — useful while rolling out SSO to clients.

### `GET /auth/mode`

Returns the server's current `authMode`. The extension uses this to give
better diagnostics when credentials are misconfigured.

## Endpoints

| Method | Path                            | Description                              |
|--------|---------------------------------|------------------------------------------|
| GET    | `/health`                       | Liveness probe (no auth).                |
| GET    | `/auth/verify`                  | Returns `{ ok: true }` if key is valid.  |
| GET    | `/skills`                       | List all skills. `?refresh=1` busts cache. |
| GET    | `/skills/:id`                   | Skill detail + file list.                |
| GET    | `/skills/:id/download`          | ZIP archive of all skill files.          |
| GET    | `/skills/:id/files/<path>`      | Stream a single file.                    |

`:id` is the URL-encoded path inside the container, e.g.
`general%2Fgit%2Fcommit-helper`.

### Example responses

`GET /skills`:

```json
{
  "skills": [
    {
      "id": "general/git/commit-helper",
      "category": ["general", "git"],
      "directoryName": "commit-helper",
      "metadata": {
        "name": "Commit Helper",
        "version": "1.2.0",
        "author": "Jane Doe",
        "description": "Generates conventional commit messages.",
        "tags": ["git", "workflow"]
      },
      "hasMetadataFile": true
    },
    {
      "id": "misc/no-meta-skill",
      "category": ["misc"],
      "directoryName": "no-meta-skill",
      "metadata": {
        "name": "no-meta-skill",
        "version": "unknown",
        "author": "unknown"
      },
      "hasMetadataFile": false
    }
  ]
}
```

## Caching

Skill metadata is cached in memory for `CATALOGUE_TTL_SECONDS` (default 60s).
Set to `0` to disable, or pass `?refresh=1` on `/skills` to force a rebuild.
