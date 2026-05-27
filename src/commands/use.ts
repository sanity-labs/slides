/**
 * `slidesctl use <name>` — update an installed server.
 *
 * Two modes:
 *   - With `--source`, swap the template (clone fresh + rebuild).
 *   - With `--output` only, just change where decks land.
 *   - With no flags, re-run the install for this name (refreshes the
 *     cached template to the latest commit on its current ref).
 */

import { Args, Command, Flags } from '@oclif/core';
import { homedir } from 'node:os';
import { parseGithubSpec, formatSource } from '../init/github.js';
import { installServer } from '../init/install.js';
import { readState, type TemplateSource } from '../init/state.js';

export default class Use extends Command {
  static override description =
    'Update an installed slides server — refresh its template, swap to a new source, or change its output dir.';

  static override examples = [
    '<%= config.bin %> <%= command.id %> sanity-slides',
    '<%= config.bin %> <%= command.id %> sanity-slides --source sanity-labs/slides-template#next',
    '<%= config.bin %> <%= command.id %> sanity-slides --output ~/Documents/decks',
  ];

  static override args = {
    name: Args.string({ description: 'Server name to update.', required: true }),
  };

  static override flags = {
    source: Flags.string({
      char: 's',
      description:
        'New template source (github `owner/repo[#ref]` or local path). Omit to refresh in place.',
    }),
    output: Flags.string({ char: 'o', description: 'New output directory.' }),
  };

  override async run(): Promise<void> {
    const { args, flags } = await this.parse(Use);
    const state = readState();
    const existing = state.servers[args.name];
    if (!existing) {
      this.error(
        `No server named "${args.name}". Run \`slidesctl status\` to list installed servers, or \`slidesctl init\` to add one.`,
        { exit: 2 },
      );
    }

    const source = flags.source ? parseSource(flags.source, this) : existing.source;
    const outputDir = flags.output ?? existing.outputDir;

    this.log(`Updating ${args.name}…`);
    this.log(`  source:  ${formatSource(source)}`);
    this.log(`  output:  ${outputDir}`);
    this.log(`  clients: ${existing.clients.join(', ')}`);
    this.log('');

    const result = installServer({
      name: args.name,
      source,
      outputDir,
      clients: existing.clients,
      logger: {
        info: (msg) => process.stdout.write(`  ${msg}\n`),
        warn: (msg) => process.stderr.write(`  ${msg}\n`),
      },
    });

    if (!result.ok) this.error(result.message, { exit: 1 });

    this.log('');
    this.log(`\u2713 Updated "${args.name}". Restart your MCP client to pick up changes.`);
  }
}

const parseSource = (spec: string, cmd: Command): TemplateSource => {
  const github = parseGithubSpec(spec);
  if (github) {
    return github.ref
      ? { kind: 'github', owner: github.owner, repo: github.repo, ref: github.ref }
      : { kind: 'github', owner: github.owner, repo: github.repo };
  }
  if (spec.startsWith('.') || spec.startsWith('/') || spec.startsWith('~')) {
    return { kind: 'local', path: spec.replace(/^~/, homedir()) };
  }
  cmd.error(`Could not parse "${spec}" as a GitHub repo or local path.`, { exit: 2 });
};
