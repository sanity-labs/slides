---
'@sanity-labs/slides': minor
---

`slidesctl init` and friends — first-class multi-template setup.

Four new commands transform first-time-user setup from "manually edit JSON config" into a guided wizard:

- **`slidesctl init`** — interactive wizard. Pick a template (GitHub repo or local directory), choose a server name, pick an output dir, pick which MCP clients to install into. The framework clones, builds, and writes the config. Pass `--yes` plus flags for non-interactive use.
- **`slidesctl status`** — show installed servers, where their templates live on disk, and which MCP clients have them wired up.
- **`slidesctl use <name>`** — refresh a server's template to the latest commit, swap to a different source, or change its output dir. Re-uses the existing install for the same server name.
- **`slidesctl remove <name>`** — clean uninstall from every MCP client config. Pass `--purge` to also delete the cached template.

GitHub sources are cloned to `~/.local/share/slidesctl/templates/<name>/`, dependency-installed (pnpm if `pnpm-lock.yaml` is present, npm otherwise), and built. State lives at `~/.config/slidesctl/state.json` so the same template can be re-used across reinstalls.

Multi-template Claude setups now work cleanly — every server is its own MCP entry with its own output dir, so running both `sanity-slides` and `acme-slides` side-by-side just works.
