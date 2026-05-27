/**
 * `slidesctl update` — refresh template sources to their latest commit.
 *
 * Templates from GitHub are cloned to a local cache at install time. The
 * MCP server keeps pointing at the cached `dist/index.js` indefinitely —
 * if the upstream repo gets new commits, we don't see them until we
 * re-fetch. `slidesctl update` does that re-fetch: `git pull` (or fresh
 * clone if the cache is gone), reinstall, rebuild.
 *
 * Without arguments, updates every installed server. Pass a specific name
 * to update one. Local-path sources are no-ops (nothing to fetch).
 */

import { Args, Command, Flags } from '@oclif/core';
import { formatSource } from '../init/github.js';
import { installServer } from '../init/install.js';
import { readState } from '../init/state.js';

export default class Update extends Command {
  static override description =
    'Pull the latest changes for templates you got from GitHub. By default, updates all of them.';

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> slides-template',
  ];

  static override args = {
    name: Args.string({
      description:
        'Just update one template (see `slidesctl status` for names). Omit to update all.',
      required: false,
    }),
  };

  static override flags = {
    all: Flags.boolean({
      description: 'Update every template you have set up. (Same as omitting the name argument.)',
      default: false,
    }),
  };

  override async run(): Promise<void> {
    const { args, flags } = await this.parse(Update);
    const state = readState();
    const all = Object.values(state.servers);

    if (all.length === 0) {
      this.log('You haven\u2019t set up any templates yet. Run `slidesctl init` to add one.');
      return;
    }

    const targets = args.name
      ? all.filter((s) => s.name === args.name)
      : flags.all || !args.name
        ? all
        : [];

    if (args.name && targets.length === 0) {
      this.error(
        `No template called "${args.name}". Run \`slidesctl status\` to see what\u2019s set up.`,
        { exit: 2 },
      );
    }

    let updated = 0;
    let skipped = 0;
    let failed = 0;
    for (const server of targets) {
      if (server.source.kind === 'local') {
        this.log(
          `- ${server.name}: this one points at a local folder, so there\u2019s nothing to pull.`,
        );
        skipped++;
        continue;
      }
      this.log(`Updating ${server.name} (${formatSource(server.source)})…`);
      const result = installServer({
        name: server.name,
        source: server.source,
        outputDir: server.outputDir,
        clients: server.clients,
        logger: {
          info: (msg) => process.stdout.write(`  ${msg}\n`),
          warn: (msg) => process.stderr.write(`  ${msg}\n`),
        },
      });
      if (result.ok) {
        this.log(`  \u2713 ${server.name}`);
        updated++;
      } else {
        this.log(`  \u2717 ${server.name}: ${result.message}`);
        failed++;
      }
    }

    this.log('');
    const parts: string[] = [];
    if (updated > 0) parts.push(`updated ${updated}`);
    if (skipped > 0) parts.push(`skipped ${skipped}`);
    if (failed > 0) parts.push(`failed ${failed}`);
    this.log(`Done — ${parts.join(', ')}.`);
    if (updated > 0) {
      this.log('Restart Claude to pick up the new template versions.');
    }
    if (failed > 0) process.exit(1);
  }
}
