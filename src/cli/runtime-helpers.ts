/**
 * Tiny shared helpers for the oclif command classes.
 *
 * Kept off the Command base class so the command files only depend on the
 * specific helpers they need, and so the helpers stay easy to unit-test in
 * isolation.
 */

import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SlidesRuntime } from '../core/index.js';
import { PptxSlidesRuntime } from '../core/index.js';

/** Build a fresh `PptxSlidesRuntime` writing into `outputDir ?? process.cwd()`. */
export const newRuntime = (outputDir: string | undefined): SlidesRuntime =>
  new PptxSlidesRuntime({ outputDir: outputDir ?? process.cwd() });

/** Read all of stdin synchronously into a UTF-8 string. */
export const readStdin = (): Promise<string> => {
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    process.stdin.on('data', (chunk: Buffer | string) => {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk);
    });
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    process.stdin.on('error', (err: Error) => reject(err));
  });
};

/**
 * Resolve the absolute path of the bundled `SKILL.md`.
 *
 * From either `src/cli/runtime-helpers.ts` (dev) or
 * `dist/cli/runtime-helpers.js` (published), two levels up is the package
 * root where `SKILL.md` lives.
 */
export const resolveSkillPath = (): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolvePath(here, '..', '..', 'SKILL.md');
};
