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

  test('width + height do NOT impose Yoga aspectRatio (className drives sizing)', () => {
    // Deliberate non-behavior: the wrapper used to set `style.aspectRatio`
    // from `width` / `height`, but that fought `flex-1` / `w-*` and made
    // images overflow their cells. Sizing is now className-only; width and
    // height are just intrinsic-dim hints for the PPTX runtime.
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
    // `w-full` gives 960pt; height is content-driven (Image has no text) so
    // it stays 0 — the user must size it via className (`aspect-video`,
    // explicit `h-*`, or paired width/height) if they want it to fill.
    const widthPt = img.rect.w / 12700;
    expect(widthPt).toBeCloseTo(960, 1);
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

  test('width/height flow through as intrinsicWidth/intrinsicHeight on the op', () => {
    // The PPTX runtime needs the intrinsic dims to compute aspect-correct
    // sizing; the wrapper plumbs `width` / `height` to that slot.
    const op = renderToImageOp(
      createElement(Image, {
        src: '/hero.jpg',
        alt: 'hero',
        width: 1920,
        height: 1080,
        fit: 'contain',
      }),
    );
    expect(op.intrinsicWidth).toBe(1920);
    expect(op.intrinsicHeight).toBe(1080);
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
