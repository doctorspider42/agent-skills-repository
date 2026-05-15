# Skills Repository

A two-piece system for distributing Claude Code skills inside an organisation:

```
┌──────────────────┐    HTTPS + API key    ┌──────────────────┐    Azure SDK    ┌────────────────┐
│  VS Code         │  ───────────────────► │  Node/Express    │  ─────────────► │  Azure Blob    │
│  extension       │  ◄───────────────────  │  Skills API      │  ◄─────────────  │  Storage       │
└──────────────────┘   JSON / ZIP / files  └──────────────────┘                  └────────────────┘
```

- **[`api/`](./api/)** — TypeScript REST API. Reads a single Azure Blob container, parses each skill's
  `skill.yml`, serves a catalogue and per-skill ZIP / file downloads.
- **[`extension/`](./extension/)** — VS Code extension. Renders a tree view, downloads ZIPs, manages
  installs through a local `.skills-manifest.json`.
- **[`docs/skill-yml-schema.md`](./docs/skill-yml-schema.md)** — required and optional fields in
  `skill.yml`. The yml file is **optional**: skills without one still show up, just with
  `unknown` for missing fields.

## Storage layout

```
container: skills
├── general/
│   └── git/
│       └── commit-helper/
│           ├── SKILL.md          ← required: marks the directory as a skill
│           ├── skill.yml         ← optional but recommended
│           └── ...
└── tooling/
    └── docker/
        └── dockerfile-linter/
            ├── SKILL.md
            └── skill.yml
```

A directory is recognised as a skill iff it contains `SKILL.md`. Any other
files in the same directory are bundled into the install ZIP.

## End-to-end flow

1. User installs the VS Code extension and configures `apiUrl` + API key.
2. Extension calls `GET /skills`, builds a tree by category path.
3. User picks a skill → `Install`. Extension prompts for scope (Global /
   Project / Custom).
4. Extension calls `GET /skills/<id>/download`, unzips into the chosen
   directory, writes an entry into `.skills-manifest.json`.
5. Next refresh, the extension compares installed version with the API's
   version. If they differ, the skill is flagged as *update available* and
   shows an inline "update" button.

## Quick start

```sh
# API
cd api
cp .env.example .env             # fill in Azure connection + API_KEYS
npm install
npm run dev                      # http://localhost:3000

# Extension
cd ../extension
npm install
npm run build
# Open the folder in VS Code, press F5 → "Extension Development Host"
```

Then in the Dev Host:
1. Settings → `agentSkills.apiUrl` → `http://localhost:3001`
2. Cmd/Ctrl-Shift-P → **Agent Skills: Set API Key** → paste a key from `API_KEYS`
3. Cmd/Ctrl-Shift-P → **Agent Skills: Test Connection** → should say OK
4. Activity Bar → Agent Skills Repository → browse, install, update.

## Endpoint summary

| Method | Path                              | Returns                                        |
|--------|-----------------------------------|------------------------------------------------|
| GET    | `/health`                         | `{status:'ok'}` (no auth)                      |
| GET    | `/auth/verify`                    | `{ok:true}` — used by "Test Connection"        |
| GET    | `/skills`                         | `{skills:[SkillSummary…]}`                     |
| GET    | `/skills/:id`                     | `SkillDetail` (summary + file list)            |
| GET    | `/skills/:id/download`            | `application/zip` archive of the skill         |
| GET    | `/skills/:id/files/<rel-path>`    | Streamed file contents                         |

`:id` is the URL-encoded blob path of the skill directory, e.g.
`general%2Fgit%2Fcommit-helper`.

See [`api/README.md`](./api/README.md) and [`extension/README.md`](./extension/README.md) for
package-level docs.
