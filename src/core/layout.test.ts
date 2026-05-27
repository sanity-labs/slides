/**
 * End-to-end layout tests: build a JSX tree, render through the reconciler,
 * inspect the emitted `createShape` rects.
 *
 * We assert on rects from the live reconciler rather than calling `layoutSlide`
 * directly — Yoga's internal numbers are an implementation detail, but the
 * EMU rects that come out the other end of the reconciler are the contract.
 */

import { createElement } from 'react';
import { describe, expect, test } from 'vitest';
import Yoga, { MeasureMode } from 'yoga-layout';
import { Box, Slide, Text } from './components.js';
import { CANVAS_16_9, ptToEmu } from './geometry.js';
import { measureText } from './layout.js';
import { renderToOps } from './reconciler.js';
import { defineTemplate } from './template.js';
import type { SlideOp } from './runtime.js';

// Yoga's wrapAssembly module exports `MeasureMode` lazily as part of the
// loaded Wasm binding. The static enum import here gives us the constants
// without needing a `loadYoga()` await.
void Yoga;

const FIXED_NOW = (): string => '2025-01-01T00:00:00.000Z';

const TestTemplate = defineTemplate({
  name: 'layout-test',
  canvas: CANVAS_16_9,
  fonts: { display: ['Inter'], body: ['Inter'], mono: ['Courier'] },
  colors: {
    'fg-base': '#0b0b0b',
    surface: '#ffffff',
    'surface-elevated': '#1a1a1a',
  },
  typography: {},
  spacing: {},
  components: {},
});

/** Pull out (slideId, rect) tuples in order from the op stream. */
const shapesIn = (ops: readonly SlideOp[]): Array<{ x: number; y: number; w: number; h: number }> =>
  ops
    .filter((op): op is Extract<SlideOp, { type: 'createShape' }> => op.type === 'createShape')
    .map((op) => op.rect);

