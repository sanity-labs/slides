import { describe, expect, test } from 'vitest';
import { z } from 'zod';
import { CANVAS_16_9, type Template } from 'react-pptx';
import { componentToTool, deriveComponentTools } from './schema.js';

const TestBrand: Template = {
  name: 'test',
  canvas: CANVAS_16_9,
  fonts: { display: ['Inter'], body: ['Inter'], mono: ['Mono'] },
  colors: { 'fg.base': '#000000' },
  typography: { 'body-md': { fontFamily: 'body', fontSize: 18, lineHeight: 1.5 } },
  spacing: { md: 12 },
  components: {
    Cover: {
      component: () => null,
      schema: z
        .object({
          title: z.string().min(1).describe('The cover title.'),
          subtitle: z.string().optional().describe('Optional subtitle.'),
        })
        .strict(),
      description: 'Use as the first slide. Sets title and stance.',
    },
    TwoColumn: {
      component: () => null,
      schema: z
        .object({
          left: z.string(),
          right: z.string(),
        })
        .strict(),
      description: 'Use to compare two parallel ideas of equal weight.',
    },
    SectionDivider: {
      component: () => null,
      schema: z.object({ label: z.string() }).strict(),
      description: 'Use to separate major sections of the deck.',
    },
  },
};

describe('deriveComponentTools', () => {
  test('returns one tool per brand component, in object order', () => {
    const tools = deriveComponentTools(TestBrand);
    expect(tools.map((t) => t.name)).toEqual([
      'slides_add_cover',
      'slides_add_two_column',
      'slides_add_section_divider',
    ]);
  });

  test('description is taken from the brand component', () => {
    const tools = deriveComponentTools(TestBrand);
    const cover = tools.find((t) => t.componentName === 'Cover');
    expect(cover?.description).toBe('Use as the first slide. Sets title and stance.');
  });

  test('inputShape carries the raw Zod shape', () => {
    const cover = TestBrand.components.Cover;
    if (!cover) throw new Error('Cover missing from test brand');
    const tool = componentToTool('Cover', cover);
    expect(Object.keys(tool.inputShape).sort()).toEqual(['subtitle', 'title']);
  });
});

describe('componentToTool — JSON Schema derivation', () => {
  test('produces a JSON-Schema-7-shaped object with required fields', () => {
    const cover = TestBrand.components.Cover;
    if (!cover) throw new Error('Cover missing from test brand');
    const tool = componentToTool('Cover', cover);
    const schema = tool.inputJsonSchema;
    expect(schema.type).toBe('object');
    expect(schema.required).toEqual(['title']);
    const properties = schema.properties as Record<string, { type?: string; description?: string }>;
    expect(properties.title?.type).toBe('string');
    expect(properties.title?.description).toBe('The cover title.');
    expect(properties.subtitle?.type).toBe('string');
  });

  test('preserves .strict() as additionalProperties: false', () => {
    const cover = TestBrand.components.Cover;
    if (!cover) throw new Error('Cover missing from test brand');
    const tool = componentToTool('Cover', cover);
    expect(tool.inputJsonSchema.additionalProperties).toBe(false);
  });
});
