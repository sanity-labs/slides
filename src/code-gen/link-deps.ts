/**
 * Idempotent dep-linking for an agent-authored deck project.
 *
 * The deck's `package.json` declares `@sanity-labs/slides`, `zod`, `react`,
 * and `@types/react` as deps — but `slides_create_deck` skips `npm install`
 * for the agent loop. Doing a real install on every deck creation would
 * cost ~30s and ~100MB and most of the time the agent doesn't care: it
 * only needs the deps resolvable at runtime (`tsImport`) and at typecheck
 * (`tsc`) time.
 *
 * So we link them. Each dep gets a `node_modules/<pkg>` symlink pointing
 * at the same on-disk package that the MCP server itself loaded. This
 * keeps the deck's runtime/typecheck behaviour in lockstep with the
 * server's installed versions, and it's effectively free.
 *
 * Decks remain portable: a user who wants to detach from the server can
 * run `pnpm install --force` (or `npm install`) in the deck dir; npm
 * happily replaces symlinks with real installs.
 */

import { existsSync, mkdirSync, readlinkSync, symlinkSync, unlinkSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Packages we need available in every scaffolded deck. */
const BASE_DECK_DEPS = ['@sanity-labs/slides', 'zod', 'react', '@types/react'] as const;

/**
 * The on-disk root of the running `@sanity-labs/slides` install. Two levels
 * up from this module's location in both `src/code-gen/` (dev) and
 * `dist/code-gen/` (published) layouts.
 */
const SLIDES_ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Create `<deck>/node_modules/<pkg>` symlinks for each dep, pointing at
 * the on-disk package the MCP server itself resolved.
 *
 * Idempotent: existing correct symlinks are left alone; stale ones are
 * replaced. Returns the list of packages that were (re)linked.
 *
 * `extraDeps` lets callers link template-specific extras (e.g. a brand's
 * chrome-helpers package surfaced via `additionalImportAllowlist`).
 * Without this, the agent can `import { BrandSlide } from
 * '@sanity-labs/slides-template'` and pass the import allowlist check at
 * the source level — but typecheck and runtime resolution still fail
 * because the package isn't in the deck's node_modules.
 */
export const linkDeckDeps = (deckPath: string, extraDeps: readonly string[] = []): string[] => {
  const nodeModules = join(deckPath, 'node_modules');
  mkdirSync(nodeModules, { recursive: true });
  const linked: string[] = [];
  // Base deps are required — throw if missing. Extras are optional — soft-skip
  // if the template author listed a package that isn't installed.
  for (const pkg of BASE_DECK_DEPS) {
    const target = resolveBaseDep(pkg);
    linkPackage(nodeModules, pkg, target, linked);
  }
  for (const pkg of extraDeps) {
    const target = resolveOptionalDep(pkg);
    if (target === null) continue;
    linkPackage(nodeModules, pkg, target, linked);
  }
  return linked;
};

const linkPackage = (nodeModules: string, pkg: string, target: string, linked: string[]): void => {
  const linkPath = join(nodeModules, pkg);
  if (pkg.startsWith('@')) mkdirSync(dirname(linkPath), { recursive: true });
  if (existsSync(linkPath)) {
    try {
      if (readlinkSync(linkPath) === target) return;
    } catch {
      // Not a symlink (real dir); leave it alone — the user installed for real.
      return;
    }
    unlinkSync(linkPath);
  }
  symlinkSync(target, linkPath, 'dir');
  linked.push(pkg);
};

/**
 * Find the on-disk directory for a package the server can resolve from
 * its own location. Throws with an agent-actionable message on failure.
 */
const REQUIRE = createRequire(import.meta.url);

const resolveBaseDep = (pkg: string): string => {
  if (pkg === '@sanity-labs/slides') return SLIDES_ROOT;
  try {
    return dirname(REQUIRE.resolve(`${pkg}/package.json`));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Cannot locate package "${pkg}" from the MCP server's installation: ${message}. ` +
        `This usually means @sanity-labs/slides was installed without its peer deps. ` +
        `Reinstall the server with all peers present.`,
    );
  }
};

const resolveOptionalDep = (pkg: string): string | null => {
  try {
    return dirname(REQUIRE.resolve(`${pkg}/package.json`));
  } catch {
    return null;
  }
};
