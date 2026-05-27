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
  static override description = 'Show which templates you have set up and which apps can use them.';

  override async run(): Promise<void> {
    const state = readState();
    const servers = Object.values(state.servers);

    this.log('Apps:');
    for (const c of knownClients()) {
      const status = c.installed ? 'found' : 'not installed';
      this.log(`  ${c.displayName.padEnd(16)} ${status}`);
    }
    this.log('');

    if (servers.length === 0) {
      this.log('You haven\u2019t set up any templates yet.');
      this.log('Run `slidesctl init` to add one.');
      return;
    }

    this.log(`Templates set up (${servers.length}):`);
    let anyGithub = false;
    for (const s of servers) {
      if (s.source.kind === 'github') anyGithub = true;
      this.log('');
      this.log(`  ${s.name}`);
      this.log(`    From:         ${formatSource(s.source)}`);
      this.log(`    Decks saved:  ${s.outputDir}`);
      this.log(`    Available in: ${s.clients.map(clientDisplayName).join(', ') || '(none)'}`);
      this.log(`    Last updated: ${relativeTime(s.installedAt)}`);
    }
    if (anyGithub) {
      this.log('');
      this.log('Tip: run `slidesctl update` to pull the latest changes from GitHub.');
    }
  }
}

const clientDisplayName = (id: string): string =>
  id === 'claude-desktop' ? 'Claude Desktop' : id === 'claude-code' ? 'Claude Code' : id;

/** Human-readable "how long ago" — helps the user notice stale installs. */
const relativeTime = (iso: string): string => {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return iso;
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
};
