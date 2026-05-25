/**
 * End-to-end smoke test: synthetic fixture template → reconciler →
 * `PptxSlidesRuntime` → real `.pptx` file on disk.
 *
 * Asserts the offline export path produces a valid PPTX (ZIP magic
 * number + non-zero size). Uses the in-repo brand-free fixture so the
 * framework doesn't depend on the Sanity brand template for its own
 * canary coverage.
 */

import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { PptxSlidesRuntime, renderToOps } from '../index.js';
import { Cover, testTemplate } from './fixtures/test-template/index.js';

describe('framework smoke test (fixture template → PptxSlidesRuntime → .pptx)', () => {
  it('writes a real .pptx (ZIP magic, non-zero size) using the fixture template', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'slides-pptx-smoke-'));
    try {
      const runtime = new PptxSlidesRuntime({ outputDir: dir });
      const tree = createElement(Cover, { title: 'Smoke Test', subtitle: 'fixture' });
      const result = renderToOps({
        tree,
        template: testTemplate,
        deckId: null,
        now: () => '2026-05-06T00:00:00.000Z',
      });

      const { deckId } = await runtime.createDeckFromMaster('test:cover-v1', 'Smoke Test');
      const apply = await runtime.applyOps(deckId, result.ops);
      expect(Object.keys(apply.createdObjectIds).length).toBeGreaterThanOrEqual(2);

      const { filePath } = await runtime.write(deckId);
      const buf = await fs.readFile(filePath);
      expect(buf[0]).toBe(0x50);
      expect(buf[1]).toBe(0x4b);
      expect(buf.length).toBeGreaterThan(2000);
      // Magic-byte + size assertions catch nothing once pptxgenjs returns its
      // empty-deck shell. We need to confirm the .pptx actually contains
      // slide content. The local filenames in a ZIP appear inline (uncompressed,
      // null-terminator-free) right next to each entry's local file header, so
      // searching for `ppt/slides/slide1.xml` in the raw bytes is a robust check
      // without pulling in a ZIP parser.
      expect(buf.toString('latin1')).toContain('ppt/slides/slide1.xml');
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }, 30_000);
});
