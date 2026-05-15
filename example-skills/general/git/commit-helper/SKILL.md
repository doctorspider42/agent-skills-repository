# Commit Helper

Generates Conventional Commit messages from the current staged diff.

## When to use

- The user asks for a commit message and there are staged changes.
- The user says "make a commit" / "commit this" without specifying a message.

## Behavior

1. Inspect `git diff --cached` to understand what changed.
2. Pick the right Conventional Commit prefix (`feat`, `fix`, `chore`, `refactor`, `docs`, `test`, `build`, `ci`).
3. Write the subject line in imperative mood, ≤ 72 characters, no trailing period.
4. If multiple unrelated changes are staged, suggest splitting them rather than writing a multi-purpose commit.
