# Changesets

When you change anything in `packages/slides/`, run `pnpm changeset` and describe what changed. Commit the resulting Markdown file alongside your code. The release workflow opens a "Version Packages" PR collecting every queued changeset; merging that PR publishes `@sanity-labs/slides` to npm.

This repo ships exactly one package, so the only choice you make when running `pnpm changeset` is the bump level (patch / minor / major).
