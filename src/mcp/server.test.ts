import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { z } from 'zod';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import {
  Box,
  Text,
  CANVAS_16_9,
  PptxSlidesRuntime,
  Slide,
  type Template,
  type TemplateComponent,
} from '../core/index.js';
import { createSlideServer, type SlideServer } from './server.js';

// ---------------------------------------------------------------------------
// A small template-agnostic test fixture. Two components, both return real <Slide>s.
// ---------------------------------------------------------------------------

const CoverProps = z
  .object({
    title: z.string().min(1).describe('Cover title.'),
    subtitle: z.string().optional(),
  })
  .strict();
type CoverProps = z.infer<typeof CoverProps>;

const Cover: TemplateComponent<CoverProps> = {
  component: ({ title, subtitle }: CoverProps) =>
    createElement(
      Slide,
      null,
      createElement(
        Box,
        { rect: { x: 54, y: 54, w: 600, h: 80 }, slotId: 'cover:title' },
        createElement(Text, null, title),
      ),
      subtitle === undefined
        ? null
        : createElement(
            Box,
            { rect: { x: 54, y: 140, w: 600, h: 40 }, slotId: 'cover:subtitle' },
            createElement(Text, null, subtitle),
          ),
    ),
  schema: CoverProps as unknown as z.ZodObject<z.ZodRawShape>,
  description: 'Use as the first slide. Sets title and stance.',
};

const TwoColumnProps = z
  .object({
    left: z.string().min(1),
    right: z.string().min(1),
  })
  .strict();
type TwoColumnProps = z.infer<typeof TwoColumnProps>;

const TwoColumn: TemplateComponent<TwoColumnProps> = {
  component: ({ left, right }: TwoColumnProps) =>
    createElement(
      Slide,
      null,
      createElement(
        Box,
        { rect: { x: 54, y: 54, w: 300, h: 300 } },
        createElement(Text, null, left),
      ),
      createElement(
        Box,
        { rect: { x: 386, y: 54, w: 300, h: 300 } },
        createElement(Text, null, right),
      ),
    ),
  schema: TwoColumnProps as unknown as z.ZodObject<z.ZodRawShape>,
  description: 'Use to compare two parallel ideas of equal weight.',
};

const TestTemplate: Template = {
  name: 'test',
  canvas: CANVAS_16_9,
  fonts: { display: ['Inter'], body: ['Inter'], mono: ['Courier New'] },
  colors: {},
  typography: {},
  spacing: {},
  components: {
    Cover: Cover as unknown as TemplateComponent,
    TwoColumn: TwoColumn as unknown as TemplateComponent,
  },
};

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------

interface Harness {
  readonly server: SlideServer;
  readonly client: Client;
  readonly outputDir: string;
  close(): Promise<void>;
}

let activeDir: string | undefined;

beforeEach(async () => {
  activeDir = await fs.mkdtemp(join(tmpdir(), 'react-pptx-mcp-test-'));
});

afterEach(async () => {
  if (activeDir) await fs.rm(activeDir, { recursive: true, force: true });
  activeDir = undefined;
});

const makeHarness = async (): Promise<Harness> => {
  if (!activeDir) throw new Error('activeDir not set; beforeEach failed?');
  const runtime = new PptxSlidesRuntime({ outputDir: activeDir });
  const server = createSlideServer({ template: TestTemplate, runtime });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return {
    server,
    client,
    outputDir: activeDir,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createSlideServer — tool registration', () => {
  test('exposes slides_list, slides_create, plus one per slide type', async () => {
    const h = await makeHarness();
    try {
      const list = await h.client.listTools();
      const names = list.tools.map((t) => t.name).sort();
      expect(names).toEqual([
        'slides_add_cover',
        'slides_add_two_column',
        'slides_create',
        'slides_list',
      ]);
    } finally {
      await h.close();
    }
  });

  test('per-slide-type tool description carries the template component description', async () => {
    const h = await makeHarness();
    try {
      const list = await h.client.listTools();
      const cover = list.tools.find((t) => t.name === 'slides_add_cover');
      expect(cover?.description).toBe('Use as the first slide. Sets title and stance.');
    } finally {
      await h.close();
    }
  });

  test('every tool advertises an outputSchema', async () => {
    const h = await makeHarness();
    try {
      const list = await h.client.listTools();
      for (const tool of list.tools) {
        expect(tool.outputSchema, `tool ${tool.name} should expose an outputSchema`).toBeDefined();
      }
    } finally {
      await h.close();
    }
  });
});

