/**
 * High-level operations on a deck project.
 *
 * Each function is one MCP tool's worth of work:
 *
 * - `createDeck`       → `slides_create_deck`
 * - `addComponent`     → `slides_add_component`
 * - `editComponent`    → `slides_edit_component`
 * - `buildDeck`        → `slides_build`
 *
 * Side-effects are kept here so the MCP server stays a thin wiring layer.
 * Every function ends with a typecheck (except `createDeck`, which has
 * nothing to check yet) so the agent always knows whether the deck is
 * compilable after each operation.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve as resolvePath } from 'node:path';
import type { Template } from '../core/index.js';
import { scaffoldDeck, defaultName, validateName } from '../scaffold/index.js';
import { assertAllowedImports } from './imports-allowlist.js';
import { readRegisteredNames, writeAnchors } from './index-anchor.js';
import { loadDeckTemplate } from './load-deck.js';
import { assertValidComponentName } from './naming.js';
import { typecheckDeck, type TypecheckResult } from './typecheck.js';

/**
 * Prepended to every component file so esbuild (via tsx) uses the automatic
 * JSX runtime regardless of which tsconfig tsx happens to resolve. Without
 * this, tsx falls back to the classic runtime and the component fails at
 * runtime with "React is not defined".
 */
const JSX_PRAGMA = '/** @jsxRuntime automatic @jsxImportSource react */';

const ensurePragma = (source: string): string =>
  source.includes('@jsxImportSource') ? source : `${JSX_PRAGMA}\n${source}`;

export type CreateDeckResult = {
  readonly deckPath: string;
  readonly template: Template;
};

export type ComponentOpResult = {
  readonly deckPath: string;
  readonly typecheck: TypecheckResult;
  /** Loaded only when typecheck passes. */
  readonly template?: Template;
};

/**
 * Scaffold a deck project, link runtime deps, and load its (initially
 * empty) template.
 */
export const createDeck = async (params: {
  readonly dir: string;
  readonly name?: string;
}): Promise<CreateDeckResult> => {
  const deckPath = resolvePath(process.cwd(), params.dir);
  const name = params.name ?? defaultName(params.dir);
  const nameError = validateName(name);
  if (nameError) {
    throw new Error(
      `Invalid deck name "${name}": ${nameError}. ` +
        `Pass a name with [a-z0-9-] characters, starting with a letter or digit.`,
    );
  }
  scaffoldDeck({ target: params.dir, name });
  const template = await loadDeckTemplate(deckPath);
  return { deckPath, template };
};

/**
 * Add a new component to the deck.
 *
 * Writes `src/components/<Name>.tsx`, registers it in `src/index.ts`
 * between the anchors, runs typecheck, and (on success) reloads the
 * deck template.
 *
 * Refuses to overwrite an existing component — use `editComponent` for
 * that — so accidental name collisions are caught early.
 */
export const addComponent = async (params: {
  readonly deckPath: string;
  readonly name: string;
  readonly source: string;
}): Promise<ComponentOpResult> => {
  const { deckPath, name, source } = params;
  assertValidComponentName(name);
  assertAllowedImports(source);
  assertDeckExists(deckPath);

  const componentFile = componentPath(deckPath, name);
  if (existsSync(componentFile)) {
    throw new Error(
      `Component "${name}" already exists at ${componentFile}. ` +
        `Use slides_edit_component to overwrite it.`,
    );
  }

  const indexPath = indexFilePath(deckPath);
  const indexBefore = readFileSync(indexPath, 'utf8');
  const existing = readRegisteredNames(indexBefore);
  if (existing.includes(name)) {
    throw new Error(
      `Component "${name}" is already registered in src/index.ts. ` +
        `Use slides_edit_component to overwrite the source, or pick a different name.`,
    );
  }

  writeFileSync(componentFile, ensurePragma(source));
  writeFileSync(indexPath, writeAnchors(indexBefore, [...existing, name]));

  return finishComponentOp(deckPath);
};

/**
 * Overwrite an existing component's source. Leaves the registry alone
 * (the component is already registered).
 */
export const editComponent = async (params: {
  readonly deckPath: string;
  readonly name: string;
  readonly source: string;
}): Promise<ComponentOpResult> => {
  const { deckPath, name, source } = params;
  assertValidComponentName(name);
  assertAllowedImports(source);
  assertDeckExists(deckPath);

  const componentFile = componentPath(deckPath, name);
  if (!existsSync(componentFile)) {
    throw new Error(
      `Component "${name}" does not exist at ${componentFile}. ` +
        `Use slides_add_component to create it first.`,
    );
  }

  writeFileSync(componentFile, ensurePragma(source));
  return finishComponentOp(deckPath);
};

/** Type-check only — no file writes. */
export const buildDeck = async (deckPath: string): Promise<ComponentOpResult> => {
  assertDeckExists(deckPath);
  return finishComponentOp(deckPath);
};

const finishComponentOp = async (deckPath: string): Promise<ComponentOpResult> => {
  const typecheck = await typecheckDeck(deckPath);
  if (!typecheck.ok) return { deckPath, typecheck };
  const template = await loadDeckTemplate(deckPath);
  return { deckPath, typecheck, template };
};

const assertDeckExists = (deckPath: string): void => {
  if (!existsSync(indexFilePath(deckPath))) {
    throw new Error(
      `No deck found at "${deckPath}" ` + `(expected src/index.ts). Call slides_create_deck first.`,
    );
  }
};

const indexFilePath = (deckPath: string): string => join(deckPath, 'src', 'index.ts');
const componentPath = (deckPath: string, name: string): string =>
  join(deckPath, 'src', 'components', `${name}.tsx`);
