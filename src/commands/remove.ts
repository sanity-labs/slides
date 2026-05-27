/**
 * `slidesctl remove <name>` — uninstall a slides MCP server entry.
 *
 * Removes the server from every MCP client config it was wired into and
 * deletes the slidesctl state entry. By default, the cached template
 * directory is left on disk so the user can re-add the server without
 * re-cloning; pass `--purge` to delete the cache too.
 */

import { existsSync, rmSync } from 'node:fs';
import { Args, Command, Flags } from '@oclif/core';
import { uninstallServer } from '../init/install.js';

export default class Remove extends Command {
  static override description =
    'Remove a template you previously set up. Claude will no longer see it after the next restart.';

  static override examples = [
    '<%= config.bin %> <%= command.id %> slides-template',
    '<%= config.bin %> <%= command.id %> slides-template --purge',
  ];

  static override args = {
    name: Args.string({
      description: 'The template label to remove (see `slidesctl status`).',
      required: true,
    }),
  };

  static override flags = {
    purge: Flags.boolean({
      description: 'Also delete the downloaded template files from your computer.',
      default: false,
    }),
  };

  override async run(): Promise<void> {
    const { args, flags } = await this.parse(Remove);
    const server = uninstallServer({ name: args.name });
    if (!server) {
      this.error(`There\u2019s no template called "${args.name}" set up.`, { exit: 2 });
    }

    const appCount = server.clients.length;
    const appWord = appCount === 1 ? 'app' : 'apps';
    this.log(`Removed "${args.name}" from ${appCount} ${appWord}.`);

    if (server.cacheDir) {
      if (flags.purge) {
        if (existsSync(server.cacheDir)) {
          rmSync(server.cacheDir, { recursive: true, force: true });
          this.log(`Deleted downloaded files at ${server.cacheDir}.`);
        }
      } else {
        this.log(`Downloaded files kept at ${server.cacheDir}.`);
        this.log('(Run with --purge to delete them too.)');
      }
    }

    this.log('');
    this.log('Restart Claude to drop this template.');
  }
}
