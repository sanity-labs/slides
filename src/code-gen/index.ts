/**
 * Code-gen surface. The MCP server and CLI wire these into tools/subcommands.
 *
 * - `createDeck`        — scaffold a writable deck project.
 * - `addComponent`      — write a new `.tsx` slide + register it.
 * - `editComponent`     — overwrite an existing slide's source.
 * - `patchComponent`    — search/replace patches on an existing slide.
 * - `buildDeck`         — type-check only.
 * - `loadDeckTemplate`  — re-read the deck's compiled template.
 */

export {
  createDeck,
  addComponent,
  editComponent,
  patchComponent,
  buildDeck,
  type CreateDeckResult,
  type ComponentOpResult,
} from './deck.js';
export { loadDeckTemplate } from './load-deck.js';
export { typecheckDeck, type Diagnostic, type TypecheckResult } from './typecheck.js';
export { writeAnchors, readRegisteredNames } from './index-anchor.js';
export { assertValidComponentName } from './naming.js';
export { assertAllowedImports, findDisallowedImports } from './imports-allowlist.js';
export { linkDeckDeps } from './link-deps.js';
