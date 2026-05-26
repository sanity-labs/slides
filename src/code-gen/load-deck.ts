/**
 * Load a deck project's compiled-on-the-fly Template via `tsx`.
 *
 * Decks are TypeScript-React projects with no build step — `src/index.ts`
 * is the source of truth. We register `tsx`'s ESM loader once per process
 * (lazily on the first deck load) and then use plain dynamic `import()`s
 * with cache-busting query strings.
 *
 * Why global `register` instead of scoped `tsImport`: in our agent loop we
 * load many decks (or the same deck many times) in one process. `tsImport`
 * spawns a fresh worker per call, and across a few dozen calls Node's
 * worker pool starts blocking. `register()` is one-shot — set the loader,
 * use the standard `import()`, get a regular module instance.
 *
 * Cache-busting: agents expect `slides_list` after `slides_add_component`
 * to reflect the new component. We append a unique query string so Node's
 * module cache treats each load as a fresh URL.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Template } from '../core/index.js';
import { linkDeckDeps } from './link-deps.js';

let registered = false;

/**
 * Register tsx's ESM loader once per process, pointed at the package's
 * bundled `runtime-tsconfig.json`. The explicit tsconfig forces the
 * automatic JSX runtime regardless of cwd — without it, esbuild's default
 * is classic JSX and any deck component using JSX would fail at runtime
 * with "React is not defined".
 */
const ensureTsxRegistered = async (): Promise<void> => {
  if (registered) return;
  // From either src/code-gen/load-deck.ts (dev) or dist/code-gen/load-deck.js
  // (published), two levels up is the package root.
  const here = dirname(fileURLToPath(import.meta.url));
  const tsconfig = resolvePath(here, '..', '..', 'runtime-tsconfig.json');
  const { register } = await import('tsx/esm/api');
  register({ tsconfig });
  registered = true;
};

/**
 * Load (or reload) the `Template` defined by a deck project's
 * `src/index.ts`. Throws if the file is missing or doesn't default-export
 * a Template.
 */
export const loadDeckTemplate = async (
  deckPath: string,
  extraDeps: readonly string[] = [],
): Promise<Template> => {
  linkDeckDeps(deckPath, extraDeps);
  await ensureTsxRegistered();

  // Cache-bust component imports so Node's ESM loader re-evaluates them.
  // Static `import './components/Foo.js'` in index.ts resolves to a URL
  // that was already cached from a previous load — appending `?t=` only
  // to index.ts doesn't help. We rewrite index.ts in-place to add the
  // cache-bust param to every component import, then restore it after.
  const indexPath = resolvePath(deckPath, 'src', 'index.ts');
  const originalSource = readFileSync(indexPath, 'utf8');
  const bust = Date.now().toString(36);
  const bustedSource = originalSource.replace(
    /(from\s+['"]\.\/components\/[^'"]+?\.)(js|tsx?)(['"])/g,
    `$1$2?t=${bust}$3`,
  );
  if (bustedSource !== originalSource) {
    writeFileSync(indexPath, bustedSource);
  }

  const indexUrl = new URL('src/index.ts', toDirURL(deckPath));
  indexUrl.searchParams.set('t', bust);
  let mod: { default?: unknown };
  try {
    mod = (await import(indexUrl.href)) as { default?: unknown };
  } finally {
    // Restore the original source so the deck project stays clean.
    if (bustedSource !== originalSource) {
      writeFileSync(indexPath, originalSource);
    }
  }
  const template = mod.default;
  if (!isTemplate(template)) {
    throw new Error(
      `Deck at "${deckPath}" does not default-export a Template ` +
        `(expected an object with .name and .components). ` +
        `Make sure src/index.ts ends with \`export default defineTemplate({ ... })\`.`,
    );
  }
  return template;
};

const toDirURL = (p: string): URL => pathToFileURL(p.endsWith('/') ? p : p + '/');

const isTemplate = (value: unknown): value is Template => {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v['name'] === 'string' && typeof v['components'] === 'object';
};
