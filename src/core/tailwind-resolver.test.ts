/**
 * Tests for the brand-locked Tailwind-class resolver.
 *
 * Covers: allowlist coverage, brand-token resolution, suggestion-aware errors,
 * inline `style` precedence (handled by the reconciler/layout caller, not
 * here — this file tests resolver shape only), and spacing-scale arithmetic.
 */

import { describe, expect, test } from 'vitest';
import {
  resolveClassName,
  suggestionsFor,
  UnknownClassError,
  type YogaStyle,
} from './tailwind-resolver.js';
import { defineTemplate } from './template.js';
import { CANVAS_16_9 } from './geometry.js';

const TestTemplate = defineTemplate({
  name: 'tw-test',
  canvas: CANVAS_16_9,
  fonts: { display: ['Inter'], body: ['Inter'], mono: ['IBM Plex Mono'] },
  colors: {
    'fg-base': '#0b0b0b',
    'bg-surface': '#ffffff',
    'surface-elevated': '#1a1a1a',
    accent: '#ff5500',
  },
  typography: {},
  spacing: {
    sm: 4,
    md: 12,
    lg: 24,
  },
  components: {},
});

describe('resolveClassName — layout primitives', () => {
  test('flex flex-row gap-4 produces the expected Yoga shape', () => {
    const out = resolveClassName('flex flex-row gap-4', TestTemplate);
    expect(out.yoga).toEqual<YogaStyle>({
      display: 'flex',
      flexDirection: 'row',
      gap: 16,
    });
    expect(out.text).toEqual({});
    expect(out.fill).toBeUndefined();
  });

  test('flex-1 sets flex: 1', () => {
    const out = resolveClassName('flex-1', TestTemplate);
    expect(out.yoga.flex).toBe(1);
  });

  test('padding shortcuts split across edges', () => {
    expect(resolveClassName('p-2', TestTemplate).yoga).toMatchObject({
      paddingTop: 8,
      paddingRight: 8,
      paddingBottom: 8,
      paddingLeft: 8,
    });
    expect(resolveClassName('px-3', TestTemplate).yoga).toMatchObject({
      paddingLeft: 12,
      paddingRight: 12,
    });
    expect(resolveClassName('pt-5', TestTemplate).yoga).toMatchObject({ paddingTop: 20 });
  });

  test('w-full + h-1/2 use percentages', () => {
    const out = resolveClassName('w-full h-1/2', TestTemplate);
    expect(out.yoga.width).toBe('100%');
    expect(out.yoga.height).toBe('50%');
  });

  test('items-center + justify-between map to Yoga-compat strings', () => {
    const out = resolveClassName('items-center justify-between', TestTemplate);
    expect(out.yoga.alignItems).toBe('center');
    expect(out.yoga.justifyContent).toBe('space-between');
  });

  test('aspect-square / aspect-video', () => {
    expect(resolveClassName('aspect-square', TestTemplate).yoga.aspectRatio).toBe(1);
    expect(resolveClassName('aspect-video', TestTemplate).yoga.aspectRatio).toBeCloseTo(16 / 9);
  });
});

describe('resolveClassName — typography', () => {
  test('text-{xs,sm,…,9xl} maps to fontSize in pt', () => {
    expect(resolveClassName('text-xs', TestTemplate).text.fontSize).toBe(8);
    expect(resolveClassName('text-base', TestTemplate).text.fontSize).toBe(12);
    expect(resolveClassName('text-5xl', TestTemplate).text.fontSize).toBe(40);
    expect(resolveClassName('text-9xl', TestTemplate).text.fontSize).toBe(72);
  });

  test('text-display / text-body / text-mono map to font roles', () => {
    expect(resolveClassName('text-display', TestTemplate).text.fontFamily).toBe('display');
    expect(resolveClassName('text-body', TestTemplate).text.fontFamily).toBe('body');
    expect(resolveClassName('text-mono', TestTemplate).text.fontFamily).toBe('mono');
  });

  test('font-bold + italic + underline set text-style booleans', () => {
    const out = resolveClassName('font-bold italic underline', TestTemplate);
    expect(out.text.bold).toBe(true);
    expect(out.text.italic).toBe(true);
    expect(out.text.underline).toBe(true);
  });

  test('text-{left,center,right} stash on the textAlign side channel', () => {
    expect(
      (resolveClassName('text-left', TestTemplate).text as { textAlign?: string }).textAlign,
    ).toBe('left');
    expect(
      (resolveClassName('text-center', TestTemplate).text as { textAlign?: string }).textAlign,
    ).toBe('center');
    expect(
      (resolveClassName('text-right', TestTemplate).text as { textAlign?: string }).textAlign,
    ).toBe('right');
  });
});

