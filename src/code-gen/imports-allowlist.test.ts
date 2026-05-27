import { describe, expect, test } from 'vitest';
import { assertAllowedImports, findDisallowedImports } from './imports-allowlist.js';

describe('imports-allowlist', () => {
  test('allows the brand-locked surface (slides, react, zod, jsx-runtime)', () => {
    const ok = `
      import type { ReactElement } from 'react';
      import { Slide, Box, Text } from '@sanity-labs/slides';
      import { jsx } from 'react/jsx-runtime';
      import { z } from 'zod';
    `;
    expect(findDisallowedImports(ok)).toEqual([]);
    expect(() => assertAllowedImports(ok)).not.toThrow();
  });

  test('allows @sanity-labs/slides/media (friendly Image wrapper sub-path)', () => {
    const ok = `import { Image } from '@sanity-labs/slides/media';`;
    expect(findDisallowedImports(ok)).toEqual([]);
    expect(() => assertAllowedImports(ok)).not.toThrow();
  });

  test('rejects node built-ins', () => {
    const bad = `import { readFileSync } from 'node:fs';`;
    expect(findDisallowedImports(bad)).toEqual(['node:fs']);
    expect(() => assertAllowedImports(bad)).toThrow(/not allowed/);
  });

  test('rejects external packages', () => {
    const bad = `import { lodash } from 'lodash';`;
    expect(findDisallowedImports(bad)).toEqual(['lodash']);
  });

  test('catches dynamic import() and require()', () => {
    expect(findDisallowedImports(`const fs = await import('node:fs');`)).toEqual(['node:fs']);
    expect(findDisallowedImports(`const cp = require('node:child_process');`)).toEqual([
      'node:child_process',
    ]);
  });

  test('catches re-exports', () => {
    expect(findDisallowedImports(`export { exec } from 'node:child_process';`)).toEqual([
      'node:child_process',
    ]);
  });

  test('ignores import-looking strings inside comments', () => {
    const ok = `
      // example: import { foo } from 'node:fs';
      /* import('node:child_process'); */
      import { Slide } from '@sanity-labs/slides';
    `;
    expect(findDisallowedImports(ok)).toEqual([]);
  });

  test('relative imports are disallowed too (no cross-file reach)', () => {
    const bad = `import { helper } from '../other-component.js';`;
    expect(findDisallowedImports(bad)).toEqual(['../other-component.js']);
  });

  test('deduplicates repeats', () => {
    const bad = `
      import { a } from 'lodash';
      import { b } from 'lodash';
    `;
    expect(findDisallowedImports(bad)).toEqual(['lodash']);
  });

  test('extraAllowlist extends the base surface per-template', () => {
    const src = `
      import { Slide } from '@sanity-labs/slides';
      import { BrandSlide, TopLabel } from '@sanity-labs/slides-template';
    `;
    // Without the extra, the template package is rejected.
    expect(findDisallowedImports(src)).toEqual(['@sanity-labs/slides-template']);
    expect(() => assertAllowedImports(src)).toThrow(/@sanity-labs\/slides-template/);

    // With it, the same source passes.
    expect(findDisallowedImports(src, ['@sanity-labs/slides-template'])).toEqual([]);
    expect(() => assertAllowedImports(src, ['@sanity-labs/slides-template'])).not.toThrow();
  });

  test('error message lists base + extras so the agent sees the full surface', () => {
    const src = `import { exec } from 'node:child_process';`;
    try {
      assertAllowedImports(src, ['@acme/brand', '@acme/icons']);
      throw new Error('expected throw');
    } catch (err) {
      const msg = (err as Error).message;
      expect(msg).toMatch(/@sanity-labs\/slides/);
      expect(msg).toMatch(/@acme\/brand/);
      expect(msg).toMatch(/@acme\/icons/);
    }
  });
});
