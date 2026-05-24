/**
 * Programmatic scaffolder. The `slidesctl scaffold <dir>` subcommand wraps
 * this; the same API is exposed at `@sanity-labs/slides/scaffold` so it can
 * be driven by other tooling.
 *
 * The scaffold stamps every file under `template-base/` into the target
 * directory, applying `__NAME__` / `__IDENT__` substitutions and renaming
 * the `_gitignore` placeholder back to `.gitignore`.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_BASE = resolvePath(HERE, 'template-base');

export type ScaffoldOptions = {
  /** Target directory; created if missing. Must be empty if it exists. */
  readonly target: string;
  /** Template name (used as the package name + Template `name` field). */
  readonly name: string;
};

export type ScaffoldResult = {
  readonly targetPath: string;
  readonly fileCount: number;
};

/**
 * Stamp the template-base into `target`, applying the substitutions.
 *
 * Throws if `target` exists and is non-empty.
 */
export const scaffoldTemplate = (options: ScaffoldOptions): ScaffoldResult => {
  const targetPath = resolvePath(process.cwd(), options.target);
  if (existsSync(targetPath) && readdirSync(targetPath).length > 0) {
    throw new Error(`Target directory "${targetPath}" already exists and is not empty.`);
  }
  copyTemplate(TEMPLATE_BASE, targetPath, {
    __NAME__: options.name,
    __IDENT__: toIdentifier(options.name),
  });
  return { targetPath, fileCount: countFiles(targetPath) };
};

/**
 * Convert a kebab-case template name into a camelCase JS identifier. Used
 * as the `__IDENT__` substitution in stamped files (e.g. the exported
 * `Template` const).
 */
export const toIdentifier = (name: string): string =>
  name.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());

/**
 * Validate a template name. Returns an error message string when invalid,
 * `undefined` when ok. Used by interactive prompts.
 */
export const validateName = (value: string): string | undefined => {
  if (!value) return 'Required';
  if (!/^[a-z0-9][a-z0-9-]*$/.test(value)) {
    return 'Must start with a letter or digit and contain only [a-z0-9-].';
  }
  return undefined;
};

/** Infer a default template name from a target path. */
export const defaultName = (target: string): string => {
  const last = (target ?? './my-template').split('/').filter(Boolean).pop() ?? 'my-template';
  return last.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
};

const copyTemplate = (src: string, dst: string, replacements: Record<string, string>): void => {
  mkdirSync(dst, { recursive: true });
  for (const entry of readdirSync(src)) {
    const srcEntry = join(src, entry);
    const dstEntry = join(dst, denormaliseFilename(entry));
    if (statSync(srcEntry).isDirectory()) {
      copyTemplate(srcEntry, dstEntry, replacements);
      continue;
    }
    writeFileSync(dstEntry, applyReplacements(readFileSync(srcEntry, 'utf8'), replacements));
  }
};

const denormaliseFilename = (name: string): string => (name === '_gitignore' ? '.gitignore' : name);

const applyReplacements = (content: string, replacements: Record<string, string>): string => {
  let out = content;
  for (const [from, to] of Object.entries(replacements)) out = out.split(from).join(to);
  return out;
};

const countFiles = (dir: string): number => {
  let n = 0;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) n += countFiles(full);
    else n += 1;
  }
  return n;
};
