import { describe, expect, test } from 'vitest';
import { z } from 'zod';
import type { Template, TemplateComponent } from './template.js';
import { defineTemplateComponent } from './template.js';
import { CANVAS_16_9 } from './geometry.js';

// A minimal valid brand for typing-level smoke tests. Real brands live downstream.
const TestBrand: Template = {
  name: 'test',
  canvas: CANVAS_16_9,
  fonts: {
    display: ['Inter', 'Arial'],
    body: ['Inter', 'Arial'],
    mono: ['Courier New'],
  },
  colors: {
    'fg.base': '#0b0b0b',
    'bg.surface': '#ffffff',
  },
  typography: {
    'body-md': { fontFamily: 'body', fontSize: 18, lineHeight: 1.5 },
  },
  spacing: {
    sm: 8,
    md: 12,
    lg: 24,
  },
  components: {
    Cover: {
      component: () => null,
      schema: z.object({ title: z.string() }).strict(),
      description: 'Use as the first slide. Sets title and stance for the deck.',
    } satisfies TemplateComponent<{ title: string }>,
  },
};

describe('Template interface', () => {
  test('a minimal brand satisfies the type', () => {
    expect(TestBrand.name).toBe('test');
    expect(TestBrand.canvas.w).toBe(960);
    expect(Object.keys(TestBrand.components)).toEqual(['Cover']);
  });

  test('component schemas are strict', () => {
    const cover = TestBrand.components['Cover'];
    expect(cover).toBeDefined();
    if (!cover) return;
    expect(() => cover.schema.parse({ title: 'Hello' })).not.toThrow();
    // .strict() rejects unknown keys
    expect(() => cover.schema.parse({ title: 'Hello', extra: true })).toThrow();
  });

  test('token surfaces are populated and queryable', () => {
    expect(TestBrand.colors['fg.base']).toBe('#0b0b0b');
    expect(TestBrand.typography['body-md']?.fontSize).toBe(18);
    expect(TestBrand.spacing['md']).toBe(12);
  });

  test('typography tokens reference font roles, not concrete font names', () => {
    // The brand's typography references font *roles* (display/body/mono) which
    // are resolved against `fonts` at runtime — see font-resolver. This means
    // a token like body-md doesn't bake "Inter" into typography; it says
    // "whatever the body font resolves to."
    const token = TestBrand.typography['body-md'];
    expect(token).toBeDefined();
    if (!token) return;
    expect(['display', 'body', 'mono']).toContain(token.fontFamily);
  });
});

describe('defineTemplateComponent', () => {
  const CoverSchema = z.object({ title: z.string() }).strict();
  const TwoColumnSchema = z.object({ left: z.string(), right: z.string() }).strict();

  const CoverComponent = (_props: { title: string }) => null;
  const TwoColumnComponent = (_props: { left: string; right: string }) => null;

  test('returns its input unchanged at runtime (identity)', () => {
    const spec: TemplateComponent<{ title: string }> = {
      component: CoverComponent,
      schema: CoverSchema,
      description: 'Use as the first slide. Sets title and stance.',
    };
    const result = defineTemplateComponent(spec);
    expect(result).toBe(spec);
  });

  test('preserves component and schema fields', () => {
    const spec = defineTemplateComponent({
      component: CoverComponent,
      schema: CoverSchema,
      description: 'Use as the first slide.',
    });
    expect(spec.component).toBe(CoverComponent);
    expect(spec.schema).toBe(CoverSchema);
    expect(spec.description).toBe('Use as the first slide.');
  });

  test('schema validation still works on the returned component', () => {
    const spec = defineTemplateComponent({
      component: CoverComponent,
      schema: CoverSchema,
      description: 'Use as the first slide.',
    });
    expect(() => spec.schema.parse({ title: 'Hello' })).not.toThrow();
    expect(() => spec.schema.parse({ title: 'Hello', extra: true })).toThrow();
  });

  test('two helper-returned components compose into Template.components without casts', () => {
    // Compile-time test: if TypeScript accepts this without `as` casts,
    // the variance erasure is working correctly.
    const Cover = defineTemplateComponent({
      component: CoverComponent,
      schema: CoverSchema,
      description: 'Use as the first slide. Sets title and stance.',
    });
    const TwoColumn = defineTemplateComponent({
      component: TwoColumnComponent,
      schema: TwoColumnSchema,
      description: 'Use to compare two parallel ideas of equal weight.',
    });

    // No `as unknown as TemplateComponent` casts needed — this is the fix.
    const brand: Template = {
      name: 'test-brand',
      canvas: CANVAS_16_9,
      fonts: { display: ['Inter'], body: ['Inter'], mono: ['Courier New'] },
      colors: { 'fg.base': '#0b0b0b' },
      typography: {},
      spacing: {},
      components: { Cover, TwoColumn },
    };

    expect(Object.keys(brand.components)).toEqual(['Cover', 'TwoColumn']);
  });
});
