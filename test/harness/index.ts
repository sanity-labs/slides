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
 *
 * Flag parsing is declarative via `@oclif/core` (matches `slidesctl` and
 * the rest of the Sanity CLI family). The harness has no subcommands —
 * the whole CLI is one `Harness` command class.
 */

import { Command, Flags } from '@oclif/core';
import { runAll } from './runner.js';
import { scenarios } from './scenarios.js';

class Harness extends Command {
  static override description =
    'Drive a real Claude session through the slidesctl MCP server for every scenario.';

  static override examples = [
    'pnpm harness',
    'pnpm harness --only tier2-pitch-deck --verbose',
    'pnpm harness --only tier2-pitch-deck --keep-output ~/Downloads',
    'HARNESS_MODEL=claude-sonnet-4-6 pnpm harness',
  ];

  static override flags = {
    verbose: Flags.boolean({
      char: 'v',
      description: 'Print the per-turn tool-call trace and stderr tail.',
      default: false,
    }),
    only: Flags.string({
      char: 'o',
      description: 'Run only scenarios whose name matches NAME (substring).',
    }),
    'keep-output': Flags.string({
      char: 'k',
      description:
        'Copy every produced .pptx into DIR before the scenario tmp dir is swept. ' +
        'Filenames are prefixed with the scenario name. Example: --keep-output ~/Downloads',
    }),
  };

  override async run(): Promise<void> {
    const { flags } = await this.parse(Harness);

    const selected = flags.only
      ? scenarios.filter((s) => s.name.includes(flags.only as string))
      : scenarios;
    if (selected.length === 0) {
      this.error(`No scenarios matched --only=${flags.only}`, { exit: 2 });
    }

    const keepOutputDir = flags['keep-output'];
    const results = await runAll(selected, {
      verbose: flags.verbose,
      ...(keepOutputDir ? { keepOutputDir } : {}),
    });
    const failed = results.filter(
      (r) => r.error !== undefined || r.verdicts.some((v) => !v.pass && v.level === 'fail'),
    );
    process.exit(failed.length === 0 ? 0 : 1);
  }
}

// Standalone `Command.run()` doesn't include the help-plugin auto-handler
// that the `slidesctl` runner gets via `execute()` — the Help plugin needs a
// registered Config and a commands directory, both of which are overkill for
// a single-command CLI. Intercept --help / -h ourselves and render a static
// help block; everything else falls through to oclif's flag parser.
const argv = process.argv.slice(2);
if (argv.includes('--help') || argv.includes('-h')) {
  printHelp();
  process.exit(0);
}

// `Command.run(argv)` re-throws CLIErrors instead of converting them into a
// clean stderr + exit. Catch ourselves to keep the failure output friendly
// (oclif's full `execute()` runner does this via Config; we don't need that
// scaffolding for a single-command CLI).
try {
  await Harness.run(argv, import.meta.url);
} catch (err) {
  const exit =
    err &&
    typeof err === 'object' &&
    'oclif' in err &&
    (err as { oclif?: { exit?: number } }).oclif?.exit !== undefined
      ? (err as { oclif: { exit: number } }).oclif.exit
      : 1;
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`${message}\n`);
  process.exit(exit);
}

function printHelp(): void {
  const flags = [
    '  -v, --verbose          Print the per-turn tool-call trace and stderr tail.',
    '  -o, --only NAME        Run only scenarios whose name matches NAME (substring).',
    '  -k, --keep-output DIR  Copy every produced .pptx into DIR before the scenario',
    '                         tmp dir is swept. Example: --keep-output ~/Downloads',
    '  -h, --help             Show this message.',
  ].join('\n');
  const env = [
    '  ANTHROPIC_API_KEY   Required. Auto-loaded from .env at the repo root',
    '                      (copy .env.template to .env to set it).',
    '  HARNESS_MODEL       Model id (default: claude-opus-4-7).',
  ].join('\n');
  process.stdout.write(
    `Usage: pnpm harness [flags]\n\n` +
      `Drive a real Claude session through the slidesctl MCP server for every scenario.\n\n` +
      `Flags:\n${flags}\n\n` +
      `Env:\n${env}\n\n` +
      `Available scenarios:\n` +
      scenarios.map((s) => `  - ${s.name}`).join('\n') +
      '\n',
  );
}
