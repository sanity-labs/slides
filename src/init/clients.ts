/**
 * MCP client config adapters.
 *
 * Each supported client (Claude Desktop, Claude Code) stores its MCP server
 * registry in a JSON file at a known location. This module knows where each
 * file lives, how to read/merge/write it without clobbering unrelated
 * entries, and which clients are actually installed on this machine.
 *
 * The shape we read/write is a thin slice — `mcpServers[<name>] = { command, args, ... }`.
 * Everything else in the file is preserved verbatim.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { dirname, join } from 'node:path';
import type { ClientId } from './state.js';

export type ClientInfo = {
  readonly id: ClientId;
  readonly displayName: string;
  /** Absolute path to the client's MCP config file. */
  readonly configPath: string;
  /** True iff the config file currently exists on disk. */
  readonly installed: boolean;
};

type MCPServerEntry = {
  command: string;
  args: string[];
  env?: Record<string, string>;
};

type MCPConfigShape = {
  mcpServers?: Record<string, MCPServerEntry>;
  [key: string]: unknown;
};

const claudeDesktopConfigPath = (): string => {
  if (platform() === 'darwin') {
    return join(
      homedir(),
      'Library',
      'Application Support',
      'Claude',
      'claude_desktop_config.json',
    );
  }
  // Windows: %APPDATA%/Claude/claude_desktop_config.json
  if (platform() === 'win32') {
    const appData = process.env['APPDATA'];
    if (appData) return join(appData, 'Claude', 'claude_desktop_config.json');
  }
  // Linux / fallback: ~/.config/Claude/claude_desktop_config.json
  return join(homedir(), '.config', 'Claude', 'claude_desktop_config.json');
};

const claudeCodeConfigPath = (): string => join(homedir(), '.claude.json');

/** All clients we know how to write to. */
export const knownClients = (): ReadonlyArray<ClientInfo> => {
  const entries: Array<{ id: ClientId; displayName: string; configPath: string }> = [
    {
      id: 'claude-desktop',
      displayName: 'Claude Desktop',
      configPath: claudeDesktopConfigPath(),
    },
    {
      id: 'claude-code',
      displayName: 'Claude Code',
      configPath: claudeCodeConfigPath(),
    },
  ];
  return entries.map((e) => ({ ...e, installed: existsSync(e.configPath) }));
};

const readConfig = (path: string): MCPConfigShape => {
  if (!existsSync(path)) return {};
  try {
    const raw = readFileSync(path, 'utf8');
    const trimmed = raw.trim();
    if (trimmed.length === 0) return {};
    return JSON.parse(trimmed) as MCPConfigShape;
  } catch {
    return {};
  }
};

const writeConfig = (path: string, config: MCPConfigShape): void => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(config, null, 2) + '\n');
};

export const installServerInClient = (params: {
  readonly client: ClientId;
  readonly name: string;
  readonly entry: MCPServerEntry;
}): void => {
  const info = knownClients().find((c) => c.id === params.client);
  if (!info) throw new Error(`Unknown client: ${params.client}`);
  const config = readConfig(info.configPath);
  const servers = config.mcpServers ?? {};
  servers[params.name] = params.entry;
  writeConfig(info.configPath, { ...config, mcpServers: servers });
};

export const removeServerFromClient = (params: {
  readonly client: ClientId;
  readonly name: string;
}): boolean => {
  const info = knownClients().find((c) => c.id === params.client);
  if (!info || !info.installed) return false;
  const config = readConfig(info.configPath);
  const servers = config.mcpServers ?? {};
  if (!(params.name in servers)) return false;
  const next: Record<string, MCPServerEntry> = {};
  for (const [k, v] of Object.entries(servers)) {
    if (k !== params.name) next[k] = v;
  }
  writeConfig(info.configPath, { ...config, mcpServers: next });
  return true;
};

/**
 * Build the MCP server entry that points at the slidesctl binary for a
 * given template entrypoint + output dir.
 *
 * Uses an absolute path to the current Node binary instead of `node`.
 * GUI apps like Claude Desktop don't inherit the user's shell PATH, so a
 * bare `node` command can resolve to whatever — frequently an ancient
 * system Node that pre-dates top-level await and crashes immediately
 * with `SyntaxError: Unexpected reserved word`.
 */
export const buildServerEntry = (params: {
  readonly slidesctlCliPath: string;
  readonly templateEntrypoint: string;
  readonly outputDir: string;
}): MCPServerEntry => ({
  command: process.execPath,
  args: [
    params.slidesctlCliPath,
    'serve',
    '--template',
    params.templateEntrypoint,
    '--output',
    params.outputDir,
  ],
});
