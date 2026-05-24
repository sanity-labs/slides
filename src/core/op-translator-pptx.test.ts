import { describe, expect, it, vi } from 'vitest';
import { translateOpsToPptx, hexToPptxColor } from './op-translator-pptx.js';
import { ptToEmu, EMU_PER_INCH } from './geometry.js';
import type { SlideOp } from './runtime.js';

describe('translateOpsToPptx', () => {
  it('createSlide produces a slide entry; insertAt is preserved', () => {
    const ops: SlideOp[] = [{ type: 'createSlide', slideId: 'slide_1', insertAt: 0 }];
    const batch = translateOpsToPptx(ops);
    expect(batch.slides).toEqual([{ slideId: 'slide_1', insertAt: 0 }]);
    expect(batch.objects).toEqual([]);
    expect(batch.createdObjectIds).toContain('slide_1');
  });

  it('createShape TEXT_BOX produces a text object with EMU rect converted to inches', () => {
    const ops: SlideOp[] = [
      { type: 'createSlide', slideId: 'slide_1' },
      {
        type: 'createShape',
        slideId: 'slide_1',
        shapeId: 'shape_1',
        shape: 'TEXT_BOX',
        // 1 inch = 914400 EMU
        rect: { x: EMU_PER_INCH, y: 2 * EMU_PER_INCH, w: 3 * EMU_PER_INCH, h: 4 * EMU_PER_INCH },
      },
    ];
    const batch = translateOpsToPptx(ops);
    expect(batch.objects).toHaveLength(1);
    const obj = batch.objects[0];
    expect(obj?.kind).toBe('text');
    expect(obj?.position).toEqual({ x: 1, y: 2, w: 3, h: 4 });
  });

  it('createShape RECTANGLE produces a rectangle object', () => {
    const ops: SlideOp[] = [
      { type: 'createSlide', slideId: 's' },
      {
        type: 'createShape',
        slideId: 's',
        shapeId: 'r1',
        shape: 'RECTANGLE',
        rect: { x: 0, y: 0, w: EMU_PER_INCH, h: EMU_PER_INCH },
      },
    ];
    const batch = translateOpsToPptx(ops);
    expect(batch.objects[0]?.kind).toBe('rectangle');
  });

  it('insertText sets text content on the matching object', () => {
    const ops: SlideOp[] = [
      { type: 'createSlide', slideId: 's' },
      {
        type: 'createShape',
        slideId: 's',
        shapeId: 'shape_1',
        shape: 'TEXT_BOX',
        rect: { x: 0, y: 0, w: EMU_PER_INCH, h: EMU_PER_INCH },
      },
      { type: 'insertText', objectId: 'shape_1', text: 'hello world' },
    ];
    const batch = translateOpsToPptx(ops);
    const obj = batch.objects[0];
    expect(obj?.kind).toBe('text');
    if (obj?.kind === 'text') {
      expect(obj.text).toBe('hello world');
    }
  });

  it('updateShapeProperties merges fillColor (strips leading #)', () => {
    const ops: SlideOp[] = [
      { type: 'createSlide', slideId: 's' },
      {
        type: 'createShape',
        slideId: 's',
        shapeId: 'shape_1',
        shape: 'TEXT_BOX',
        rect: { x: 0, y: 0, w: EMU_PER_INCH, h: EMU_PER_INCH },
      },
      { type: 'updateShapeProperties', objectId: 'shape_1', properties: { fillColor: '#0b0b0b' } },
    ];
    const batch = translateOpsToPptx(ops);
    const obj = batch.objects[0];
    if (obj?.kind === 'text') {
      expect(obj.fill).toBe('0B0B0B');
    } else {
      throw new Error('expected text object');
    }
  });

  it('updateTextStyle applies font substitution (Waldenburg → Inter)', () => {
    const ops: SlideOp[] = [
      { type: 'createSlide', slideId: 's' },
      {
        type: 'createShape',
        slideId: 's',
        shapeId: 'shape_1',
        shape: 'TEXT_BOX',
        rect: { x: 0, y: 0, w: ptToEmu(100), h: ptToEmu(50) },
      },
      { type: 'insertText', objectId: 'shape_1', text: 'hi' },
      {
        type: 'updateTextStyle',
        objectId: 'shape_1',
        range: { start: 0, end: 2 },
        style: { fontFamily: 'Waldenburg', fontSize: 24 },
      },
    ];
    const batch = translateOpsToPptx(ops, {
      fontSubstitution: { Waldenburg: 'Inter' },
      onUnknownFont: null,
    });
    const obj = batch.objects[0];
    if (obj?.kind !== 'text') throw new Error('expected text object');
    expect(obj.textSpans[0]?.style.fontFamily).toBe('Inter');
    // Identity passthrough doesn't substitute and doesn't warn.
    expect(obj.textSpans[0]?.style.fontSize).toBe(24);
  });

  it('updateTextStyle warns once per unknown font', () => {
    const warn = vi.fn();
    const ops: SlideOp[] = [
      { type: 'createSlide', slideId: 's' },
      {
        type: 'createShape',
        slideId: 's',
        shapeId: 'a',
        shape: 'TEXT_BOX',
        rect: { x: 0, y: 0, w: ptToEmu(10), h: ptToEmu(10) },
      },
      { type: 'insertText', objectId: 'a', text: 'x' },
      {
        type: 'updateTextStyle',
        objectId: 'a',
        range: { start: 0, end: 1 },
        style: { fontFamily: 'Comic Sans' },
      },
      {
        type: 'updateTextStyle',
        objectId: 'a',
        range: { start: 0, end: 1 },
        style: { fontFamily: 'Comic Sans' },
      },
    ];
    translateOpsToPptx(ops, { fontSubstitution: {}, onUnknownFont: warn });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('Comic Sans');
  });

  it('createImage with altText emits an image object with both fields populated', () => {
    const ops: SlideOp[] = [
      { type: 'createSlide', slideId: 's' },
      {
        type: 'createImage',
        slideId: 's',
        imageId: 'img_1',
        url: 'https://example.com/x.png',
        rect: { x: 0, y: 0, w: EMU_PER_INCH, h: EMU_PER_INCH },
        altText: 'rgs-slot:cover:hero',
      },
    ];
    const batch = translateOpsToPptx(ops);
    const obj = batch.objects[0];
    expect(obj?.kind).toBe('image');
    if (obj?.kind === 'image') {
      expect(obj.url).toBe('https://example.com/x.png');
      expect(obj.altText).toBe('rgs-slot:cover:hero');
    }
  });

  it('updateParagraphStyle merges paragraph style on text object', () => {
    const ops: SlideOp[] = [
      { type: 'createSlide', slideId: 's' },
      {
        type: 'createShape',
        slideId: 's',
        shapeId: 'a',
        shape: 'TEXT_BOX',
        rect: { x: 0, y: 0, w: EMU_PER_INCH, h: EMU_PER_INCH },
      },
      { type: 'insertText', objectId: 'a', text: 'x' },
      {
        type: 'updateParagraphStyle',
        objectId: 'a',
        range: { start: 0, end: 1 },
        style: { alignment: 'CENTER', lineSpacing: 1.4 },
      },
    ];
    const batch = translateOpsToPptx(ops);
    const obj = batch.objects[0];
    if (obj?.kind !== 'text') throw new Error('expected text');
    expect(obj.paragraphStyle).toEqual({ alignment: 'CENTER', lineSpacing: 1.4 });
  });
});

describe('hexToPptxColor', () => {
  it('strips leading # and uppercases', () => {
    expect(hexToPptxColor('#ff5500')).toBe('FF5500');
    expect(hexToPptxColor('#0b0b0b')).toBe('0B0B0B');
  });

  it('passes through bare hex', () => {
    expect(hexToPptxColor('FF5500' as `#${string}`)).toBe('FF5500');
  });
});
