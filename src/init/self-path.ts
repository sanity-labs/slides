/**
 * Locate the absolute path to this package's installed `cli.js` so the
 * generated MCP config can point at it stably.
 *
 * When running `slidesctl init` from `npx`, from a global install, or from
 * a local project install, we want the produced MCP config to keep working
 * across shells and across machine restarts. That means an absolute path
 * to the binary file, not a `slidesctl` PATH lookup (which a GUI app like
 * Claude Desktop doesn't share with the user's shell).
 */

import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Resolve the absolute path to `<package>/dist/cli.js`.
 *
 * This file ends up at `dist/init/self-path.js` after compilation, so
 * `dist/cli.js` is one level up.
 */
export const slidesctlCliPath = (): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  // `here` is either `<pkg>/src/init` (dev) or `<pkg>/dist/init` (built).
  // `cli.js` sits at `<pkg>/dist/cli.js` either way at runtime — when running
  // via tsx/dev the binary is the source `src/cli.ts` but consumers always
  // hit the compiled artifact.
  return resolvePath(here, '..', 'cli.js');
};
