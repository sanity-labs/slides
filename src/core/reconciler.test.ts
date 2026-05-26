import { createElement, Fragment } from 'react';
import { describe, expect, test } from 'vitest';
import { z } from 'zod';
import type { Template } from './template.js';
import { Box, Color, Text, Image, Slide } from './components.js';
import { CANVAS_16_9 } from './geometry.js';
import { renderToOps, ReconcilerError } from './reconciler.js';

// A pinned brand for snapshot stability. Real brands live downstream.
const TestBrand: Template = {
  name: 'test',
  canvas: CANVAS_16_9,
  fonts: {
    display: ['Geist', 'Inter', 'Arial'],
    body: ['Inter', 'Arial'],
    mono: ['IBM Plex Mono', 'Courier New'],
  },
  colors: {
    'fg.base': '#0b0b0b',
    'fg.accent': '#ff5500',
    'bg.surface': '#ffffff',
  },
  typography: {
    'display-xl': { fontFamily: 'display', fontSize: 56, lineHeight: 1.1 },
    'body-md': { fontFamily: 'body', fontSize: 18, lineHeight: 1.5 },
  },
  spacing: { sm: 8, md: 12, lg: 24 },
  components: {
    Cover: {
      component: () => null,
      schema: z.object({}).strict(),
      description: 'Use as the first slide. Sets title and stance for the deck.',
    },
  },
};

const FIXED_NOW = () => '2026-05-04T15:00:00.000Z';

describe('renderToOps — empty deck', () => {
  test('a fragment with no slides emits no ops and an empty slot map', () => {
    const result = renderToOps({
      tree: createElement(Fragment, null),
      template: TestBrand,
      deckId: null,
      now: FIXED_NOW,
    });
    expect(result.ops).toEqual([]);
    expect(result.manifest.slots).toEqual({});
  });
});

describe('renderToOps — single slide with one box', () => {
  test('emits createSlide → createShape → insertText in order', () => {
    const tree = createElement(
      Slide,
      null,
      createElement(
        Box,
        { rect: { x: 54, y: 54, w: 600, h: 100 } },
        createElement(Text, null, 'Hello, world.'),
      ),
    );
    const result = renderToOps({ tree, template: TestBrand, deckId: null, now: FIXED_NOW });
    expect(result.ops).toMatchSnapshot('ops');
    expect(result.manifest).toMatchSnapshot('manifest');
  });
});

describe('renderToOps — multiple text runs in one Box', () => {
  test('concatenates text and emits per-run style spans for non-empty styles', () => {
    const tree = createElement(
      Slide,
      null,
      createElement(
        Box,
        { rect: { x: 54, y: 54, w: 600, h: 100 } },
        createElement(Text, { textStyle: { bold: true } }, 'Bold '),
        createElement(Text, null, 'middle '),
        createElement(Color, { color: '#ff5500' }, 'orange'),
      ),
    );
    const result = renderToOps({ tree, template: TestBrand, deckId: null, now: FIXED_NOW });
    expect(result.ops).toMatchSnapshot('ops');
  });
});

describe('renderToOps — slotId attaches the shape to the manifest', () => {
  test('records SlotId → shapeId for each slot-bearing Box', () => {
    const tree = createElement(
      Slide,
      null,
      createElement(
        Box,
        { rect: { x: 54, y: 54, w: 600, h: 60 }, slotId: 'cover:title' },
        'Q2 review',
      ),
      createElement(
        Box,
        { rect: { x: 54, y: 130, w: 600, h: 40 }, slotId: 'cover:subtitle' },
        'For internal review',
      ),
    );
    const result = renderToOps({ tree, template: TestBrand, deckId: null, now: FIXED_NOW });
    expect(result.manifest.slots).toMatchSnapshot('slot map');
  });

  test('throws on duplicate slotIds', () => {
    const tree = createElement(
      Slide,
      null,
      createElement(Box, { rect: { x: 0, y: 0, w: 10, h: 10 }, slotId: 'cover:title' }, 'A'),
      createElement(Box, { rect: { x: 20, y: 0, w: 10, h: 10 }, slotId: 'cover:title' }, 'B'),
    );
    expect(() => renderToOps({ tree, template: TestBrand, deckId: null, now: FIXED_NOW })).toThrow(
      /Duplicate slotId "cover:title"/,
    );
  });
});

