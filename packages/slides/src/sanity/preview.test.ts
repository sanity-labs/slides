/**
 * Smoke test for the Sanity template's canonical preview deck.
 *
 * The Sanity template defines `preview()` — slides-dev shows it verbatim,
 * and downstream consumers can render it to a real .pptx. This test
 * proves the preview composes into a non-empty FakeDeck.
 *
 * Also covers the zero-config fallback (`deriveAutoPreview`) so a future
 * template that doesn't define `preview` still has a working dev path.
 */

import { describe, expect, test } from 'vitest';
import { composeDeck } from '../dev/compose-deck.js';
import { deriveAutoPreview } from '../dev/auto-examples.js';
import { sanity } from './index.js';

describe('Sanity template preview', () => {
  test('template.preview() composes into a multi-slide deck', async () => {
    const preview = sanity.preview;
    if (!preview) throw new Error('Sanity template should define preview()');
    const result = await composeDeck({ tree: preview(), template: sanity });
    expect(result.deck.slideOrder.length).toBeGreaterThan(1);
  });

  test('deriveAutoPreview renders one slide per component', async () => {
    const tree = deriveAutoPreview(sanity);
    const result = await composeDeck({ tree, template: sanity });
    expect(result.deck.slideOrder.length).toBe(Object.keys(sanity.components).length);
  });
});
