#!/usr/bin/env node
/**
 * Entry point for `pnpm harness`.
 *
 * Real Claude session drives the real `slidesctl serve` subprocess
 * through MCP. Designed to be invoked from a developer's terminal while
 * iterating on the tool surface — never CI. Requires:
 *
 *   - `pnpm build` first (the subprocess runs `dist/cli.js`)
 *   - `ANTHROPIC_API_KEY` env var (real API calls)
 *
 * Use `--only NAME` to focus on a single scenario, `--verbose` to see
 * the per-turn trace (tool calls, results, final message).
 *
 * Override the model with `HARNESS_MODEL=claude-...` (default
 * claude-opus-4-7).
 */

import { parseArgs } from 'node:util';
import { runAll } from './runner.js';
import { scenarios } from './scenarios.js';

const main = async (): Promise<void> => {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    strict: true,
    allowPositionals: false,
    options: {
      verbose: { type: 'boolean', short: 'v', default: false },
      only: { type: 'string', short: 'o' },
      'keep-output': { type: 'string', short: 'k' },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });

  if (values.help) {
    process.stdout.write(
      `Usage: pnpm harness [--verbose] [--only NAME]\n\n` +
        `Drives a real Claude session through the slidesctl MCP server for each\n` +
        `scenario in test/harness/scenarios.ts. Asserts that the agent reaches\n` +
        `the expected outcome (right tools called, .pptx produced, brand lock\n` +
        `respected, etc.).\n\n` +
        `Requires:\n` +
        `  - \`pnpm build\` first.\n` +
        `  - ANTHROPIC_API_KEY set (in .env or in your shell).\n\n` +
        `Options:\n` +
        `  -v, --verbose          Print the per-turn tool-call trace and stderr tail.\n` +
        `  -o, --only NAME        Run only scenarios whose name matches NAME (substring).\n` +
        `  -k, --keep-output DIR  Copy every produced .pptx into DIR before the\n` +
        `                         scenario's tmp dir is swept. Filenames are prefixed\n` +
        `                         with the scenario name to avoid collisions.\n` +
        `                         Example: --keep-output ~/Downloads\n` +
        `  -h, --help             Show this message.\n\n` +
        `Env:\n` +
        `  ANTHROPIC_API_KEY   Required. Auto-loaded from .env at the repo root\n` +
        `                      (copy .env.template to .env to set it).\n` +
        `  HARNESS_MODEL       Model id (default: claude-opus-4-7).\n\n` +
        `Available scenarios:\n` +
        scenarios.map((s) => `  - ${s.name}`).join('\n') +
        '\n',
    );
    process.exit(0);
  }

  const selected = values.only
    ? scenarios.filter((s) => s.name.includes(values.only as string))
    : scenarios;
  if (selected.length === 0) {
    process.stderr.write(`No scenarios matched --only=${values.only}\n`);
    process.exit(2);
  }

  const keepOutputDir = (values['keep-output'] as string | undefined) ?? undefined;
  const results = await runAll(selected, {
    verbose: values.verbose === true,
    ...(keepOutputDir ? { keepOutputDir } : {}),
  });
  const failed = results.filter(
    (r) => r.error !== undefined || r.verdicts.some((v) => !v.pass && v.level === 'fail'),
  );
  process.exit(failed.length === 0 ? 0 : 1);
};

void main();