describe('renderToOps — function components compose', () => {
  test('a function component returning <Slide> resolves correctly', () => {
    const Cover = ({ title }: { title: string }) =>
      createElement(
        Slide,
        null,
        createElement(
          Box,
          { rect: { x: 54, y: 54, w: 600, h: 100 }, slotId: 'cover:title' },
          createElement(Text, { textStyle: { bold: true } }, title),
        ),
      );
    const result = renderToOps({
      tree: createElement(Cover, { title: 'Hello' }),
      template: TestBrand,
      deckId: null,
      now: FIXED_NOW,
    });
    expect(result.ops).toMatchSnapshot('ops');
    expect(result.manifest.slots).toEqual({ 'cover:title': 'shape_2' });
  });
});

describe('renderToOps — multi-slide deck', () => {
  test('emits ops for each slide in document order with stable IDs', () => {
    const tree = createElement(
      Fragment,
      null,
      createElement(Slide, null, createElement(Box, { rect: { x: 0, y: 0, w: 100, h: 50 } }, 'A')),
      createElement(Slide, null, createElement(Box, { rect: { x: 0, y: 0, w: 100, h: 50 } }, 'B')),
    );
    const result = renderToOps({ tree, template: TestBrand, deckId: null, now: FIXED_NOW });
    expect(result.ops).toMatchSnapshot('ops');
  });
});

describe('renderToOps — Box-level styles', () => {
  test('Box textStyle and paragraphStyle become full-range update ops', () => {
    const tree = createElement(
      Slide,
      null,
      createElement(
        Box,
        {
          rect: { x: 54, y: 54, w: 600, h: 100 },
          textStyle: { fontFamily: 'Geist', fontSize: 56, foregroundColor: '#0b0b0b' },
          paragraphStyle: { alignment: 'START', lineSpacing: 1.1 },
        },
        'Title',
      ),
    );
    const result = renderToOps({ tree, template: TestBrand, deckId: null, now: FIXED_NOW });
    expect(result.ops).toMatchSnapshot('ops');
  });
});

describe('renderToOps — error paths', () => {
  test('rejects a non-Slide top-level element', () => {
    const tree = createElement(Box, { rect: { x: 0, y: 0, w: 10, h: 10 } }, 'orphan');
    expect(() => renderToOps({ tree, template: TestBrand, deckId: null, now: FIXED_NOW })).toThrow(
      /Top-level children must be <Slide>/,
    );
  });

  test('rejects a non-Box child of a Slide', () => {
    const tree = createElement(Slide, null, createElement(Text, null, 'orphan text'));
    expect(() => renderToOps({ tree, template: TestBrand, deckId: null, now: FIXED_NOW })).toThrow(
      /Expected <Box> or <Image> as a child of <Slide>/,
    );
  });

  test('rejects a <Slide> nested inside a <Box>', () => {
    const tree = createElement(
      Slide,
      null,
      createElement(Box, { rect: { x: 0, y: 0, w: 10, h: 10 } }, createElement(Slide, null)),
    );
    expect(() => renderToOps({ tree, template: TestBrand, deckId: null, now: FIXED_NOW })).toThrow(
      /<Slide(?:\s|>) ?.*cannot appear inside a <Box>/,
    );
  });

  test('error includes a Slide / Box path prefix when available', () => {
    const tree = createElement(
      Slide,
      null,
      createElement(Box, { rect: { x: 0, y: 0, w: 10, h: 10 } }, createElement('span', null)),
    );
    expect(() => renderToOps({ tree, template: TestBrand, deckId: null, now: FIXED_NOW })).toThrow(
      /Slide\[0\] > Box\[0\]/,
    );
  });

  test('ReconcilerError is the thrown class', () => {
    try {
      renderToOps({
        tree: createElement('div', null),
        template: TestBrand,
        deckId: null,
        now: FIXED_NOW,
      });
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(ReconcilerError);
    }
  });
});

