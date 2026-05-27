/**
 * Persistent state for `slidesctl` — which servers the user has installed
 * via `slidesctl init`, where their templates are cached on disk, and which
 * MCP clients they've been wired into.
 *
 * Stored at `~/.config/slidesctl/state.json` (overridden by `XDG_CONFIG_HOME`).
 * Each `servers[name]` entry mirrors one `mcpServers.<name>` entry in the
 * user's MCP client config, so we can update or remove them coherently.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export type TemplateSource =
  | {
      readonly kind: 'github';
      readonly owner: string;
      readonly repo: string;
      readonly ref?: string;
    }
  | { readonly kind: 'local'; readonly path: string }
  | { readonly kind: 'builtin'; readonly id: 'blank' };

export type InstalledServer = {
  /** Server key in MCP client config (e.g. `sanity-slides`). */
  readonly name: string;
  /** Where the template came from. */
  readonly source: TemplateSource;
  /** Absolute path to the template's built entry (`dist/index.js`). */
  readonly entrypoint: string;
  /** Absolute path to the cache directory (where we cloned/built). Null for local templates. */
  readonly cacheDir: string | null;
  /** Absolute path to the output directory for generated .pptx files. */
  readonly outputDir: string;
  /** Which MCP clients have this server configured. */
  readonly clients: ReadonlyArray<ClientId>;
  /** ISO timestamp of when this entry was created or last touched. */
  readonly installedAt: string;
};

export type ClientId = 'claude-desktop' | 'claude-code';

export type State = {
  readonly version: 1;
  readonly servers: Readonly<Record<string, InstalledServer>>;
};

const EMPTY_STATE: State = { version: 1, servers: {} };

const stateFilePath = (): string => {
  const xdg = process.env['XDG_CONFIG_HOME'];
  const base = xdg && xdg.length > 0 ? xdg : join(homedir(), '.config');
  return join(base, 'slidesctl', 'state.json');
};

export const readState = (): State => {
  const path = stateFilePath();
  if (!existsSync(path)) return EMPTY_STATE;
  try {
    const raw = readFileSync(path, 'utf8');
    const parsed = JSON.parse(raw) as State;
    if (parsed.version !== 1) return EMPTY_STATE;
    return parsed;
  } catch {
    return EMPTY_STATE;
  }
};

export const writeState = (state: State): void => {
  const path = stateFilePath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(state, null, 2) + '\n');
};

export const upsertServer = (server: InstalledServer): void => {
  const state = readState();
  writeState({
    ...state,
    servers: { ...state.servers, [server.name]: server },
  });
};

export const removeServerFromState = (name: string): InstalledServer | undefined => {
  const state = readState();
  const existing = state.servers[name];
  if (!existing) return undefined;
  const next: Record<string, InstalledServer> = {};
  for (const [k, v] of Object.entries(state.servers)) {
    if (k !== name) next[k] = v;
  }
  writeState({ ...state, servers: next });
  return existing;
};

/** Default cache root for cloned templates: `~/.local/share/slidesctl/templates/`. */
export const templateCacheRoot = (): string => {
  const xdg = process.env['XDG_DATA_HOME'];
  const base = xdg && xdg.length > 0 ? xdg : join(homedir(), '.local', 'share');
  return join(base, 'slidesctl', 'templates');
};

/** Cache directory for a specific server name. */
export const templateCacheDir = (serverName: string): string =>
  join(templateCacheRoot(), serverName);