describe('layoutSlide — Slide default flex-col', () => {
  test('two unstyled Boxes stack vertically across the canvas', () => {
    // No className anywhere — Slide defaults to flex-col, full canvas. Each
    // box gets a measure function (text "A" / "B") which sizes them by
    // content; they're stacked in order from y=0.
    const tree = createElement(
      Slide,
      null,
      createElement(Box, null, 'A'),
      createElement(Box, null, 'B'),
    );
    const result = renderToOps({
      tree,
      template: TestTemplate,
      deckId: null,
      now: FIXED_NOW,
    });
    const rects = shapesIn(result.ops);
    expect(rects).toHaveLength(2);
    expect(rects[0]!.x).toBe(0);
    expect(rects[0]!.y).toBe(0);
    expect(rects[1]!.x).toBe(0);
    // Second box stacks immediately below the first — its y position is
    // approximately the first box's bottom edge (Yoga's pixel scale can
    // round either direction, so we tolerate ±1pt).
    expect(Math.abs(rects[1]!.y - rects[0]!.h)).toBeLessThanOrEqual(ptToEmu(2));
    expect(rects[1]!.y).toBeGreaterThan(0);
  });

  test('explicit flex-row places children side-by-side', () => {
    const tree = createElement(
      Slide,
      { className: 'flex flex-row' },
      createElement(Box, { className: 'flex-1' }, 'L'),
      createElement(Box, { className: 'flex-1' }, 'R'),
    );
    const result = renderToOps({
      tree,
      template: TestTemplate,
      deckId: null,
      now: FIXED_NOW,
    });
    const rects = shapesIn(result.ops);
    expect(rects).toHaveLength(2);
    // Left starts at x=0, right starts after left's width — within 1pt of half-canvas each.
    expect(rects[0]!.x).toBe(0);
    expect(rects[1]!.x).toBeCloseTo(ptToEmu(CANVAS_16_9.w / 2), -3);
    expect(rects[0]!.w).toBeCloseTo(ptToEmu(CANVAS_16_9.w / 2), -3);
  });

  test('gap and padding both contribute to child positioning', () => {
    const tree = createElement(
      Slide,
      { className: 'flex flex-col gap-4 p-8' },
      createElement(Box, { className: 'flex-1' }, 'A'),
      createElement(Box, { className: 'flex-1' }, 'B'),
    );
    const result = renderToOps({
      tree,
      template: TestTemplate,
      deckId: null,
      now: FIXED_NOW,
    });
    const rects = shapesIn(result.ops);
    // p-8 = 32pt padding all around → first box starts at 32pt.
    expect(rects[0]!.x).toBe(ptToEmu(32));
    expect(rects[0]!.y).toBe(ptToEmu(32));
    // gap-4 = 16pt; second box top = first box bottom + 16pt.
    expect(rects[1]!.y).toBe(rects[0]!.y + rects[0]!.h + ptToEmu(16));
  });

  test('nested Box children carry absolute slide-canvas coords, not parent-relative', () => {
    // Regression: Yoga reports each node's computed (left, top) **relative to
    // its parent's content edge**. If the reconciler stores those values as
    // absolute coords, every text Box inside a flex card ends up rendered at
    // (small x, small y) on the slide instead of inside its card — visually
    // catastrophic, all metric labels stack on top of each other in the top
    // corner. This test pins the bug shape: build a column with a wrapper
    // Box that has children, and assert the inner child's rect.x is OFFSET
    // by the wrapper's position, not stuck at 0.
    const tree = createElement(
      Slide,
      { className: 'flex flex-col p-12' },
      createElement(Box, { className: 'flex-1' }, 'top'),
      createElement(
        Box,
        { className: 'flex flex-row flex-1 gap-8 p-8' },
        createElement(Box, { className: 'flex-1' }, 'left'),
        createElement(Box, { className: 'flex-1' }, 'right'),
      ),
    );
    const result = renderToOps({
      tree,
      template: TestTemplate,
      deckId: null,
      now: FIXED_NOW,
    });
    const rects = shapesIn(result.ops);
    // Order in the op stream: top, wrapper, left, right.
    const [_topRect, wrapperRect, leftRect, rightRect] = rects;
    // The wrapper is the second child of the slide, after p-12 padding
    // (48pt) and the top child's height. Its inner Boxes (`left`, `right`)
    // must be positioned ABSOLUTELY on the slide — offset by the wrapper's
    // x + its own padding (8pt p-8 = 32pt).
    expect(leftRect!.x).toBeGreaterThanOrEqual(wrapperRect!.x + ptToEmu(32) - ptToEmu(1));
    expect(leftRect!.y).toBeGreaterThanOrEqual(wrapperRect!.y + ptToEmu(32) - ptToEmu(1));
    expect(rightRect!.x).toBeGreaterThan(leftRect!.x + leftRect!.w);
    // And both inner Boxes share a y baseline (same row).
    expect(Math.abs(leftRect!.y - rightRect!.y)).toBeLessThanOrEqual(ptToEmu(1));
  });

  test('nested flex container holds nested children', () => {
    // Canonical Tier-2 shape: outer column with two rows, second row is a
    // 3-card metric strip. We just assert that the right number of shapes
    // come out and they're inside the canvas — rect arithmetic is exercised
    // in the previous tests.
    const tree = createElement(
      Slide,
      { className: 'flex flex-col gap-6 p-12 bg-fg-base' },
      createElement(Box, { className: 'flex-none' }, 'Title'),
      createElement(
        Box,
        { className: 'flex flex-row flex-1 gap-8' },
        createElement(Box, { className: 'flex-1 bg-surface-elevated' }, 'M1'),
        createElement(Box, { className: 'flex-1 bg-surface-elevated' }, 'M2'),
        createElement(Box, { className: 'flex-1 bg-surface-elevated' }, 'M3'),
      ),
    );
    const result = renderToOps({
      tree,
      template: TestTemplate,
      deckId: null,
      now: FIXED_NOW,
    });
    const rects = shapesIn(result.ops);
    // 1 slide-bg + 1 title + 1 row container + 3 cards = 6 shapes.
    expect(rects.length).toBe(6);
    // All shapes fit on canvas.
    const canvasEmuW = ptToEmu(CANVAS_16_9.w);
    const canvasEmuH = ptToEmu(CANVAS_16_9.h);
    for (const r of rects) {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(canvasEmuW + 1);
      expect(r.y + r.h).toBeLessThanOrEqual(canvasEmuH + 1);
    }
  });
});

