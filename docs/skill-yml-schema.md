# `skill.yml` — schema

Each skill directory in Azure Blob Storage may contain a `skill.yml` describing
the skill. The file is **optional**: if missing or malformed, the skill is still
listed by the API but with `unknown` values for the missing fields.

## Location

```
skills/<category>/[<sub>/...]/<skill-name>/
├── SKILL.md         # the prompt body (required for a directory to be treated as a skill)
├── skill.yml        # metadata (optional, recommended)
└── ...              # any extra files the skill needs
```

A directory is recognised as a skill **iff** it contains `SKILL.md`. The skill
ID is its path relative to the container root, e.g. `general/git/commit-helper`.

## Fields

| Field          | Required | Type     | Example                              | Notes                                                                 |
|----------------|----------|----------|--------------------------------------|-----------------------------------------------------------------------|
| `name`         | yes\*    | string   | `Commit Helper`                      | Human-readable name. Falls back to directory name.                    |
| `version`      | yes\*    | string   | `1.2.0`                              | Semver recommended. Falls back to `unknown`.                          |
| `author`       | yes\*    | string   | `Jane Doe <jane@example.com>`        | Falls back to `unknown`.                                              |
| `description`  | no       | string   | `Generates conventional commit msgs` | Short one-liner shown in the tree tooltip.                            |
| `tags`         | no       | string[] | `[git, workflow]`                    | Used for filtering/grouping in the UI.                                |
| `homepage`     | no       | string   | `https://example.com/skills/commit`  | Optional URL.                                                         |
| `minClaudeVer` | no       | string   | `0.5.0`                              | Informational only — not enforced by the API.                         |

\* "Required" here means *expected*. Missing required fields are reported as
`unknown` rather than rejected — the goal is to surface incomplete skills, not
to hide them.

## Example

```yaml
name: Commit Helper
version: 1.2.0
author: Jane Doe <jane@example.com>
description: Generates conventional commit messages from staged diffs.
tags:
  - git
  - workflow
homepage: https://example.com/skills/commit-helper
```

## Validation

The API parses `skill.yml` with `js-yaml` in safe mode. Parse errors are
captured in the skill's `metadataError` field rather than failing the listing —
so a single broken yml never breaks the whole catalogue.
