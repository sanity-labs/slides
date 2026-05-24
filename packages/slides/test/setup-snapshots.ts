/**
 * Replace machine-absolute paths to repo files with a stable `<repo>`
 * sentinel inside snapshots, so tests pass on any developer's machine and
 * in CI without needing a mountpoint-aware diff.
 *
 * The Sanity reference template resolves its brand-asset URLs via
 * `new URL('./assets/foo.png', import.meta.url).pathname`, which expands
 * to an absolute path that varies by checkout. The reconciler walks those
 * paths verbatim into the `createImage` op, and the op stream is what
 * `toMatchSnapshot` captures. Without this normalization every clone
 * of the repo would carry its own snapshot.
 */
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { expect } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
// walk up from packages/slides/test/ to repo root
const REPO_ROOT = resolve(HERE, '..', '..', '..');

expect.addSnapshotSerializer({
  test: (val) => typeof val === 'string' && val.includes(REPO_ROOT),
  serialize: (val, config, indentation, depth, refs, printer) => {
    const normalized = (val as string).replaceAll(REPO_ROOT, '<repo>');
    return printer(normalized, config, indentation, depth, refs);
  },
});
