/**
 * Integration test for the `slides_create` MCP tool against the Sanity
 * template.
 *
 * Exercises createSlideServer with a PptxSlidesRuntime, calls the tool with
 * a Cover spec, and asserts the response contains a real .pptx file path.
 */

import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PptxSlidesRuntime } from '../core/index.js';
import { createSlideServer } from '../mcp/index.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { sanity, SANITY_PPTX_FONT_SUBSTITUTION } from './index.js';

describe('slides_create integration (Sanity template)', () => {
  it('end-to-end: tool call → .pptx file on disk', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sanity-mcp-pptx-'));
    try {
      const runtime = new PptxSlidesRuntime({
        outputDir: dir,
        fontSubstitution: SANITY_PPTX_FONT_SUBSTITUTION,
      });
      const server = createSlideServer({ template: sanity, runtime });

      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      await server.connect(serverTransport);
      const client = new Client({ name: 'test', version: '0.0.0' });
      await client.connect(clientTransport);

      const list = await client.listTools();
      const names = list.tools.map((t) => t.name);
      expect(names).toContain('slides_create');
      expect(names).toContain('slides_list');

      const response = await client.callTool({
        name: 'slides_create',
        arguments: {
          title: 'Q2 Review',
          slides: [
            {
              component: 'Cover',
              props: { title: 'Q2 Review', subtitle: 'How we did' },
            },
          ],
        },
      });

      expect(response.isError).toBeFalsy();
      const out = response.structuredContent as { filePath: string; slideCount: number };
      expect(out.filePath).toMatch(/Q2-Review\.pptx$/);
      expect(out.slideCount).toBe(1);
      const buf = await fs.readFile(out.filePath);
      expect(buf[0]).toBe(0x50);
      expect(buf[1]).toBe(0x4b);

      await server.close();
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }, 30_000);

  it('rejects unknown component with a structured error', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sanity-mcp-pptx-'));
    try {
      const runtime = new PptxSlidesRuntime({ outputDir: dir });
      const server = createSlideServer({ template: sanity, runtime });
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      await server.connect(serverTransport);
      const client = new Client({ name: 'test', version: '0.0.0' });
      await client.connect(clientTransport);

      const response = await client.callTool({
        name: 'slides_create',
        arguments: {
          title: 'X',
          slides: [{ component: 'Bogus', props: {} }],
        },
      });
      expect(response.isError).toBe(true);
      const text = (response.content as Array<{ text: string }>)[0]?.text ?? '';
      expect(text).toMatch(/Bogus/);
      await server.close();
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }, 30_000);
});
