#!/usr/bin/env node
/**
 * Copy non-TS assets next to their compiled JS so the published tarball
 * keeps the same module-relative layout that the .ts source uses.
 *
 * What gets copied:
 *   - Dev viewer CSS                  src/dev/styles.css → dist/dev/styles.css
 *   - Scaffold template-base source   src/scaffold/template-base/ → dist/scaffold/template-base/
 *   - Dev bin shim (raw .mjs)         src/dev/bin/slides-dev.mjs → dist/dev/bin/slides-dev.mjs
 */

import { cpSync, existsSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const PKG = resolvePath(HERE, '..');

const copies = [
  ['src/dev/styles.css', 'dist/dev/styles.css'],
  ['src/scaffold/template-base', 'dist/scaffold/template-base'],
  ['src/scaffold/deck-base', 'dist/scaffold/deck-base'],
  ['src/dev/bin/slides-dev.mjs', 'dist/dev/bin/slides-dev.mjs'],
  // Dev viewer client root: Vite is pointed at `dist/dev/dev-server/client/`
  // and needs to serve `index.html` (which references `/entry.tsx`). Vite
  // does its own JIT transform of the .tsx — the compiled `entry.js`
  // emitted by tsc isn't used by Vite, but it's harmless to leave alongside.
  ['src/dev/dev-server/client/index.html', 'dist/dev/dev-server/client/index.html'],
  ['src/dev/dev-server/client/entry.tsx', 'dist/dev/dev-server/client/entry.tsx'],
];

for (const [from, to] of copies) {
  const src = resolvePath(PKG, from);
  const dst = resolvePath(PKG, to);
  if (!existsSync(src)) {
    process.stderr.write(`copy-static-assets: skipped missing source ${from}\n`);
    continue;
  }
  cpSync(src, dst, { recursive: true });
  process.stdout.write(`copied ${from} → ${to}\n`);
}
