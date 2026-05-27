/**
 * The end-to-end install pipeline: resolve a template source, fetch +
 * build (if remote), wire it into the requested MCP clients, and persist
 * the result in slidesctl's state file.
 *
 * Shared by the `init`, `use`, and `remove` commands so all three paths
 * stay coherent — the state file is always in sync with what's actually
 * on disk and in the client configs.
 */

import { existsSync, mkdirSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import {
  buildServerEntry,
  installServerInClient,
  knownClients,
  removeServerFromClient,
} from './clients.js';
import { fetchAndBuildFromGithub, formatSource, type Logger } from './github.js';
import { slidesctlCliPath } from './self-path.js';
import {
  removeServerFromState,
  templateCacheDir,
  upsertServer,
  type ClientId,
  type InstalledServer,
  type TemplateSource,
} from './state.js';

export type InstallParams = {
  readonly name: string;
  readonly source: TemplateSource;
  readonly outputDir: string;
  readonly clients: ReadonlyArray<ClientId>;
  readonly logger?: Logger;
};

export type InstallResult =
  | { readonly ok: true; readonly server: InstalledServer }
  | { readonly ok: false; readonly message: string };

/**
 * Install (or re-install) a slides MCP server entry.
 *
 * Fetches/builds the template, ensures the output dir exists, writes the
 * MCP server entry into every requested client, and records the result in
 * the state file. Idempotent across re-runs — re-installing the same name
 * fetches the latest commit on the source ref.
 */
export const installServer = (params: InstallParams): InstallResult => {
  const { name, source, outputDir, clients, logger } = params;

  // Resolve where the template's entrypoint will live on disk
  let entrypoint: string;
  let cacheDir: string | null;
  if (source.kind === 'github') {
    cacheDir = templateCacheDir(name);
    const fetchResult = fetchAndBuildFromGithub({
      source,
      cacheDir,
      ...(logger ? { logger } : {}),
    });
    if (!fetchResult.ok) return { ok: false, message: fetchResult.message };
    entrypoint = fetchResult.entrypoint;
  } else if (source.kind === 'local') {
    cacheDir = null;
    const absPath = resolvePath(source.path);
    // Accept either a directory containing dist/index.js OR an explicit path to a file
    const distIndex = absPath.endsWith('.js') ? absPath : resolvePath(absPath, 'dist', 'index.js');
    if (!existsSync(distIndex)) {
      return {
        ok: false,
        message:
          `No \`dist/index.js\` found at ${distIndex}. ` +
          `Build the template first (\`pnpm run build\` or \`npm run build\` from its directory) ` +
          `then re-run \`slidesctl init\`.`,
      };
    }
    entrypoint = distIndex;
  } else {
    return {
      ok: false,
      message: `Builtin templates are not yet wired up. Pass a GitHub repo or local directory instead.`,
    };
  }

  // Ensure output directory exists so the MCP server can write to it
  mkdirSync(outputDir, { recursive: true });

  // Wire up each requested MCP client
  const cliPath = slidesctlCliPath();
  const entry = buildServerEntry({
    slidesctlCliPath: cliPath,
    templateEntrypoint: entrypoint,
    outputDir,
  });
  for (const client of clients) {
    installServerInClient({ client, name, entry });
  }

  const server: InstalledServer = {
    name,
    source,
    entrypoint,
    cacheDir,
    outputDir,
    clients,
    installedAt: new Date().toISOString(),
  };
  upsertServer(server);

  logger?.info(`Installed ${name} (${formatSource(source)})`);
  return { ok: true, server };
};

/**
 * Remove a server entry from state and from every MCP client it was
 * installed into. Returns the removed server record so the caller can
 * report cache-dir paths for the user to clean up if they want.
 */
export const uninstallServer = (params: { readonly name: string }): InstalledServer | undefined => {
  const server = removeServerFromState(params.name);
  if (!server) return undefined;

  // Remove from every client where it was installed AND from any client we
  // know about (defensive — handles state drift if the user added clients
  // by hand)
  const allClients = knownClients();
  const targets = new Set<ClientId>(server.clients);
  for (const c of allClients) targets.add(c.id);
  for (const client of targets) {
    removeServerFromClient({ client, name: params.name });
  }

  return server;
};
