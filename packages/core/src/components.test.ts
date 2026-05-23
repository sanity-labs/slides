import { describe, expect, test } from 'vitest';
import { Box, Color, Text, Image, isPrimitive, PRIMITIVES, Slide } from './components.js';

const TEST_ARTIFACT = {
  type: 'image',
  identifier: 'test-image',
  resolvedUrl: 'https://example.com/x.png',
  resolvedAt: '2026-05-04T15:00:00.000Z',
} as const;

describe('primitives', () => {
  test('each primitive has a stable __rgsKind tag', () => {
    expect(Slide.__rgsKind).toBe('Slide');
    expect(Box.__rgsKind).toBe('Box');
    expect(Text.__rgsKind).toBe('Text');
    expect(Color.__rgsKind).toBe('Color');
    expect(Image.__rgsKind).toBe('Image');
  });

  test('primitives render to null (inert under react-dom)', () => {
    // Calling them as plain functions; the reconciler never does this directly,
    // but accidental react-dom rendering must not blow up.
    expect(Slide({})).toBeNull();
    expect(Box({ rect: { x: 0, y: 0, w: 1, h: 1 } })).toBeNull();
    expect(Text({})).toBeNull();
    expect(Color({ color: '#ffffff' })).toBeNull();
    expect(
      Image({
        rect: { x: 0, y: 0, w: 1, h: 1 },
        image: { url: TEST_ARTIFACT.resolvedUrl, artifact: TEST_ARTIFACT },
      }),
    ).toBeNull();
  });

  test('PRIMITIVES contains exactly the five host elements', () => {
    expect(Object.keys(PRIMITIVES).sort()).toEqual(['Box', 'Color', 'Image', 'Slide', 'Text']);
  });
});

describe('isPrimitive', () => {
  test('returns true for each primitive component', () => {
    expect(isPrimitive(Slide)).toBe(true);
    expect(isPrimitive(Box)).toBe(true);
    expect(isPrimitive(Text)).toBe(true);
    expect(isPrimitive(Color)).toBe(true);
    expect(isPrimitive(Image)).toBe(true);
  });

  test('returns false for arbitrary functions and primitives', () => {
    const NotMine = () => null;
    expect(isPrimitive(NotMine)).toBe(false);
    expect(isPrimitive('div')).toBe(false);
    expect(isPrimitive(undefined)).toBe(false);
    expect(isPrimitive(null)).toBe(false);
    expect(isPrimitive(42)).toBe(false);
  });
});
