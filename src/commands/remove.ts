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
    "Uninstall a slides MCP server entry. Removes it from every MCP client config and from slidesctl's state.";

  static override examples = [
    '<%= config.bin %> <%= command.id %> sanity-slides',
    '<%= config.bin %> <%= command.id %> sanity-slides --purge',
  ];

  static override args = {
    name: Args.string({ description: 'Server name to remove.', required: true }),
  };

  static override flags = {
    purge: Flags.boolean({
      description: 'Also delete the cached template directory on disk.',
      default: false,
    }),
  };

  override async run(): Promise<void> {
    const { args, flags } = await this.parse(Remove);
    const server = uninstallServer({ name: args.name });
    if (!server) {
      this.error(`No server named "${args.name}" is installed.`, { exit: 2 });
    }

    this.log(`Removed "${args.name}" from ${server.clients.length} MCP client(s).`);

    if (server.cacheDir) {
      if (flags.purge) {
        if (existsSync(server.cacheDir)) {
          rmSync(server.cacheDir, { recursive: true, force: true });
          this.log(`Deleted cache: ${server.cacheDir}`);
        }
      } else {
        this.log(`Cached template kept at: ${server.cacheDir}`);
        this.log('(Pass --purge to delete it.)');
      }
    }

    this.log('');
    this.log('Restart your MCP client to drop the server.');
  }
}
