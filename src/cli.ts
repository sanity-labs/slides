#!/usr/bin/env node
/**
 * `slidesctl` — the CLI bin shipped with `@sanity-labs/slides`.
 *
 * Commands (each in its own file under `src/commands/`):
 *
 *   init          Install a slides MCP server entry (interactive wizard).
 *   status        Print installed servers and which MCP clients have them wired up.
 *   update        Refresh installed templates to their latest commit.
 *   use           Change an installed server's source or output directory.
 *   remove        Uninstall a slides MCP server entry.
 *   serve         Start an MCP server over stdio.
 *   generate      Read { title, slides } JSON from stdin, write a .pptx file.
 *   list          Print the slide types a template exposes.
 *   scaffold      Scaffold a new brand template into <dir>.
 *   create-deck   Scaffold an agent-writable deck project into <dir>.
 *   skill         Print the bundled SKILL.md.
 *
 * Run `slidesctl --help` for the auto-generated usage from oclif, or
 * `slidesctl <command> --help` for per-command help (flags, examples).
 *
 * This file is a thin dispatch shim — every command's implementation lives
 * in `src/commands/<name>.ts`. oclif discovers them at runtime via the
 * `oclif.commands` field in `package.json`.
 */

import { execute } from '@oclif/core';

// pnpm's content-addressed install layout means `process.argv[1]` is the
// `.bin` symlink while `import.meta.url` is the realpath under `.pnpm/`.
// `execute({ dir })` resolves the package root from `import.meta.url` so
// both invocation modes (direct, via .bin) find the same `oclif.commands`.
await execute({ dir: import.meta.url });
