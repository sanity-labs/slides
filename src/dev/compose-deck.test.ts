import { describe, expect, test } from 'vitest';
import { createElement, Fragment, type ReactElement } from 'react';
import { Slide, Box, Text } from '../core/components.js';
import { CANVAS_16_9 } from '../core/geometry.js';
import type { Template } from '../core/template.js';
import { composeDeck } from './compose-deck.js';

const STUB_TEMPLATE: Template = {
  name: 'stub',
  canvas: CANVAS_16_9,
  fonts: { display: ['Inter'], body: ['Inter'], mono: ['Courier'] },
  colors: {},
  typography: {},
  spacing: {},
  components: {},
};

const TwoSlideDeck = (): ReactElement =>
  createElement(
    Fragment,
    null,
    createElement(
      Slide,
      { key: 'a' },
      createElement(
        Box,
        { rect: { x: 0, y: 0, w: 200, h: 50 } },
        createElement(Text, null, 'Hello'),
      ),
    ),
    createElement(
      Slide,
      { key: 'b' },
      createElement(
        Box,
        { rect: { x: 0, y: 0, w: 200, h: 50 } },
        createElement(Text, null, 'World'),
      ),
    ),
  );

describe('composeDeck', () => {
  test('compiles a multi-slide JSX tree into a FakeDeck the viewer can render', async () => {
    const result = await composeDeck({
      tree: createElement(TwoSlideDeck),
      template: STUB_TEMPLATE,
    });

    expect(result.deck.slideOrder).toHaveLength(2);

    const shapeTexts = [...result.deck.shapes.values()]
      .map((s) => s.text)
      .filter((t) => t.length > 0);
    expect(shapeTexts).toEqual(['Hello', 'World']);

    expect(result.manifest.deckId).toBe('dev-deck');
    expect(result.manifest.templateName).toBe('stub');
  });

  test('honours the pinned timestamp for deterministic manifests', async () => {
    const result = await composeDeck({
      tree: createElement(Slide),
      template: STUB_TEMPLATE,
      now: () => '2026-01-01T00:00:00.000Z',
    });
    expect(result.manifest.generatedAt).toBe('2026-01-01T00:00:00.000Z');
  });
});
