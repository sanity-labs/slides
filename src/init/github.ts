/**
 * Clone + build a template from a GitHub repo.
 *
 * Templates are TypeScript-React projects with no published npm artifact —
 * users either clone them themselves or we clone on their behalf. This
 * module shells out to `git` and the repo's own package manager (pnpm if
 * `pnpm-lock.yaml` is present, npm otherwise) to produce a built
 * `dist/index.js` the MCP server can load.
 */

import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import type { TemplateSource } from './state.js';

/** A logger surface the caller can hook into (CLI progress, test capture). */
export type Logger = {
  readonly info: (msg: string) => void;
  readonly warn: (msg: string) => void;
};

const silentLogger: Logger = {
  info: () => {},
  warn: () => {},
};

/**
 * Parse a GitHub spec string into `{ owner, repo, ref }`.
 *
 * Accepts:
 *   - `owner/repo`
 *   - `owner/repo#branch`
 *   - `github:owner/repo`
 *   - `github:owner/repo#branch`
 *   - `https://github.com/owner/repo`
 *   - `https://github.com/owner/repo.git`
 *
 * Returns null when the string doesn't match a GitHub shape.
 */
export const parseGithubSpec = (
  spec: string,
): { owner: string; repo: string; ref?: string } | null => {
  const trimmed = spec.trim();
  if (trimmed.length === 0) return null;

  // Strip URL/protocol prefixes
  let body = trimmed;
  body = body.replace(/^https?:\/\/github\.com\//, '');
  body = body.replace(/^github:/, '');
  body = body.replace(/\.git$/, '');

  // owner/repo[#ref]
  const match = /^([^/\s#]+)\/([^/\s#]+)(?:#(.+))?$/.exec(body);
  if (!match) return null;
  const owner = match[1];
  const repo = match[2];
  const ref = match[3];
  if (!owner || !repo) return null;
  return ref ? { owner, repo, ref } : { owner, repo };
};

/** Format a TemplateSource for display in CLI output. */
export const formatSource = (source: TemplateSource): string => {
  if (source.kind === 'github') {
    const base = `github:${source.owner}/${source.repo}`;
    return source.ref ? `${base}#${source.ref}` : base;
  }
  if (source.kind === 'local') return source.path;
  return `(builtin: ${source.id})`;
};

/** Detect whether to use pnpm or npm in a freshly cloned repo. */
const detectPackageManager = (repoDir: string): 'pnpm' | 'npm' => {
  if (existsSync(join(repoDir, 'pnpm-lock.yaml'))) return 'pnpm';
  return 'npm';
};

const runCommand = (
  cmd: string,
  args: readonly string[],
  cwd: string,
  log: Logger,
): { ok: true } | { ok: false; message: string } => {
  log.info(`$ ${cmd} ${args.join(' ')}`);
  const result = spawnSync(cmd, args as string[], {
    cwd,
    stdio: 'pipe',
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    const stderr = result.stderr?.trim() ?? '';
    const stdout = result.stdout?.trim() ?? '';
    const detail = [stderr, stdout].filter(Boolean).join('\n');
    return {
      ok: false,
      message: `\`${cmd} ${args.join(' ')}\` failed (exit ${result.status}): ${detail || '(no output)'}`,
    };
  }
  return { ok: true };
};

export type FetchResult =
  | { readonly ok: true; readonly entrypoint: string }
  | { readonly ok: false; readonly message: string };

/**
 * Clone (or re-clone) a GitHub repo into `cacheDir`, install deps, build,
 * and return the absolute path to `dist/index.js`.
 *
 * Idempotent: if `cacheDir` exists and contains a git repo, fetches the
 * latest commit on the target ref instead of re-cloning from scratch.
 */
export const fetchAndBuildFromGithub = (params: {
  readonly source: { owner: string; repo: string; ref?: string };
  readonly cacheDir: string;
  readonly logger?: Logger;
}): FetchResult => {
  const { source, cacheDir } = params;
  const log = params.logger ?? silentLogger;
  const url = `https://github.com/${source.owner}/${source.repo}.git`;

  // Clone (or re-clone if the cache is stale / partial)
  if (existsSync(cacheDir) && !existsSync(join(cacheDir, '.git'))) {
    rmSync(cacheDir, { recursive: true, force: true });
  }
  if (!existsSync(cacheDir)) {
    const cloneArgs = ['clone', '--depth', '1'];
    if (source.ref) cloneArgs.push('--branch', source.ref);
    cloneArgs.push(url, cacheDir);
    const cloneResult = runCommand('git', cloneArgs, process.cwd(), log);
    if (!cloneResult.ok) return { ok: false, message: cloneResult.message };
  } else {
    // Repo already cloned — fetch + reset to latest on the target ref
    const fetchResult = runCommand('git', ['fetch', '--depth', '1', 'origin'], cacheDir, log);
    if (!fetchResult.ok) return { ok: false, message: fetchResult.message };
    const ref = source.ref ?? 'HEAD';
    const resetResult = runCommand(
      'git',
      ['reset', '--hard', `origin/${ref === 'HEAD' ? 'main' : ref}`],
      cacheDir,
      log,
    );
    if (!resetResult.ok) {
      // Fall back to resetting to FETCH_HEAD (handles default-branch detection edge cases)
      const fallback = runCommand('git', ['reset', '--hard', 'FETCH_HEAD'], cacheDir, log);
      if (!fallback.ok) return { ok: false, message: fallback.message };
    }
  }

  // Install + build
  const pm = detectPackageManager(cacheDir);
  log.info(`Detected package manager: ${pm}`);
  const installResult = runCommand(pm, ['install'], cacheDir, log);
  if (!installResult.ok) return { ok: false, message: installResult.message };
  const buildResult = runCommand(pm, ['run', 'build'], cacheDir, log);
  if (!buildResult.ok) return { ok: false, message: buildResult.message };

  const entrypoint = join(cacheDir, 'dist', 'index.js');
  if (!existsSync(entrypoint)) {
    return {
      ok: false,
      message: `Build succeeded but no \`dist/index.js\` was produced at ${entrypoint}. The repo's build script may not match the expected template layout.`,
    };
  }
  return { ok: true, entrypoint };
};
