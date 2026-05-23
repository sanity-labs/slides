/**
 * Drift test: `primitives/tokens-extra.colorTokens` must stay in sync with
 * the generated `tokens.ts` color catalog.
 */

import { describe, expect, test } from 'vitest';
import { colorTokens } from './tokens-extra.js';
import { primitiveColorByName } from '../tokens.js';

describe('colorTokens drift', () => {
  test('every typed color exists in tokens.ts with matching hex', () => {
    for (const [name, hex] of Object.entries(colorTokens)) {
      const upstream = primitiveColorByName[name];
      expect(upstream, `primitive color "${name}" missing from tokens.ts`).toBeDefined();
      if (upstream === undefined) continue; // type narrowing
      expect(upstream.hex.toLowerCase()).toBe(hex.toLowerCase());
    }
  });
});