describe('layoutSlide — escape hatches', () => {
  test('rect prop pins a Box at absolute coords', () => {
    const tree = createElement(
      Slide,
      null,
      createElement(Box, { rect: { x: 100, y: 200, w: 300, h: 50 } }, 'pinned'),
    );
    const result = renderToOps({
      tree,
      template: TestTemplate,
      deckId: null,
      now: FIXED_NOW,
    });
    const rects = shapesIn(result.ops);
    expect(rects[0]).toEqual({
      x: ptToEmu(100),
      y: ptToEmu(200),
      w: ptToEmu(300),
      h: ptToEmu(50),
    });
  });

  test('rect-positioned Box still applies className flex layout to its children', () => {
    // A rect pins outer position+size; the className still drives inner flex
    // direction, gap, padding so a card-style layout works without dropping
    // back to nested wrapping Boxes.
    const tree = createElement(
      Slide,
      null,
      createElement(
        Box,
        { rect: { x: 0, y: 0, w: 400, h: 200 }, className: 'flex flex-row gap-4' },
        createElement(Box, { className: 'flex-1' }, 'A'),
        createElement(Box, { className: 'flex-1' }, 'B'),
      ),
    );
    const result = renderToOps({
      tree,
      template: TestTemplate,
      deckId: null,
      now: FIXED_NOW,
    });
    const rects = shapesIn(result.ops);
    // [outer, A, B] — A and B should be side-by-side (different x, same y).
    expect(rects[2]!.x).toBeGreaterThan(rects[1]!.x);
    expect(rects[2]!.y).toBe(rects[1]!.y);
  });

  test('inline style overrides className on collision', () => {
    // className says flex-col, style says flex-row — style wins.
    const tree = createElement(
      Slide,
      { className: 'flex flex-col', style: { flexDirection: 'row' } },
      createElement(Box, { className: 'flex-1' }, 'A'),
      createElement(Box, { className: 'flex-1' }, 'B'),
    );
    const result = renderToOps({
      tree,
      template: TestTemplate,
      deckId: null,
      now: FIXED_NOW,
    });
    const rects = shapesIn(result.ops);
    // Side-by-side means rect[1].x > rect[0].w (we'd see y > 0 if flex-col won).
    expect(rects[1]!.x).toBeGreaterThan(0);
    expect(rects[1]!.y).toBe(0);
  });
});

describe('layoutSlide — slide background', () => {
  test('Slide className bg-<token> emits a canvas-sized backing shape behind children', () => {
    // Regression: without slide-level fill, `<Slide className="bg-fg">` was
    // silently dropped. Title text on a dark template would then render as
    // white-on-white, invisible. The backing shape must be the FIRST shape
    // emitted so it sits behind every child.
    const tree = createElement(
      Slide,
      { className: 'flex flex-col bg-fg-base' },
      createElement(Box, { className: 'flex-1' }, 'title'),
    );
    const result = renderToOps({
      tree,
      template: TestTemplate,
      deckId: null,
      now: FIXED_NOW,
    });
    const shapes = result.ops.filter(
      (op): op is Extract<SlideOp, { type: 'createShape' }> => op.type === 'createShape',
    );
    // Two shapes: one for the slide background, one for the title.
    expect(shapes.length).toBe(2);
    // Background covers the full canvas, in EMU.
    expect(shapes[0]).toMatchObject({
      rect: { x: 0, y: 0, w: ptToEmu(CANVAS_16_9.w), h: ptToEmu(CANVAS_16_9.h) },
    });
    // Background fill color matches the brand token.
    const props = result.ops.find(
      (op): op is Extract<SlideOp, { type: 'updateShapeProperties' }> =>
        op.type === 'updateShapeProperties',
    );
    expect(props?.properties.fillColor).toBe('#0b0b0b');
  });

  test('Slide without bg-<token> emits no backing shape', () => {
    const tree = createElement(
      Slide,
      { className: 'flex flex-col' },
      createElement(Box, { className: 'flex-1' }, 'hi'),
    );
    const result = renderToOps({
      tree,
      template: TestTemplate,
      deckId: null,
      now: FIXED_NOW,
    });
    const shapes = result.ops.filter((op) => op.type === 'createShape');
    expect(shapes.length).toBe(1); // just the title, no bg
  });
});

describe('layoutSlide — fill resolution', () => {
  test('className bg-<token> emits updateShapeProperties with the right color', () => {
    const tree = createElement(
      Slide,
      null,
      createElement(Box, { className: 'bg-surface-elevated', rect: { x: 0, y: 0, w: 10, h: 10 } }),
    );
    const result = renderToOps({
      tree,
      template: TestTemplate,
      deckId: null,
      now: FIXED_NOW,
    });
    const props = result.ops.find(
      (op): op is Extract<SlideOp, { type: 'updateShapeProperties' }> =>
        op.type === 'updateShapeProperties',
    );
    expect(props?.properties.fillColor).toBe('#1a1a1a');
  });

  test('explicit fill prop wins over className bg-<token>', () => {
    const tree = createElement(
      Slide,
      null,
      createElement(Box, {
        className: 'bg-surface',
        fill: { kind: 'solid', color: '#abcdef' },
        rect: { x: 0, y: 0, w: 10, h: 10 },
      }),
    );
    const result = renderToOps({
      tree,
      template: TestTemplate,
      deckId: null,
      now: FIXED_NOW,
    });
    const props = result.ops.find(
      (op): op is Extract<SlideOp, { type: 'updateShapeProperties' }> =>
        op.type === 'updateShapeProperties',
    );
    expect(props?.properties.fillColor).toBe('#abcdef');
  });
});

