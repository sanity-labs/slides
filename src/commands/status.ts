/**
 * `slidesctl status` — print what's installed.
 *
 * Reads slidesctl's state file and lists every registered server: name,
 * template source, output dir, which MCP clients have it wired up, and
 * when it was last installed. Useful before running `slidesctl use` or
 * `slidesctl remove`.
 */

import { Command } from '@oclif/core';
import { formatSource } from '../init/github.js';
import { knownClients } from '../init/clients.js';
import { readState } from '../init/state.js';

export default class Status extends Command {
  static override description =
    "Show installed slides MCP servers, their templates, and which clients they're wired into.";

  override async run(): Promise<void> {
    const state = readState();
    const servers = Object.values(state.servers);

    this.log('MCP clients:');
    for (const c of knownClients()) {
      const status = c.installed ? 'installed' : 'not detected';
      this.log(`  ${c.displayName.padEnd(16)} ${status}  (${c.configPath})`);
    }
    this.log('');

    if (servers.length === 0) {
      this.log('No slides servers installed.');
      this.log('Run `slidesctl init` to add one.');
      return;
    }

    this.log(`Installed servers (${servers.length}):`);
    for (const s of servers) {
      this.log('');
      this.log(`  ${s.name}`);
      this.log(`    source:     ${formatSource(s.source)}`);
      this.log(`    entrypoint: ${s.entrypoint}`);
      this.log(`    output:     ${s.outputDir}`);
      this.log(`    clients:    ${s.clients.join(', ') || '(none)'}`);
      if (s.cacheDir) this.log(`    cache:      ${s.cacheDir}`);
      this.log(`    installed:  ${s.installedAt}`);
    }
  }
}
