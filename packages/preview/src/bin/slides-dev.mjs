#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const tsxLoader = require.resolve('tsx/esm');
const entry = resolve(here, 'slides-dev.ts');

const child = spawn(
  process.execPath,
  ['--import', `file://${tsxLoader}`, entry, ...process.argv.slice(2)],
  { stdio: 'inherit' },
);

child.on('exit', (code) => process.exit(code ?? 1));
child.on('error', (err) => {
  process.stderr.write(`slides-dev shim failed: ${err.message}\n`);
  process.exit(1);
});