describe('resolveClassName — brand tokens', () => {
  test('bg-<token> resolves to a solid fill', () => {
    const out = resolveClassName('bg-fg-base', TestTemplate);
    expect(out.fill).toEqual({ kind: 'solid', color: '#0b0b0b' });
  });

  test('text-<token> sets foregroundColor', () => {
    const out = resolveClassName('text-accent', TestTemplate);
    expect(out.text.foregroundColor).toBe('#ff5500');
  });

  test('border-<token> is rejected — the reconciler does not emit borders yet', () => {
    // Accepting `border-*` as a no-op would mask a real "my borders are
    // missing" bug. Reject it via the standard allowlist error so the agent
    // sees the limitation and picks something that renders.
    expect(() => resolveClassName('border-accent', TestTemplate)).toThrow(UnknownClassError);
  });

  test('unknown token rejects', () => {
    expect(() => resolveClassName('bg-nope', TestTemplate)).toThrow(UnknownClassError);
  });

  test('spacing tokens resolve via template.spacing', () => {
    expect(resolveClassName('p-md', TestTemplate).yoga).toMatchObject({
      paddingTop: 12,
      paddingRight: 12,
      paddingBottom: 12,
      paddingLeft: 12,
    });
    expect(resolveClassName('gap-lg', TestTemplate).yoga.gap).toBe(24);
  });
});

describe('resolveClassName — error path', () => {
  test('unknown class throws UnknownClassError with the offending name', () => {
    try {
      resolveClassName('flex bg-pink-500 p-4', TestTemplate);
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(UnknownClassError);
      expect((err as UnknownClassError).className).toBe('bg-pink-500');
    }
  });

  test('error message lists at least one brand-token suggestion when close', () => {
    try {
      resolveClassName('bg-fg-bas', TestTemplate); // dropped one char
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(UnknownClassError);
      expect((err as UnknownClassError).suggestions).toContain('bg-fg-base');
    }
  });

  test('error message mentions the brand-locked allowlist + template tokens', () => {
    try {
      resolveClassName('bg-pink-500', TestTemplate);
      throw new Error('expected throw');
    } catch (err) {
      const msg = (err as Error).message;
      expect(msg).toMatch(/Brand-locked Tailwind dialect/);
      expect(msg).toMatch(/Template "tw-test"/);
      expect(msg).toMatch(/fg-base/);
    }
  });
});

describe('suggestionsFor', () => {
  test('orders suggestions by edit distance', () => {
    const sugs = suggestionsFor('flex-ro', TestTemplate);
    expect(sugs[0]).toBe('flex-row');
  });

  test('returns at most three matches', () => {
    expect(suggestionsFor('zzzzzz', TestTemplate).length).toBeLessThanOrEqual(3);
  });

  test('filters out matches whose distance exceeds the cap', () => {
    // A clearly-nothing-like input should produce zero suggestions, not the
    // entire candidate set.
    const sugs = suggestionsFor('q', TestTemplate);
    expect(sugs.length).toBeLessThanOrEqual(3);
  });
});

describe('resolveClassName — combined', () => {
  test('a realistic className for a metric card', () => {
    const out = resolveClassName(
      'flex flex-col gap-2 p-6 bg-surface-elevated text-display text-4xl',
      TestTemplate,
    );
    expect(out.yoga).toMatchObject({
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      paddingTop: 24,
      paddingRight: 24,
      paddingBottom: 24,
      paddingLeft: 24,
    });
    expect(out.fill).toEqual({ kind: 'solid', color: '#1a1a1a' });
    expect(out.text).toMatchObject({ fontFamily: 'display', fontSize: 32 });
  });

  test('empty className returns the empty style', () => {
    const out = resolveClassName('', TestTemplate);
    expect(out.yoga).toEqual({});
    expect(out.text).toEqual({});
    expect(out.fill).toBeUndefined();
  });
});