describe('slides_list', () => {
  test('returns the template name and every slide type with description', async () => {
    const h = await makeHarness();
    try {
      const result = await h.client.callTool({ name: 'slides_list', arguments: {} });
      expect(result.isError).toBeFalsy();
      const sc = result.structuredContent as {
        template: string;
        slides: Array<{ name: string; toolName: string; description: string }>;
      };
      expect(sc.template).toBe('test');
      expect(sc.slides.map((s) => s.name).sort()).toEqual(['Cover', 'TwoColumn']);
      const cover = sc.slides.find((s) => s.name === 'Cover');
      expect(cover?.toolName).toBe('slides_add_cover');
      expect(cover?.description).toMatch(/first slide/);
    } finally {
      await h.close();
    }
  });
});

describe('slides_add_<component> — schema-introspection tools', () => {
  test('valid props echo back as a slide spec', async () => {
    const h = await makeHarness();
    try {
      const result = await h.client.callTool({
        name: 'slides_add_cover',
        arguments: { title: 'Q2 Review' },
      });
      expect(result.isError).toBeFalsy();
      expect(result.structuredContent).toEqual({
        slide: { component: 'Cover', props: { title: 'Q2 Review' } },
      });
    } finally {
      await h.close();
    }
  });
});

describe('slides_create', () => {
  test('happy path: writes a .pptx file and returns the absolute path', async () => {
    const h = await makeHarness();
    try {
      const result = await h.client.callTool({
        name: 'slides_create',
        arguments: {
          title: 'Pitch Deck',
          slides: [
            { component: 'Cover', props: { title: 'Hello', subtitle: 'world' } },
            { component: 'TwoColumn', props: { left: 'A', right: 'B' } },
          ],
        },
      });
      expect(result.isError).toBeFalsy();
      const sc = result.structuredContent as { filePath: string; slideCount: number };
      expect(sc.slideCount).toBe(2);
      expect(sc.filePath).toMatch(/Pitch-Deck\.pptx$/);
      const buf = await fs.readFile(sc.filePath);
      // PPTX is a ZIP container. Check magic number.
      expect(buf[0]).toBe(0x50);
      expect(buf[1]).toBe(0x4b);
    } finally {
      await h.close();
    }
  });

  test('error path: invalid props surface field paths and a re-call hint', async () => {
    const h = await makeHarness();
    try {
      const result = await h.client.callTool({
        name: 'slides_create',
        arguments: {
          title: 'X',
          slides: [{ component: 'Cover', props: { subtitle: 'foo' } }],
        },
      });
      expect(result.isError).toBe(true);
      const sc = result.structuredContent as {
        error: { code: string; message: string; issues: Array<{ path: string }> };
      };
      expect(sc.error.code).toBe('validation_error');
      expect(sc.error.message).toMatch(/slides\[0\]/);
      expect(sc.error.message).toMatch(/title/);
      expect(sc.error.message).toMatch(/Fix the listed fields and retry/);
      expect(sc.error.issues.some((i) => i.path === 'title')).toBe(true);
    } finally {
      await h.close();
    }
  });

  test('error path: unknown component name lists known options and points at slides_list', async () => {
    const h = await makeHarness();
    try {
      const result = await h.client.callTool({
        name: 'slides_create',
        arguments: {
          title: 'X',
          slides: [{ component: 'NonExistent', props: {} }],
        },
      });
      expect(result.isError).toBe(true);
      const sc = result.structuredContent as { error: { code: string; message: string } };
      expect(sc.error.code).toBe('unknown_component');
      expect(sc.error.message).toMatch(/NonExistent/);
      expect(sc.error.message).toMatch(/Cover/);
      expect(sc.error.message).toMatch(/TwoColumn/);
      expect(sc.error.message).toMatch(/slides_list/);
    } finally {
      await h.close();
    }
  });

  test('strict()-rejected unknown props produce a validation error', async () => {
    const h = await makeHarness();
    try {
      const result = await h.client.callTool({
        name: 'slides_create',
        arguments: {
          title: 'X',
          slides: [{ component: 'Cover', props: { title: 'OK', rogueColor: '#ff00ff' } }],
        },
      });
      expect(result.isError).toBe(true);
      const sc = result.structuredContent as { error: { code: string } };
      expect(sc.error.code).toBe('validation_error');
    } finally {
      await h.close();
    }
  });
});
