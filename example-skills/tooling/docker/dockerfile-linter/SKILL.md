# Dockerfile Linter

Reviews a Dockerfile for common issues before the user builds an image.

## When to use

- The user opens a `Dockerfile` and asks to "review" / "improve" / "lint" it.
- The user pastes Dockerfile content into the chat and asks for feedback.

## Checks

- Multi-stage build opportunities for shrinking the final image.
- `apt-get update && apt-get install -y --no-install-recommends` patterns.
- `--no-cache-dir` for pip, `--frozen-lockfile` for yarn etc.
- Ordering of `COPY` instructions to maximise cache hits.
- Running as non-root.
- Pinned base image tags (no `latest`).
