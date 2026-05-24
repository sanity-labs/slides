/**
 * Smoke test for `composeDeck` and the auto-derived preview fallback.
 *
 * Uses the synthetic fixture template — confirms the dev-viewer's
 * `composeDeck` produces a non-empty deck from a template's `preview()`,
 * and that `deriveAutoPreview` synthesizes one slide per component when
 * a template doesn't ship its own preview.
 */

import { describe, expect, test } from 'vitest';
import { composeDeck } from '../dev/compose-deck.js';
import { deriveAutoPreview } from '../dev/auto-examples.js';
import { testTemplate } from './fixtures/test-template/index.js';

describe('preview composition', () => {
  test('template.preview() composes into a multi-slide deck', async () => {
    const preview = testTemplate.preview;
    if (!preview) throw new Error('fixture template should define preview()');
    const result = await composeDeck({ tree: preview(), template: testTemplate });
    expect(result.deck.slideOrder.length).toBeGreaterThan(1);
  });

  test('deriveAutoPreview renders one slide per component', async () => {
    const tree = deriveAutoPreview(testTemplate);
    const result = await composeDeck({ tree, template: testTemplate });
    expect(result.deck.slideOrder.length).toBe(Object.keys(testTemplate.components).length);
  });
});
