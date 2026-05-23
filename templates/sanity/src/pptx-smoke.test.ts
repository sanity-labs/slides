/**
 * End-to-end smoke test: reference-deck components → reconciler →
 * PptxSlidesRuntime → file.
 *
 * No live network. The rendered tree includes local PNG logos and SVG data-URI
 * dot patterns so the offline export path exercises the visual assets that
 * need to match the web preview.
 *
 * Layer 3 of the testing pyramid for the PPTX runtime (see
 * `docs/testing-strategy.md`).
 */

import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Fragment, createElement, type ComponentType } from 'react';
import { describe, expect, it } from 'vitest';
import { renderToOps, PptxSlidesRuntime } from 'react-pptx';
import { sanity } from './index.js';

describe('Sanity reference deck → PptxSlidesRuntime smoke test', () => {
  it('renders local PNG and SVG pattern assets to a real .pptx file on disk', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sanity-pptx-smoke-'));
    try {
      const runtime = new PptxSlidesRuntime({ outputDir: dir });
      // The brand component is registered with type-erased props (per
      // `defineTemplateComponent` in `react-pptx`); cast at the call
      // site rather than carrying the generic up.
      const coverEntry = sanity.components.Cover;
      const demoEntry = sanity.components.Demo;
      if (!coverEntry) throw new Error('Cover component missing from sanity brand');
      if (!demoEntry) throw new Error('Demo component missing from sanity brand');
      const tree = createElement(
        Fragment,
        null,
        createElement(coverEntry.component as ComponentType<Record<string, unknown>>, {
          title: 'Q2 Review',
          subtitle: 'How we did',
        }),
        createElement(demoEntry.component as ComponentType<Record<string, unknown>>, {}),
      );
      const result = renderToOps({
        tree,
        template: sanity,
        deckId: null,
        now: () => '2026-05-06T00:00:00.000Z',
      });

      const { deckId } = await runtime.createDeckFromMaster('sanity:cover-v1', 'Q2 Review');
      const apply = await runtime.applyOps(deckId, result.ops);
      expect(Object.keys(apply.createdObjectIds).length).toBeGreaterThanOrEqual(4);

      const { filePath } = await runtime.write(deckId);
      const buf = await fs.readFile(filePath);
      // PPTX is a ZIP archive — check the magic number to confirm a valid
      // file shape without binding to vendor-specific contents.
      expect(buf[0]).toBe(0x50);
      expect(buf[1]).toBe(0x4b);
      expect(buf.length).toBeGreaterThan(2000);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }, 30_000);
});