describe('measureText — heuristic text sizing', () => {
  // Constants under test: charWidth = fontSize × 0.55, lineHeight = fontSize × 1.3.
  // Pinning these means a future tweak (different font assumption, different
  // language) is a deliberate change, not a silent regression.

  test('Exactly width returns the given width; height grows with line count', () => {
    // "abc" at 14pt is 3 × 7.7pt = 23.1pt wide. Width=100pt fits in one line.
    expect(measureText('abc', 14, 100, MeasureMode.Exactly)).toEqual({
      width: 100,
      height: 14 * 1.3,
    });
    // "abc...abc" at 14pt is 30 × 7.7pt = 231pt. Width=20pt forces ~12 lines.
    const long = 'abc'.repeat(10);
    const exactly20 = measureText(long, 14, 20, MeasureMode.Exactly);
    expect(exactly20.width).toBe(20);
    expect(exactly20.height).toBeGreaterThan(14 * 1.3); // more than one line
  });

  test('AtMost width shrinks to natural content when content is narrower', () => {
    // Short string + ample width → shrink to natural width, one line.
    const out = measureText('hi', 16, 500, MeasureMode.AtMost);
    expect(out.width).toBeLessThan(500);
    expect(out.width).toBeCloseTo(2 * 16 * 0.55, 5);
    expect(out.height).toBe(16 * 1.3);
  });

  test('Undefined width returns natural width and one line', () => {
    const out = measureText('hello', 12, 0, MeasureMode.Undefined);
    expect(out.width).toBeCloseTo(5 * 12 * 0.55, 5);
    expect(out.height).toBe(12 * 1.3);
  });

  test('empty text still returns one line of height under Exactly', () => {
    // Yoga can pass 0-length text if the agent renders a conditional that
    // collapses. We never want a negative or zero height — it would let
    // surrounding flex siblings expand into the empty box.
    const out = measureText('', 14, 100, MeasureMode.Exactly);
    expect(out.width).toBe(100);
    expect(out.height).toBe(14 * 1.3);
  });

  test('width=0 under Exactly does not divide by zero', () => {
    // Regression guard: an earlier draft would divide naturalWidth / width.
    // Width=0 must not produce Infinity or NaN.
    const out = measureText('hi', 14, 0, MeasureMode.Exactly);
    expect(Number.isFinite(out.height)).toBe(true);
    expect(out.height).toBeGreaterThan(0);
  });
});

describe('layoutSlide — className text styling', () => {
  test('Box className text-<token> applies foregroundColor to text', () => {
    const tree = createElement(
      Slide,
      null,
      createElement(
        Box,
        { className: 'text-fg-base text-2xl', rect: { x: 0, y: 0, w: 100, h: 50 } },
        'hello',
      ),
    );
    const result = renderToOps({
      tree,
      template: TestTemplate,
      deckId: null,
      now: FIXED_NOW,
    });
    const style = result.ops.find(
      (op): op is Extract<SlideOp, { type: 'updateTextStyle' }> => op.type === 'updateTextStyle',
    );
    expect(style?.style.foregroundColor).toBe('#0b0b0b');
    expect(style?.style.fontSize).toBe(32);
  });

  test('Text className overrides Box className on collision', () => {
    const tree = createElement(
      Slide,
      null,
      createElement(
        Box,
        { className: 'text-2xl', rect: { x: 0, y: 0, w: 100, h: 50 } },
        createElement(Text, { className: 'text-5xl' }, 'big'),
      ),
    );
    const result = renderToOps({
      tree,
      template: TestTemplate,
      deckId: null,
      now: FIXED_NOW,
    });
    const sizes = result.ops
      .filter(
        (op): op is Extract<SlideOp, { type: 'updateTextStyle' }> => op.type === 'updateTextStyle',
      )
      .map((op) => op.style.fontSize)
      .filter((s): s is number => s !== undefined);
    // Box-level applies first (32pt for text-2xl) then the run-level overrides (56pt for text-5xl).
    expect(sizes).toContain(56);
  });

  test('unknown class in className throws a ReconcilerError with the offending name', () => {
    const tree = createElement(
      Slide,
      null,
      createElement(Box, { className: 'bg-not-a-real-token', rect: { x: 0, y: 0, w: 10, h: 10 } }),
    );
    expect(() =>
      renderToOps({ tree, template: TestTemplate, deckId: null, now: FIXED_NOW }),
    ).toThrow(/bg-not-a-real-token/);
  });
});
