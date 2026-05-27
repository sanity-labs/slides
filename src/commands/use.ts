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
    "Change a template's settings — switch it to a different source, or change where Claude saves the decks.";

  static override examples = [
    '<%= config.bin %> <%= command.id %> slides-template --source sanity-labs/slides-template#next',
    '<%= config.bin %> <%= command.id %> slides-template --output ~/Documents/decks',
  ];

  static override args = {
    name: Args.string({
      description: 'The template label (see `slidesctl status` for what you\u2019ve set up).',
      required: true,
    }),
  };

  static override flags = {
    source: Flags.string({
      char: 's',
      description:
        'Switch to a different template source. A GitHub link (`owner/repo` or URL) or a folder on your computer.',
    }),
    output: Flags.string({
      char: 'o',
      description: 'Change where Claude saves the decks it makes.',
    }),
  };

  override async run(): Promise<void> {
    const { args, flags } = await this.parse(Use);
    const state = readState();
    const existing = state.servers[args.name];
    if (!existing) {
      this.error(
        `No template called "${args.name}". Run \`slidesctl status\` to see what\u2019s set up, or \`slidesctl init\` to add a new one.`,
        { exit: 2 },
      );
    }

    const source = flags.source ? parseSource(flags.source, this) : existing.source;
    const outputDir = flags.output ?? existing.outputDir;

    this.log(`Updating "${args.name}"…`);
    this.log(`  Template:    ${formatSource(source)}`);
    this.log(`  Decks saved: ${outputDir}`);
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
    this.log(`\u2713 Done. Restart Claude to pick up the changes.`);
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
  cmd.error(
    `Hmm, "${spec}" doesn\u2019t look like a GitHub repo or a folder path. Try something like \`sanity-labs/slides-template\` or \`./my-template\`.`,
    { exit: 2 },
  );
};
