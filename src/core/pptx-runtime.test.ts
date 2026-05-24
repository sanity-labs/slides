import { describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { PptxSlidesRuntime, DEFAULT_PPTX_FONT_SUBSTITUTION } from './pptx-runtime.js';
import { ptToEmu } from './geometry.js';
import type { SlideOp } from './runtime.js';

const tmpDir = async (): Promise<string> => {
  return fs.mkdtemp(path.join(os.tmpdir(), 'pptx-runtime-test-'));
};

const isZipMagicNumber = (buf: Buffer): boolean =>
  // PPTX is a ZIP — first two bytes are 'PK' (0x50, 0x4B).
  buf.length >= 2 && buf[0] === 0x50 && buf[1] === 0x4b;

describe('PptxSlidesRuntime', () => {
  it('createDeckFromMaster mints a deckId and tracks it', async () => {
    const runtime = new PptxSlidesRuntime();
    const { deckId } = await runtime.createDeckFromMaster('sanity:cover-v1', 'Test Deck');
    expect(deckId).toMatch(/^pptx-deck-\d+$/);
    expect(runtime.listDeckIds()).toContain(deckId);
  });

  it('applyOps emits createObjectIds containing every created id', async () => {
    const runtime = new PptxSlidesRuntime();
    const { deckId } = await runtime.createDeckFromMaster('sanity:cover-v1', 'X');
    const ops: SlideOp[] = [
      { type: 'createSlide', slideId: 'slide_1' },
      {
        type: 'createShape',
        slideId: 'slide_1',
        shapeId: 'shape_1',
        shape: 'TEXT_BOX',
        rect: { x: 0, y: 0, w: ptToEmu(100), h: ptToEmu(50) },
      },
      { type: 'insertText', objectId: 'shape_1', text: 'hello' },
    ];
    const result = await runtime.applyOps(deckId, ops);
    expect(result.createdObjectIds['slide_1']).toBe('slide_1');
    expect(result.createdObjectIds['shape_1']).toBe('shape_1');
    expect(result.revisionId).toBe('pptx-rev-1');
  });

  it('write produces a real PPTX file (ZIP magic number, non-zero bytes)', async () => {
    const dir = await tmpDir();
    const runtime = new PptxSlidesRuntime({ outputDir: dir });
    const { deckId } = await runtime.createDeckFromMaster('sanity:cover-v1', 'Smoke Test');
    const ops: SlideOp[] = [
      { type: 'createSlide', slideId: 'slide_1' },
      {
        type: 'createShape',
        slideId: 'slide_1',
        shapeId: 'shape_1',
        shape: 'TEXT_BOX',
        rect: { x: ptToEmu(50), y: ptToEmu(50), w: ptToEmu(400), h: ptToEmu(100) },
      },
      { type: 'insertText', objectId: 'shape_1', text: 'Hello PPTX' },
      {
        type: 'updateTextStyle',
        objectId: 'shape_1',
        range: { start: 0, end: 10 },
        style: { fontFamily: 'Inter', fontSize: 32, foregroundColor: '#FF5500', bold: true },
      },
    ];
    await runtime.applyOps(deckId, ops);
    const { filePath } = await runtime.write(deckId);
    expect(filePath).toMatch(/Smoke-Test\.pptx$/);
    const buf = await fs.readFile(filePath);
    expect(buf.length).toBeGreaterThan(1000);
    expect(isZipMagicNumber(buf)).toBe(true);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('write emits a deck containing a fill-only background rectangle (regression: empty Box + fill)', async () => {
    // The Cover component emits a full-bleed empty Box with a fill — the
    // runtime should produce a non-trivial file even though the box has no
    // text.
    const dir = await tmpDir();
    const runtime = new PptxSlidesRuntime({ outputDir: dir });
    const { deckId } = await runtime.createDeckFromMaster('sanity:cover-v1', 'Bg Only');
    const ops: SlideOp[] = [
      { type: 'createSlide', slideId: 's' },
      {
        type: 'createShape',
        slideId: 's',
        shapeId: 'bg',
        shape: 'TEXT_BOX',
        rect: { x: 0, y: 0, w: ptToEmu(960), h: ptToEmu(540) },
      },
      { type: 'updateShapeProperties', objectId: 'bg', properties: { fillColor: '#0b0b0b' } },
    ];
    await runtime.applyOps(deckId, ops);
    const { filePath } = await runtime.write(deckId);
    const buf = await fs.readFile(filePath);
    expect(isZipMagicNumber(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(1000);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('substrate ships an empty default substitution table (brands inject their own)', () => {
    expect(Object.keys(DEFAULT_PPTX_FONT_SUBSTITUTION)).toHaveLength(0);
  });

  it('throws a clear error when applyOps targets an unknown deck', async () => {
    const runtime = new PptxSlidesRuntime();
    await expect(runtime.applyOps('does-not-exist', [])).rejects.toThrow(
      /deck "does-not-exist" does not exist/,
    );
  });

  it('attachManifest + getManifest round-trip', async () => {
    const runtime = new PptxSlidesRuntime();
    const { deckId } = await runtime.createDeckFromMaster('m', 't');
    const manifest = {
      manifestVersion: '1' as const,
      generatedBy: 'react-pptx' as const,
      generatedAt: '2026-01-01T00:00:00.000Z',
      templateName: 'sanity',
      deckId,
      slots: {},
      artifacts: [],
    };
    runtime.attachManifest(deckId, manifest);
    expect(runtime.getManifest(deckId)).toEqual(manifest);
  });

  it('sanitizes deck title into safe filename (regression: spaces and slashes)', async () => {
    const dir = await tmpDir();
    const runtime = new PptxSlidesRuntime({ outputDir: dir });
    const { deckId } = await runtime.createDeckFromMaster('m', 'Q2 Review / Final');
    await runtime.applyOps(deckId, [{ type: 'createSlide', slideId: 's' }]);
    const { filePath } = await runtime.write(deckId);
    expect(filePath).toMatch(/Q2-Review-Final\.pptx$/);
    await fs.rm(dir, { recursive: true, force: true });
  });
});
