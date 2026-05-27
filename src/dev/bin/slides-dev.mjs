#!/usr/bin/env node

/**
 * `slides-dev` entry-point shim.
 *
 * Two modes depending on what sits next to this file:
 *
 *  - **Published** (`dist/dev/bin/`) — we ship the compiled `slides-dev.js`
 *    alongside this `.mjs`. Spawn that directly; no tsx needed.
 *  - **Dev** (`src/dev/bin/`) — we ship `slides-dev.ts` next to this
 *    `.mjs`. Spawn it via tsx so the TS source loads at runtime.
 *
 * The compiled-`.js`-first branch matters because `tsx` is a devDependency
 * (and rightly so — users running the published bin shouldn't need it).
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const compiled = resolve(here, 'slides-dev.js');
const source = resolve(here, 'slides-dev.ts');

let child;
if (existsSync(compiled)) {
  child = spawn(process.execPath, [compiled, ...process.argv.slice(2)], {
    stdio: 'inherit',
  });
} else if (existsSync(source)) {
  const require = createRequire(import.meta.url);
  const tsxLoader = require.resolve('tsx/esm');
  child = spawn(
    process.execPath,
    ['--import', `file://${tsxLoader}`, source, ...process.argv.slice(2)],
    { stdio: 'inherit' },
  );
} else {
  process.stderr.write(
    `slides-dev shim failed: neither slides-dev.js nor slides-dev.ts found next to ${import.meta.url}\n`,
  );
  process.exit(1);
}

child.on('exit', (code) => process.exit(code ?? 1));
child.on('error', (err) => {
  process.stderr.write(`slides-dev shim failed: ${err.message}\n`);
  process.exit(1);
});
