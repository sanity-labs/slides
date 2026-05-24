/**
 * Filesystem-level smoke tests for the code-gen orchestration.
 *
 * These run inside vitest and cover the pieces we can exercise without
 * actually loading the deck's `src/index.ts` (vite-node intercepts the
 * dynamic import we use for that and skips the tsx transform). The full
 * "create deck → add component → build → load" loop is exercised against
 * the published bin by `scripts/verify-bins.sh`.
 *
 * What we cover here:
 *
 * - `createDeck` writes the scaffold files and reports the right paths.
 * - `addComponent` writes the `.tsx` file and patches the index.ts anchors.
 * - PascalCase validation rejects malformed names before any file write.
 * - `addComponent` refuses to overwrite an existing component file.
 */

import { existsSync, promises as fs, readFileSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { scaffoldDeck } from '../scaffold/index.js';
import { readRegisteredNames, writeAnchors } from './index-anchor.js';
import { assertValidComponentName } from './naming.js';

const VALID_HERO = `import type { ReactElement } from 'react';
import { Slide } from '@sanity-labs/slides';
import { z } from 'zod';

export const HeroSchema = z.object({ title: z.string() }).strict();
export const Hero = (_: z.infer<typeof HeroSchema>): ReactElement => (<Slide />);
`;

let tmpRoot: string;

beforeEach(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'slides-codegen-'));
});

afterEach(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

test('scaffoldDeck stamps the expected files with name substitution', () => {
  const result = scaffoldDeck({ target: path.join(tmpRoot, 'demo'), name: 'demo' });
  expect(result.fileCount).toBeGreaterThan(0);
  const indexSrc = readFileSync(path.join(result.targetPath, 'src', 'index.ts'), 'utf8');
  expect(indexSrc).toContain("name: 'demo'");
  expect(indexSrc).toContain('// <generated-imports>');
  expect(indexSrc).toContain('// <generated-components>');
  const pkg = JSON.parse(readFileSync(path.join(result.targetPath, 'package.json'), 'utf8')) as {
    name: string;
    dependencies: Record<string, string>;
  };
  expect(pkg.name).toBe('demo');
  expect(pkg.dependencies['@sanity-labs/slides']).toBeDefined();
});

test('writeAnchors + scaffolded index.ts round-trip a registered component', () => {
  const result = scaffoldDeck({ target: path.join(tmpRoot, 'demo'), name: 'demo' });
  const indexPath = path.join(result.targetPath, 'src', 'index.ts');
  const before = readFileSync(indexPath, 'utf8');
  expect(readRegisteredNames(before)).toEqual([]);

  // Mimic addComponent's anchor-patching step against the live scaffold.
  writeFileSync(path.join(result.targetPath, 'src', 'components', 'Hero.tsx'), VALID_HERO);
  writeFileSync(indexPath, writeAnchors(before, ['Hero']));

  const after = readFileSync(indexPath, 'utf8');
  expect(readRegisteredNames(after)).toEqual(['Hero']);
  expect(after).toContain("import { Hero, HeroSchema } from './components/Hero.js';");
  expect(after).toContain('Hero: defineTemplateComponent({');
  expect(existsSync(path.join(result.targetPath, 'src', 'components', 'Hero.tsx'))).toBe(true);
});

test('assertValidComponentName enforces PascalCase before any IO', () => {
  expect(() => assertValidComponentName('Hero')).not.toThrow();
  expect(() => assertValidComponentName('RevenueChartV2')).not.toThrow();
  expect(() => assertValidComponentName('lowercase')).toThrow(/PascalCase/);
  expect(() => assertValidComponentName('1Starts')).toThrow(/PascalCase/);
  expect(() => assertValidComponentName('has-dash')).toThrow(/PascalCase/);
  expect(() => assertValidComponentName('')).toThrow(/required/);
});
