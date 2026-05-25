/**
 * Resolve a `--template` flag value to a runtime `Template` instance.
 *
 * Accepts:
 *   - A bare package specifier resolved from the current directory
 *     (e.g. `@acme/slide-template`).
 *   - A path to a built JS file (`./dist/index.js`).
 *   - A path to a directory containing `package.json` (we read
 *     `main` / `module` / `exports['.']`).
 *
 * The template is the default export of the resolved module, or any named
 * export that matches the Template shape (`name` + `components`).
 *
 * Extracted from the old hand-rolled `src/cli.ts` so the oclif command
 * classes can share the loader without inheriting flag-parsing boilerplate.
 */

import { readFileSync, statSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Template } from '../core/index.js';

export class TemplateLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TemplateLoadError';
  }
}

/** Resolve and import the template module pointed at by `spec`. */
export const loadTemplate = async (spec: string): Promise<Template> => {
  const cwd = process.cwd();
  let importTarget: string;

  if (isAbsoluteOrRelative(spec)) {
    const abs = resolvePath(cwd, spec);
    let resolved: string;
    try {
      const stat = statSync(abs);
      resolved = stat.isDirectory() ? resolveDirEntry(abs) : abs;
    } catch (err) {
      throw new TemplateLoadError(
        `Cannot read --template path "${spec}" (resolved to "${abs}"): ${describeError(err)}`,
      );
    }
    importTarget = pathToFileURL(resolved).href;
  } else {
    importTarget = resolveBareSpecifier(spec, cwd);
  }

  if (/\.(ts|tsx|mts|cts)(\?|$)/.test(importTarget)) await ensureTsxLoader();
  let mod: unknown;
  try {
    mod = await import(importTarget);
  } catch (err) {
    throw new TemplateLoadError(`Failed to import template "${spec}": ${describeError(err)}`);
  }
  const template = pickTemplate(mod);
  if (!template) {
    throw new TemplateLoadError(
      `Module at "${spec}" does not export a Template (need an object with name + components).`,
    );
  }
  return template;
};

let tsxRegistered = false;

/**
 * Register tsx's ESM loader pointed at the bundled `runtime-tsconfig.json`,
 * so any .ts/.tsx template transpiles with the automatic JSX runtime
 * (jsx=react-jsx, jsxImportSource=react) regardless of where slidesctl was
 * spawned from. Without an explicit tsconfig, tsx walks up from cwd and
 * may find nothing — then esbuild falls back to classic JSX and any
 * brand template using JSX crashes at render time with "React is not defined".
 */
const ensureTsxLoader = async (): Promise<void> => {
  if (tsxRegistered) return;
  const here = dirname(fileURLToPath(import.meta.url));
  // From either src/cli/template-loader.ts (dev) or dist/cli/template-loader.js
  // (published), two levels up is the package root where runtime-tsconfig.json
  // lives.
  const tsconfig = resolvePath(here, '..', '..', 'runtime-tsconfig.json');
  const { register } = await import('tsx/esm/api');
  register({ tsconfig });
  tsxRegistered = true;
};

const isAbsoluteOrRelative = (spec: string): boolean =>
  spec.startsWith('.') || spec.startsWith('/') || /^[A-Z]:\\/i.test(spec);

const resolveDirEntry = (dir: string): string => {
  const pkgPath = resolvePath(dir, 'package.json');
  let pkg: { main?: string; module?: string; exports?: unknown };
  try {
    pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as typeof pkg;
  } catch (err) {
    throw new TemplateLoadError(
      `Template directory "${dir}" has no readable package.json: ${describeError(err)}`,
    );
  }
  const entry = pkg.module ?? pkg.main ?? exportsDefault(pkg.exports);
  if (!entry) {
    throw new TemplateLoadError(
      `Template directory "${dir}" has no main/module/exports entry to import.`,
    );
  }
  return resolvePath(dir, entry);
};

const exportsDefault = (exportsField: unknown): string | undefined => {
  if (typeof exportsField === 'string') return exportsField;
  if (exportsField && typeof exportsField === 'object') {
    const dot = (exportsField as Record<string, unknown>)['.'];
    if (typeof dot === 'string') return dot;
    if (dot && typeof dot === 'object') {
      const sub = dot as Record<string, unknown>;
      const candidate = sub['import'] ?? sub['default'] ?? sub['node'];
      if (typeof candidate === 'string') return candidate;
    }
  }
  return undefined;
};

const resolveBareSpecifier = (spec: string, cwd: string): string => {
  // ESM resolution honours `exports.import` and other conditions that
  // require.resolve() doesn't, which matters for templates that ship
  // conditional exports. Anchor resolution at the user's cwd via a synthetic
  // package.json URL so we look in their node_modules.
  const parentUrl = pathToFileURL(resolvePath(cwd, 'package.json')).href;
  try {
    return import.meta.resolve(spec, parentUrl);
  } catch (err) {
    throw new TemplateLoadError(
      `Cannot resolve template "${spec}" from ${cwd}: ${describeError(err)}. ` +
        `Install it as a dependency or pass a path with --template.`,
    );
  }
};

const pickTemplate = (mod: unknown): Template | undefined => {
  if (!mod || typeof mod !== 'object') return undefined;
  const candidates: unknown[] = [];
  const m = mod as Record<string, unknown>;
  if (m['default']) candidates.push(m['default']);
  for (const [key, value] of Object.entries(m)) {
    if (key === 'default') continue;
    candidates.push(value);
  }
  for (const c of candidates) {
    if (isTemplate(c)) return c;
  }
  return undefined;
};

const isTemplate = (value: unknown): value is Template => {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v['name'] === 'string' && typeof v['components'] === 'object';
};

export const describeError = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);