describe('renderToOps — manifest fields', () => {
  test('records brand name, deckId, and artifacts as provided', () => {
    const result = renderToOps({
      tree: createElement(Slide, null),
      template: TestBrand,
      deckId: 'existing-deck-123',
      now: FIXED_NOW,
      artifacts: [
        {
          type: 'texture',
          identifier: 'dots-grid-base-medium-dark',
          resolvedUrl: 'https://cdn.example.com/dots-grid.png',
          resolvedAt: '2026-05-04T15:00:00.000Z',
        },
      ],
    });
    expect(result.manifest.templateName).toBe('test');
    expect(result.manifest.deckId).toBe('existing-deck-123');
    expect(result.manifest.generatedAt).toBe('2026-05-04T15:00:00.000Z');
    expect(result.manifest.artifacts).toHaveLength(1);
    expect(result.manifest.artifacts[0]?.identifier).toBe('dots-grid-base-medium-dark');
  });
});

// ---------------------------------------------------------------------------
// template.layout (Next.js-style automatic chrome wrapper)
// ---------------------------------------------------------------------------

describe('renderToOps — template.layout', () => {
  // A test layout that injects a footer Box around children, reading
  // `tone` from layoutProps to vary the footer color.
  const LayoutTemplate: Template = {
    ...TestBrand,
    layout: ({ children, layoutProps }) => {
      const tone = (layoutProps?.['tone'] as string | undefined) ?? 'dark';
      const color = tone === 'brand' ? '#ff5500' : '#0b0b0b';
      return createElement(
        Fragment,
        null,
        children,
        createElement(Box, {
          rect: { x: 800, y: 510, w: 130, h: 20 },
          fill: { kind: 'solid', color: color as `#${string}` },
          'data-test-id': 'layout-footer',
        } as never),
      );
    },
  };

  test('wraps every slide with the layout component automatically', () => {
    const tree = createElement(
      Slide,
      null,
      createElement(Box, { rect: { x: 24, y: 24, w: 800, h: 400 } }, 'content'),
    );
    const result = renderToOps({
      tree,
      template: LayoutTemplate,
      deckId: null,
      now: FIXED_NOW,
    });
    // We should see TWO createShape ops: one for the content Box and one for
    // the layout's footer Box. Without the layout wrapping, we'd see one.
    const shapeCount = result.ops.filter((op) => op.type === 'createShape').length;
    expect(shapeCount).toBe(2);
  });

  test('layoutProps from <Slide> are passed through to the layout', () => {
    const tree = createElement(
      Slide,
      { layoutProps: { tone: 'brand' } },
      createElement(Box, { rect: { x: 24, y: 24, w: 800, h: 400 } }, 'content'),
    );
    const result = renderToOps({
      tree,
      template: LayoutTemplate,
      deckId: null,
      now: FIXED_NOW,
    });
    // The brand-tone footer should have the OrangeRed fill (#ff5500).
    const fillOps = result.ops.filter(
      (op): op is Extract<typeof op, { type: 'updateShapeProperties' }> =>
        op.type === 'updateShapeProperties',
    );
    const fillColors = fillOps.map((op) => op.properties.fillColor).filter(Boolean);
    expect(fillColors).toContain('#ff5500');
  });

  test('noLayout opts out of the layout wrapper', () => {
    const tree = createElement(
      Slide,
      { noLayout: true },
      createElement(Box, { rect: { x: 24, y: 24, w: 800, h: 400 } }, 'content'),
    );
    const result = renderToOps({
      tree,
      template: LayoutTemplate,
      deckId: null,
      now: FIXED_NOW,
    });
    // Only the content Box should be emitted — the layout footer is skipped.
    const shapeCount = result.ops.filter((op) => op.type === 'createShape').length;
    expect(shapeCount).toBe(1);
  });

  test('templates without a layout render slides unchanged', () => {
    const tree = createElement(
      Slide,
      null,
      createElement(Box, { rect: { x: 24, y: 24, w: 800, h: 400 } }, 'content'),
    );
    const result = renderToOps({ tree, template: TestBrand, deckId: null, now: FIXED_NOW });
    const shapeCount = result.ops.filter((op) => op.type === 'createShape').length;
    expect(shapeCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// <Box fill> tests
// ---------------------------------------------------------------------------

describe('renderToOps — Box fill', () => {
  test('an empty Box with a solid fill emits createShape → updateShapeProperties (no text ops)', () => {
    const tree = createElement(
      Slide,
      null,
      createElement(Box, {
        rect: { x: 0, y: 0, w: 960, h: 540 },
        fill: { kind: 'solid', color: '#ff5500' },
      }),
    );
    const result = renderToOps({ tree, template: TestBrand, deckId: null, now: FIXED_NOW });
    expect(result.ops).toMatchSnapshot('ops');
    // Order: createSlide → createShape → updateShapeProperties.
    expect(result.ops.map((op) => op.type)).toEqual([
      'createSlide',
      'createShape',
      'updateShapeProperties',
    ]);
  });

  test('a Box with both fill and text emits fill *before* insertText', () => {
    const tree = createElement(
      Slide,
      null,
      createElement(
        Box,
        {
          rect: { x: 54, y: 54, w: 600, h: 100 },
          fill: { kind: 'solid', color: '#0b0b0b' },
        },
        'Hello',
      ),
    );
    const result = renderToOps({ tree, template: TestBrand, deckId: null, now: FIXED_NOW });
    expect(result.ops).toMatchSnapshot('ops');
    // The fill must land between createShape and insertText. This is what
    // makes empty-fill and filled-text cases share an op-emission order.
    const types = result.ops.map((op) => op.type);
    const createShapeIdx = types.indexOf('createShape');
    const updatePropsIdx = types.indexOf('updateShapeProperties');
    const insertTextIdx = types.indexOf('insertText');
    expect(createShapeIdx).toBeLessThan(updatePropsIdx);
    expect(updatePropsIdx).toBeLessThan(insertTextIdx);
  });

  test('updateShapeProperties carries the resolved fillColor', () => {
    const tree = createElement(
      Slide,
      null,
      createElement(Box, {
        rect: { x: 0, y: 0, w: 100, h: 100 },
        fill: { kind: 'solid', color: '#ff5500' },
      }),
    );
    const result = renderToOps({ tree, template: TestBrand, deckId: null, now: FIXED_NOW });
    const fillOp = result.ops.find((op) => op.type === 'updateShapeProperties');
    expect(fillOp).toBeDefined();
    if (fillOp?.type === 'updateShapeProperties') {
      expect(fillOp.properties.fillColor).toBe('#ff5500');
    }
  });
});

// ---------------------------------------------------------------------------
// <Image> tests
// ---------------------------------------------------------------------------

const HERO_ARTIFACT = {
  type: 'image',
  identifier: 'hero-photo',
  resolvedUrl: 'https://cdn.example.com/hero.png',
  resolvedAt: '2026-05-04T15:00:00.000Z',
} as const;

const TEXTURE_ARTIFACT = {
  type: 'texture',
  identifier: 'dots-grid-base-medium-dark',
  resolvedUrl: 'https://cdn.example.com/dots-grid.png',
  resolvedAt: '2026-05-04T15:00:00.000Z',
} as const;

describe('renderToOps — Image primitive', () => {
  test('emits createSlide → createImage with the resolved URL and rect', () => {
    const tree = createElement(
      Slide,
      null,
      createElement(Image, {
        rect: { x: 0, y: 0, w: 960, h: 540 },
        image: { url: HERO_ARTIFACT.resolvedUrl, artifact: HERO_ARTIFACT },
      }),
    );
    const result = renderToOps({ tree, template: TestBrand, deckId: null, now: FIXED_NOW });
    expect(result.ops).toMatchSnapshot('ops');
    expect(result.ops.map((op) => op.type)).toEqual(['createSlide', 'createImage']);
  });

  test('records the artifact in manifest.artifacts', () => {
    const tree = createElement(
      Slide,
      null,
      createElement(Image, {
        rect: { x: 0, y: 0, w: 960, h: 540 },
        image: { url: HERO_ARTIFACT.resolvedUrl, artifact: HERO_ARTIFACT },
      }),
    );
    const result = renderToOps({ tree, template: TestBrand, deckId: null, now: FIXED_NOW });
    expect(result.manifest.artifacts).toEqual([HERO_ARTIFACT]);
  });

  test('two <Image>s with the same artifact identifier dedup to one manifest entry', () => {
    const tree = createElement(
      Fragment,
      null,
      createElement(
        Slide,
        null,
        createElement(Image, {
          rect: { x: 0, y: 0, w: 100, h: 100 },
          image: { url: HERO_ARTIFACT.resolvedUrl, artifact: HERO_ARTIFACT },
        }),
      ),
      createElement(
        Slide,
        null,
        createElement(Image, {
          rect: { x: 0, y: 0, w: 100, h: 100 },
          image: { url: HERO_ARTIFACT.resolvedUrl, artifact: HERO_ARTIFACT },
        }),
      ),
    );
    const result = renderToOps({ tree, template: TestBrand, deckId: null, now: FIXED_NOW });
    expect(result.manifest.artifacts).toHaveLength(1);
    expect(result.manifest.artifacts[0]?.identifier).toBe('hero-photo');
  });

  test('multiple <Image>s with different identifiers each appear once in artifacts', () => {
    const tree = createElement(
      Slide,
      null,
      createElement(Image, {
        rect: { x: 0, y: 0, w: 100, h: 100 },
        image: { url: HERO_ARTIFACT.resolvedUrl, artifact: HERO_ARTIFACT },
      }),
      createElement(Image, {
        rect: { x: 100, y: 0, w: 100, h: 100 },
        image: { url: TEXTURE_ARTIFACT.resolvedUrl, artifact: TEXTURE_ARTIFACT },
      }),
    );
    const result = renderToOps({ tree, template: TestBrand, deckId: null, now: FIXED_NOW });
    expect(result.manifest.artifacts).toHaveLength(2);
    expect(result.manifest.artifacts.map((a) => a.identifier).sort()).toEqual([
      'dots-grid-base-medium-dark',
      'hero-photo',
    ]);
  });

  test('input.artifacts and discovered artifacts merge by identifier (image-walk wins on conflict)', () => {
    // The caller-supplied artifact has the same identifier as the discovered
    // one but a different resolvedUrl. The reconciler-discovered artifact
    // should overwrite (last-wins per the documented merge rule).
    const stale = {
      ...HERO_ARTIFACT,
      resolvedUrl: 'https://stale.example.com/hero.png',
    };
    const tree = createElement(
      Slide,
      null,
      createElement(Image, {
        rect: { x: 0, y: 0, w: 100, h: 100 },
        image: { url: HERO_ARTIFACT.resolvedUrl, artifact: HERO_ARTIFACT },
      }),
    );
    const result = renderToOps({
      tree,
      template: TestBrand,
      deckId: null,
      now: FIXED_NOW,
      artifacts: [stale],
    });
    expect(result.manifest.artifacts).toHaveLength(1);
    expect(result.manifest.artifacts[0]?.resolvedUrl).toBe(HERO_ARTIFACT.resolvedUrl);
  });

  test('slotId on an <Image> registers the imageId in manifest.slots', () => {
    const tree = createElement(
      Slide,
      null,
      createElement(Image, {
        rect: { x: 0, y: 0, w: 960, h: 540 },
        image: { url: HERO_ARTIFACT.resolvedUrl, artifact: HERO_ARTIFACT },
        slotId: 'cover:hero',
      }),
    );
    const result = renderToOps({ tree, template: TestBrand, deckId: null, now: FIXED_NOW });
    // Slot map points at the image's object id; runtime adapter stamps
    // alt-text from this map via slotRegistryToAltTextRequests.
    expect(result.manifest.slots).toEqual({ 'cover:hero': 'image_2' });
  });

  test('user altText flows through to the createImage op', () => {
    const tree = createElement(
      Slide,
      null,
      createElement(Image, {
        rect: { x: 0, y: 0, w: 100, h: 100 },
        image: { url: HERO_ARTIFACT.resolvedUrl, artifact: HERO_ARTIFACT },
        altText: 'Hero photo of the team',
      }),
    );
    const result = renderToOps({ tree, template: TestBrand, deckId: null, now: FIXED_NOW });
    const createImageOp = result.ops.find((op) => op.type === 'createImage');
    expect(createImageOp).toBeDefined();
    if (createImageOp?.type === 'createImage') {
      expect(createImageOp.altText).toBe('Hero photo of the team');
    }
  });

  test('throws on duplicate slotIds across Box and Image', () => {
    // Slot uniqueness is global across primitive kinds, not per-kind.
    const tree = createElement(
      Slide,
      null,
      createElement(Box, { rect: { x: 0, y: 0, w: 10, h: 10 }, slotId: 'cover:hero' }, 'a'),
      createElement(Image, {
        rect: { x: 20, y: 0, w: 10, h: 10 },
        image: { url: HERO_ARTIFACT.resolvedUrl, artifact: HERO_ARTIFACT },
        slotId: 'cover:hero',
      }),
    );
    expect(() => renderToOps({ tree, template: TestBrand, deckId: null, now: FIXED_NOW })).toThrow(
      /Duplicate slotId "cover:hero"/,
    );
  });

  test('<Image> nested inside a <Box> is now a valid flex child (Yoga era)', () => {
    // Pre-Yoga the reconciler rejected this with "Image cannot appear inside
    // a Box" — every layout had to be flat under <Slide>. Now Boxes nest
    // freely; the inner Image becomes a flex child of the parent Box.
    const tree = createElement(
      Slide,
      null,
      createElement(
        Box,
        { rect: { x: 0, y: 0, w: 100, h: 100 } },
        createElement(Image, {
          rect: { x: 0, y: 0, w: 50, h: 50 },
          image: { url: HERO_ARTIFACT.resolvedUrl, artifact: HERO_ARTIFACT },
        }),
      ),
    );
    const result = renderToOps({ tree, template: TestBrand, deckId: null, now: FIXED_NOW });
    // Outer Box → createShape; inner Image → createImage. The Box itself
    // emits a shape, then recurses into the Image child.
    const ops = result.ops.map((o) => o.type);
    expect(ops).toContain('createShape');
    expect(ops).toContain('createImage');
  });
});

// ---------------------------------------------------------------------------
// Role-aware fontFamily resolution
// ---------------------------------------------------------------------------

describe('renderToOps — role-aware fontFamily resolution', () => {
  test('Box textStyle.fontFamily="display" resolves to brand.fonts.display[0]', () => {
    const tree = createElement(
      Slide,
      null,
      createElement(
        Box,
        {
          rect: { x: 0, y: 0, w: 600, h: 100 },
          textStyle: { fontFamily: 'display', fontSize: 56 },
        },
        'Title',
      ),
    );
    const result = renderToOps({ tree, template: TestBrand, deckId: null, now: FIXED_NOW });
    const styleOp = result.ops.find((op) => op.type === 'updateTextStyle');
    expect(styleOp).toBeDefined();
    if (styleOp?.type === 'updateTextStyle') {
      // brand.fonts.display = ['Geist', 'Inter', 'Arial'] — first entry wins.
      expect(styleOp.style.fontFamily).toBe('Geist');
      // Other style fields preserved.
      expect(styleOp.style.fontSize).toBe(56);
    }
  });

  test('Text textStyle.fontFamily="body" resolves to brand.fonts.body[0]', () => {
    const tree = createElement(
      Slide,
      null,
      createElement(
        Box,
        { rect: { x: 0, y: 0, w: 600, h: 100 } },
        createElement(Text, { textStyle: { fontFamily: 'body' } }, 'Body copy'),
      ),
    );
    const result = renderToOps({ tree, template: TestBrand, deckId: null, now: FIXED_NOW });
    const styleOp = result.ops.find((op) => op.type === 'updateTextStyle');
    expect(styleOp).toBeDefined();
    if (styleOp?.type === 'updateTextStyle') {
      // brand.fonts.body = ['Inter', 'Arial'] — first preference (multi-stack).
      expect(styleOp.style.fontFamily).toBe('Inter');
    }
  });

  test('fontFamily="mono" resolves to brand.fonts.mono[0]', () => {
    const tree = createElement(
      Slide,
      null,
      createElement(
        Box,
        { rect: { x: 0, y: 0, w: 600, h: 100 } },
        createElement(Text, { textStyle: { fontFamily: 'mono' } }, 'console.log()'),
      ),
    );
    const result = renderToOps({ tree, template: TestBrand, deckId: null, now: FIXED_NOW });
    const styleOp = result.ops.find((op) => op.type === 'updateTextStyle');
    if (styleOp?.type === 'updateTextStyle') {
      // brand.fonts.mono = ['IBM Plex Mono', 'Courier New'].
      expect(styleOp.style.fontFamily).toBe('IBM Plex Mono');
    }
  });

  test('literal family names pass through unchanged (back-compat)', () => {
    const tree = createElement(
      Slide,
      null,
      createElement(
        Box,
        {
          rect: { x: 0, y: 0, w: 600, h: 100 },
          textStyle: { fontFamily: 'Geist' },
        },
        'Title',
      ),
    );
    const result = renderToOps({ tree, template: TestBrand, deckId: null, now: FIXED_NOW });
    const styleOp = result.ops.find((op) => op.type === 'updateTextStyle');
    if (styleOp?.type === 'updateTextStyle') {
      // 'Geist' is a literal family name; reconciler should not touch it,
      // even though it happens to coincide with brand.fonts.display[0].
      expect(styleOp.style.fontFamily).toBe('Geist');
    }
  });

  test('mixed runs: per-run roles each resolve independently', () => {
    // A Box with two Text runs, one display, one body — verify each op
    // carries the correctly-resolved family.
    const tree = createElement(
      Slide,
      null,
      createElement(
        Box,
        { rect: { x: 0, y: 0, w: 600, h: 100 } },
        createElement(Text, { textStyle: { fontFamily: 'display' } }, 'Big '),
        createElement(Text, { textStyle: { fontFamily: 'body' } }, 'small'),
      ),
    );
    const result = renderToOps({ tree, template: TestBrand, deckId: null, now: FIXED_NOW });
    const styleOps = result.ops.filter((op) => op.type === 'updateTextStyle');
    expect(styleOps).toHaveLength(2);
    if (styleOps[0]?.type === 'updateTextStyle' && styleOps[1]?.type === 'updateTextStyle') {
      expect(styleOps[0].style.fontFamily).toBe('Geist'); // display[0]
      expect(styleOps[1].style.fontFamily).toBe('Inter'); // body[0]
    }
  });

  test('throws a clear error when the brand defines no font for the requested role', () => {
    const EmptyDisplayBrand: Template = {
      ...TestBrand,
      fonts: {
        display: [], // intentionally empty
        body: ['Inter'],
        mono: ['IBM Plex Mono'],
      },
    };
    const tree = createElement(
      Slide,
      null,
      createElement(
        Box,
        {
          rect: { x: 0, y: 0, w: 600, h: 100 },
          textStyle: { fontFamily: 'display' },
        },
        'Title',
      ),
    );
    expect(() =>
      renderToOps({ tree, template: EmptyDisplayBrand, deckId: null, now: FIXED_NOW }),
    ).toThrow(/defines no display font/);
  });
});
