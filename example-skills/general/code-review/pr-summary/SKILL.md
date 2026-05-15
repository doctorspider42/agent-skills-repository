# PR Summary

Generates a concise pull request description from the current branch diff.

## When to use

- The user asks to "write a PR description", "summarize this PR", or "what changed".
- The user is about to open a pull request and wants a starting point.

## Behavior

1. Run `git log <base>..<head> --oneline` to list commits in scope.
2. Run `git diff <base>...<head> --stat` for a file-level overview.
3. Produce a description with:
   - **Summary** — 2-4 bullets covering the *why*, not the *what*
   - **Changes** — file-level breakdown grouped by concern (UI, API, tests, config)
   - **Test plan** — a checklist of manual or automated checks a reviewer should perform
4. Keep the tone neutral and factual. Do not invent details not visible in the diff.

## Notes

- Default base branch is `main`; use `origin/main` if the local ref may be stale.
- If the diff is too large (> 300 changed files) warn the user and summarise by directory only.
