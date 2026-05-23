import { describe, expect, test } from 'vitest';
import { FakeSlidesRuntime } from './fake-runtime.js';
import type { SlideOp } from './runtime.js';

describe('FakeSlidesRuntime — deck creation', () => {
  test('createDeckFromMaster mints a fresh deck ID by default', async () => {
    const rt = new FakeSlidesRuntime();
    const a = await rt.createDeckFromMaster('master-ref', 'A');
    const b = await rt.createDeckFromMaster('master-ref', 'B');
    expect(a.deckId).not.toBe(b.deckId);
    expect(rt.listDeckIds()).toEqual([a.deckId, b.deckId]);
  });

  test('fixedDeckId option pins the deck ID for snapshot stability', async () => {
    const rt = new FakeSlidesRuntime({ fixedDeckId: 'pinned-id' });
    const result = await rt.createDeckFromMaster('master-ref', 'X');
    expect(result.deckId).toBe('pinned-id');
  });

  test('applyOps against an unknown deck throws', async () => {
    const rt = new FakeSlidesRuntime();
    await expect(rt.applyOps('does-not-exist', [])).rejects.toThrow(/does not exist/);
  });
});

describe('FakeSlidesRuntime — applyOps maintains coherent deck state', () => {
  test('createSlide + createShape + insertText build a readable deck', async () => {
    const rt = new FakeSlidesRuntime({ fixedDeckId: 'd1' });
    await rt.createDeckFromMaster('master', 'Test');
    const ops: SlideOp[] = [
      { type: 'createSlide', slideId: 's1', insertAt: 0 },
      {
        type: 'createShape',
        slideId: 's1',
        shapeId: 'shape1',
        shape: 'TEXT_BOX',
        rect: { x: 0, y: 0, w: 100, h: 100 },
      },
      { type: 'insertText', objectId: 'shape1', text: 'Hello' },
    ];
    const result = await rt.applyOps('d1', ops);
    expect(result.createdObjectIds).toEqual({ s1: 's1', shape1: 'shape1' });

    const deck = rt.getDeck('d1');
    expect(deck?.slideOrder).toEqual(['s1']);
    expect(deck?.shapes.get('shape1')?.text).toBe('Hello');
  });
});

describe('FakeSlidesRuntime — getOpsLog records every op', () => {
  test('logs ops in apply order, tagged with deckId', async () => {
    const rt = new FakeSlidesRuntime({ fixedDeckId: 'd1' });
    await rt.createDeckFromMaster('master', 'A');
    await rt.applyOps('d1', [{ type: 'createSlide', slideId: 's1', insertAt: 0 }]);
    await rt.applyOps('d1', [
      {
        type: 'createShape',
        slideId: 's1',
        shapeId: 'shape1',
        shape: 'TEXT_BOX',
        rect: { x: 0, y: 0, w: 100, h: 100 },
      },
    ]);

    const log = rt.getOpsLog();
    expect(log.map((entry) => entry.op.type)).toEqual(['createSlide', 'createShape']);
    expect(log.every((entry) => entry.deckId === 'd1')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// End-to-end: reconciler → applyOps round-trip for fills and images
// ---------------------------------------------------------------------------

describe('FakeSlidesRuntime — Box fill round-trip via applyOps', () => {
  test('a filled empty Box lands as a shape with fillColor in shapeProperties', async () => {
    const rt = new FakeSlidesRuntime({ fixedDeckId: 'd1' });
    await rt.createDeckFromMaster('master', 'Test');
    const ops: SlideOp[] = [
      { type: 'createSlide', slideId: 's1', insertAt: 0 },
      {
        type: 'createShape',
        slideId: 's1',
        shapeId: 'bg',
        shape: 'TEXT_BOX',
        rect: { x: 0, y: 0, w: 100, h: 100 },
      },
      { type: 'updateShapeProperties', objectId: 'bg', properties: { fillColor: '#ff5500' } },
    ];
    await rt.applyOps('d1', ops);

    const shape = rt.getDeck('d1')?.shapes.get('bg');
    expect(shape).toBeDefined();
    expect(shape?.shapeProperties.fillColor).toBe('#ff5500');
    expect(shape?.text).toBe('');
  });

  test('a filled Box with text preserves both fill and text after applyOps', async () => {
    const rt = new FakeSlidesRuntime({ fixedDeckId: 'd1' });
    await rt.createDeckFromMaster('master', 'Test');
    const ops: SlideOp[] = [
      { type: 'createSlide', slideId: 's1', insertAt: 0 },
      {
        type: 'createShape',
        slideId: 's1',
        shapeId: 'box',
        shape: 'TEXT_BOX',
        rect: { x: 0, y: 0, w: 100, h: 100 },
      },
      { type: 'updateShapeProperties', objectId: 'box', properties: { fillColor: '#0b0b0b' } },
      { type: 'insertText', objectId: 'box', text: 'Hello' },
    ];
    await rt.applyOps('d1', ops);

    const shape = rt.getDeck('d1')?.shapes.get('box');
    expect(shape?.shapeProperties.fillColor).toBe('#0b0b0b');
    expect(shape?.text).toBe('Hello');
  });
});

describe('FakeSlidesRuntime — Image round-trip via applyOps', () => {
  test('createImage lands an image-shape with url and altText set', async () => {
    const rt = new FakeSlidesRuntime({ fixedDeckId: 'd1' });
    await rt.createDeckFromMaster('master', 'Test');
    const ops: SlideOp[] = [
      { type: 'createSlide', slideId: 's1', insertAt: 0 },
      {
        type: 'createImage',
        slideId: 's1',
        imageId: 'hero',
        url: 'https://cdn.example.com/hero.png',
        rect: { x: 0, y: 0, w: 960, h: 540 },
        altText: 'Hero photo',
      },
    ];
    await rt.applyOps('d1', ops);

    const deck = rt.getDeck('d1');
    expect(deck?.slides.get('s1')?.shapeIds).toEqual(['hero']);
    const image = deck?.shapes.get('hero');
    expect(image?.imageUrl).toBe('https://cdn.example.com/hero.png');
    expect(image?.altText).toBe('Hero photo');
  });

  test('Box fill and Image coexist on the same slide in creation order', async () => {
    const rt = new FakeSlidesRuntime({ fixedDeckId: 'd1' });
    await rt.createDeckFromMaster('master', 'Test');
    const ops: SlideOp[] = [
      { type: 'createSlide', slideId: 's1', insertAt: 0 },
      {
        type: 'createShape',
        slideId: 's1',
        shapeId: 'bg',
        shape: 'TEXT_BOX',
        rect: { x: 0, y: 0, w: 960, h: 540 },
      },
      { type: 'updateShapeProperties', objectId: 'bg', properties: { fillColor: '#0b0b0b' } },
      {
        type: 'createImage',
        slideId: 's1',
        imageId: 'hero',
        url: 'https://cdn.example.com/hero.png',
        rect: { x: 100, y: 100, w: 400, h: 300 },
      },
    ];
    await rt.applyOps('d1', ops);

    const deck = rt.getDeck('d1');
    // Insertion order on the slide is preserved: bg first, then image.
    expect(deck?.slides.get('s1')?.shapeIds).toEqual(['bg', 'hero']);
    expect(deck?.shapes.get('bg')?.shapeProperties.fillColor).toBe('#0b0b0b');
    expect(deck?.shapes.get('hero')?.imageUrl).toBe('https://cdn.example.com/hero.png');
  });
});
