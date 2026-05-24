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

import { pathToFileURL } from 'node:url';
import type { Template } from '../core/index.js';
import { linkDeckDeps } from './link-deps.js';

let registered = false;

/** Register tsx's ESM loader exactly once per process. */
const ensureTsxRegistered = async (): Promise<void> => {
  if (registered) return;
  const { register } = await import('tsx/esm/api');
  register();
  registered = true;
};

/**
 * Load (or reload) the `Template` defined by a deck project's
 * `src/index.ts`. Throws if the file is missing or doesn't default-export
 * a Template.
 */
export const loadDeckTemplate = async (deckPath: string): Promise<Template> => {
  linkDeckDeps(deckPath);
  await ensureTsxRegistered();
  const indexUrl = new URL('src/index.ts', toDirURL(deckPath));
  // Cache-bust so subsequent loads (after add/edit_component) re-evaluate.
  indexUrl.searchParams.set('t', Date.now().toString(36));
  const mod = (await import(indexUrl.href)) as { default?: unknown };
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
