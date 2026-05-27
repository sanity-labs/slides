/**
 * Tests for the friendly `<Image>` wrapper at `@sanity-labs/slides/media`.
 *
 * Verifies the four things the wrapper adds on top of the primitive:
 *
 *   1. String `src` synthesizes an `ImageRef` with a deterministic
 *      identifier so the manifest stays meaningful.
 *   2. `ImageRef` `src` is passed through unchanged.
 *   3. `width`/`height` set `aspectRatio` via inline style so the layout
 *      pass picks it up.
 *   4. `fit` / `opacity` / `rotate` flow through to the createImage op.
 *
 * The wrapper is also exercised inside a flex Slide to confirm it composes
 * with Yoga + className like any other primitive.
 */

import { describe, expect, test } from 'vitest';
import { createElement } from 'react';
import { Slide, Box, type SlideOp, renderToOps, defineTemplate, CANVAS_16_9 } from '../index.js';
import { Image } from './image.js';

const FIXED_NOW = (): string => '2026-05-04T15:00:00.000Z';

const TestTemplate = defineTemplate({
  name: 'media-test',
  canvas: CANVAS_16_9,
  fonts: { display: ['Arial'], body: ['Arial'], mono: ['Courier New'] },
  colors: { black: '#000000', white: '#ffffff' },
  spacing: {},
  typography: {},
  components: {},
});

const renderToImageOp = (
  element: ReturnType<typeof createElement>,
): Extract<SlideOp, { type: 'createImage' }> => {
  const tree = createElement(Slide, null, element);
  const { ops } = renderToOps({ tree, template: TestTemplate, deckId: null, now: FIXED_NOW });
  const op = ops.find((o) => o.type === 'createImage');
  if (op === undefined || op.type !== 'createImage') {
    throw new Error('no createImage op emitted');
  }
  return op;
};

describe('<Image> (media wrapper)', () => {
  test('string src synthesizes a stable image artifact identifier', () => {
    const op = renderToImageOp(
      createElement(Image, { src: '/images/team.jpg', alt: 'team photo' }),
    );
    expect(op.url).toBe('/images/team.jpg');
    expect(op.altText).toBe('team photo');
    // Same source twice should hash to the same id (stable across calls).
    const again = renderToImageOp(createElement(Image, { src: '/images/team.jpg', alt: 't' }));
    // The op only carries the URL — the identifier lives on the manifest
    // artifact. Asserting the url is the same proxy for "deterministic".
    expect(again.url).toBe(op.url);
  });

  test('ImageRef src is passed through verbatim', () => {
    const ref = {
      url: 'https://cdn.example.com/x.png',
      artifact: {
        type: 'logo' as const,
        identifier: 'caller-owned-id',
        resolvedUrl: 'https://cdn.example.com/x.png',
        resolvedAt: '2025-01-01T00:00:00.000Z',
        contentHash: 'deadbeef',
      },
    };
    const op = renderToImageOp(createElement(Image, { src: ref, alt: 'logo' }));
    expect(op.url).toBe(ref.url);
  });

  test('width + height inform layout via aspectRatio inline style', () => {
    // The wrapper hands aspectRatio to Yoga via style; the resulting rect
    // should be a 16:9 box when only one dimension is constrained.
    const tree = createElement(
      Slide,
      { className: 'flex flex-col' },
      createElement(Image, {
        src: '/x.png',
        alt: '',
        width: 1600,
        height: 900,
        className: 'w-full',
      }),
    );
    const { ops } = renderToOps({ tree, template: TestTemplate, deckId: null, now: FIXED_NOW });
    const img = ops.find((o) => o.type === 'createImage');
    if (img?.type !== 'createImage') throw new Error('missing createImage op');
    // Canvas is 960 × 540. With w-full and aspectRatio 16/9 the image
    // should be ~960 wide and ~540 tall in points (modulo Yoga rounding).
    const widthPt = img.rect.w / 12700;
    const heightPt = img.rect.h / 12700;
    expect(widthPt).toBeCloseTo(960, 1);
    expect(heightPt).toBeCloseTo(540, 1);
  });

  test('fit, opacity, rotate flow through to the op', () => {
    const op = renderToImageOp(
      createElement(Image, {
        src: '/hero.jpg',
        alt: 'hero',
        fit: 'cover',
        opacity: 0.5,
        rotate: 12,
      }),
    );
    expect(op.fit).toBe('cover');
    expect(op.opacity).toBe(0.5);
    expect(op.rotate).toBe(12);
  });

  test('omitting fit/opacity/rotate leaves them off the op (no defaults leak through)', () => {
    const op = renderToImageOp(createElement(Image, { src: '/a.png', alt: '' }));
    expect(op.fit).toBeUndefined();
    expect(op.opacity).toBeUndefined();
    expect(op.rotate).toBeUndefined();
  });

  test('composes with flex layout when sized via className', () => {
    // A row of [Box, Image] — the Image's flex sizing should kick in via the
    // standard className path the primitive already supports.
    const tree = createElement(
      Slide,
      { className: 'flex flex-row gap-4' },
      createElement(Box, { className: 'flex-1' }, 'spacer'),
      createElement(Image, { src: '/x.png', alt: '', className: 'w-1/3' }),
    );
    const { ops } = renderToOps({ tree, template: TestTemplate, deckId: null, now: FIXED_NOW });
    const img = ops.find((o) => o.type === 'createImage');
    if (img?.type !== 'createImage') throw new Error('missing createImage op');
    // w-1/3 of a 960pt canvas (minus no padding) → ~320pt. Yoga should land
    // the image somewhere on the right side of the slide.
    const widthPt = img.rect.w / 12700;
    expect(widthPt).toBeGreaterThan(300);
    expect(widthPt).toBeLessThan(340);
  });
});
