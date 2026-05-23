/**
 * Grid unit tests — `cellRect` correctness across cols/rows.
 *
 * Reference values match the `TITLE_AND_TWO_COLUMNS` PPTX layout's extracted
 * grid: bounds = `{ x: 57.6, y: 149.45, w: 844.8, h: 267.54 }`, gap ≈ 8pt,
 * 3 cols × 2 rows produces cells starting at:
 *   row 0: (57.6, 149.45), (341.98, 149.45), (626.37, 149.45)
 *   row 1: (57.6, 283.22), (341.98, 283.22), (626.37, 283.22)
 *
 * The test asserts the deterministic-positioning contract: same inputs →
 * same outputs across all combinations of (cols, rows, i).
 */

import { describe, expect, test } from 'vitest';
import { cellRect } from './grid.js';
import type { Rect } from './tokens-extra.js';

const REFERENCE_BOUNDS: Rect = { x: 57.6, y: 149.45, w: 844.8, h: 267.54 };

describe('cellRect — single column', () => {
  test('1×1 fills the whole bounds', () => {
    expect(cellRect(REFERENCE_BOUNDS, 1, 1, 0, 0)).toEqual(REFERENCE_BOUNDS);
  });

  test('1×3 stacks three full-width cells', () => {
    const c0 = cellRect(REFERENCE_BOUNDS, 1, 3, 0, 0);
    const c1 = cellRect(REFERENCE_BOUNDS, 1, 3, 0, 1);
    const c2 = cellRect(REFERENCE_BOUNDS, 1, 3, 0, 2);
    expect(c0.x).toBe(57.6);
    expect(c0.w).toBe(844.8);
    expect(c0.h).toBeCloseTo(267.54 / 3);
    expect(c1.y).toBeCloseTo(149.45 + 267.54 / 3);
    expect(c2.y).toBeCloseTo(149.45 + 2 * (267.54 / 3));
  });
});

describe('cellRect — two columns', () => {
  test('2×1 splits horizontally with gap', () => {
    const c0 = cellRect(REFERENCE_BOUNDS, 2, 1, 8, 0);
    const c1 = cellRect(REFERENCE_BOUNDS, 2, 1, 8, 1);
    expect(c0.x).toBe(57.6);
    expect(c0.w).toBeCloseTo((844.8 - 8) / 2);
    expect(c1.x).toBeCloseTo(57.6 + (844.8 - 8) / 2 + 8);
    expect(c1.w).toBeCloseTo((844.8 - 8) / 2);
  });
});

describe('cellRect — three columns × two rows (reference template)', () => {
  // Build the cell array once; tests below destructure into typed locals so
  // we don't need non-null assertions on indexed reads.
  const cells: ReadonlyArray<Rect> = Array.from({ length: 6 }, (_, i) =>
    cellRect(REFERENCE_BOUNDS, 3, 2, 8, i),
  );

  test('row-major positions match extracted template', () => {
    const [c0, c1, c2, c3, c4, c5] = cells;
    if (
      c0 === undefined ||
      c1 === undefined ||
      c2 === undefined ||
      c3 === undefined ||
      c4 === undefined ||
      c5 === undefined
    ) {
      throw new Error('expected 6 cells');
    }
    // Row 0
    expect(c0.x).toBeCloseTo(57.6);
    expect(c0.y).toBeCloseTo(149.45);
    expect(c1.x).toBeCloseTo(57.6 + (844.8 - 16) / 3 + 8);
    expect(c2.x).toBeCloseTo(57.6 + 2 * ((844.8 - 16) / 3 + 8));
    // Row 1
    expect(c3.x).toBeCloseTo(57.6);
    expect(c3.y).toBeCloseTo(149.45 + (267.54 - 8) / 2 + 8);
    expect(c4.x).toBeCloseTo(57.6 + (844.8 - 16) / 3 + 8);
    expect(c5.y).toBeCloseTo(149.45 + (267.54 - 8) / 2 + 8);
  });

  test('every cell has the same width', () => {
    const widths = new Set(cells.map((c) => c.w.toFixed(4)));
    expect(widths.size).toBe(1);
  });

  test('every cell has the same height', () => {
    const heights = new Set(cells.map((c) => c.h.toFixed(4)));
    expect(heights.size).toBe(1);
  });
});

describe('cellRect — four columns', () => {
  test('4×1 produces equal-width cells', () => {
    const cells = Array.from({ length: 4 }, (_, i) => cellRect(REFERENCE_BOUNDS, 4, 1, 8, i));
    const w = (844.8 - 3 * 8) / 4;
    const [c0, , , c3] = cells;
    if (c0 === undefined || c3 === undefined) throw new Error('expected 4 cells');
    expect(c0.w).toBeCloseTo(w);
    expect(c3.x).toBeCloseTo(57.6 + 3 * (w + 8));
  });
});

describe('cellRect — gap=0 edge case', () => {
  test('zero-gap cells are contiguous', () => {
    const c0 = cellRect(REFERENCE_BOUNDS, 3, 2, 0, 0);
    const c1 = cellRect(REFERENCE_BOUNDS, 3, 2, 0, 1);
    expect(c1.x).toBeCloseTo(c0.x + c0.w);
  });
});
