/**
 * Renders FakeDeck slides to PNG buffers via SVG + resvg.
 *
 * Used for agent visual feedback — approximate layout (positions, colors,
 * text content) matters more than pixel-perfect font metrics.
 */

import { Resvg } from '@resvg/resvg-js';
import type { FakeDeck, FakeShape } from '../core/fake-runtime.js';
import type { Canvas } from '../core/geometry.js';
import { EMU_PER_POINT } from '../core/geometry.js';

const emuToPt = (emu: number): number => emu / EMU_PER_POINT;

/** Map font family roles to safe system fonts resvg can render. */
const resolveFont = (family: string | undefined): string => {
  if (!family) return 'Arial';
  if (family === 'display' || family === 'body') return 'Arial';
  if (family === 'mono') return 'Courier New';
  return family;
};

/** Escape text for safe embedding in SVG XML. */
const escapeXml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Resolve the effective text style at a given character index.
 * Later spans win (last-write-wins), matching FakeSlidesRuntime semantics.
 */
const resolveStyleAt = (
  spans: FakeShape['textStyleSpans'],
  index: number,
): { fontFamily: string; fontSize: number; foregroundColor: string; bold: boolean } => {
  let fontFamily: string | undefined;
  let fontSize: number | undefined;
  let foregroundColor: string | undefined;
  let bold: boolean | undefined;

  for (const { range, style } of spans) {
    if (index >= range.start && index < range.end) {
      if (style.fontFamily !== undefined) fontFamily = style.fontFamily;
      if (style.fontSize !== undefined) fontSize = style.fontSize;
      if (style.foregroundColor !== undefined) foregroundColor = style.foregroundColor;
      if (style.bold !== undefined) bold = style.bold;
    }
  }

  return {
    fontFamily: resolveFont(fontFamily),
    fontSize: fontSize ?? 14,
    foregroundColor: foregroundColor ?? '#FFFFFF',
    bold: bold ?? false,
  };
};

/** Build SVG markup for a single text shape. */
const renderTextShape = (shape: FakeShape, x: number, y: number, w: number, _h: number): string => {
  const lines = shape.text.split('\n');
  if (lines.length === 0) return '';

  const tspans: string[] = [];
  let charOffset = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    const style = resolveStyleAt(shape.textStyleSpans, charOffset);
    const dy = i === 0 ? style.fontSize : style.fontSize * 1.3;
    const weight = style.bold ? 'bold' : 'normal';

    tspans.push(
      `<tspan x="${x + 4}" dy="${dy}" ` +
        `fill="${escapeXml(style.foregroundColor)}" ` +
        `font-family="${escapeXml(style.fontFamily)}" ` +
        `font-size="${style.fontSize}" ` +
        `font-weight="${weight}">` +
        `${escapeXml(line)}</tspan>`,
    );

    // +1 for the \n delimiter between lines
    charOffset += line.length + 1;
  }

  return `<text x="${x}" y="${y}" width="${w}">${tspans.join('')}</text>`;
};

/** Build SVG markup for a single image shape (or placeholder). */
const renderImageShape = (shape: FakeShape, x: number, y: number, w: number, h: number): string => {
  const url = shape.imageUrl ?? '';

  // Data URIs / SVG-in-SVG patterns can't be rendered by resvg — show a
  // labeled placeholder instead.
  if (url.startsWith('data:')) {
    const label = shape.altText || 'texture';
    return (
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#666666" rx="4"/>` +
      `<text x="${x + w / 2}" y="${y + h / 2}" text-anchor="middle" ` +
      `dominant-baseline="central" fill="#CCCCCC" font-family="Arial" font-size="12">` +
      `${escapeXml(label)}</text>`
    );
  }

  return `<image x="${x}" y="${y}" width="${w}" height="${h}" href="${escapeXml(url)}"/>`;
};

/** Build SVG markup for a single shape. */
const renderShape = (shape: FakeShape): string => {
  const x = emuToPt(shape.rect.x);
  const y = emuToPt(shape.rect.y);
  const w = emuToPt(shape.rect.w);
  const h = emuToPt(shape.rect.h);

  const parts: string[] = [];

  // Background fill
  if (shape.shapeProperties.fillColor) {
    const rx = shape.shapeProperties.outlineWeight ? 0 : 2;
    let outline = '';
    if (shape.shapeProperties.outlineColor) {
      const weight = shape.shapeProperties.outlineWeight ?? 1;
      outline = ` stroke="${escapeXml(shape.shapeProperties.outlineColor)}" stroke-width="${weight}"`;
    }
    parts.push(
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" ` +
        `fill="${escapeXml(shape.shapeProperties.fillColor)}" rx="${rx}"${outline}/>`,
    );
  }

  // Image
  if (shape.imageUrl !== undefined) {
    parts.push(renderImageShape(shape, x, y, w, h));
  }

  // Text
  if (shape.text) {
    parts.push(renderTextShape(shape, x, y, w, h));
  }

  return parts.join('\n');
};

/** Render every slide in a FakeDeck to PNG buffers. */
export const renderSlidesToPng = (deck: FakeDeck, canvas: Canvas): Buffer[] => {
  // Sort slides by insertAt to match presentation order
  const sortedSlides = [...deck.slides.values()].sort((a, b) => a.insertAt - b.insertAt);

  return sortedSlides.map((slide) => {
    const shapes = slide.shapeIds
      .map((id) => deck.shapes.get(id))
      .filter((s): s is FakeShape => s !== undefined);

    const body = shapes.map(renderShape).join('\n');

    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" ` +
      `xmlns:xlink="http://www.w3.org/1999/xlink" ` +
      `width="${canvas.w}" height="${canvas.h}" ` +
      `viewBox="0 0 ${canvas.w} ${canvas.h}">` +
      `<rect width="${canvas.w}" height="${canvas.h}" fill="#1a1a2e"/>` +
      `${body}</svg>`;

    const resvg = new Resvg(svg, {
      fitTo: { mode: 'width', value: canvas.w },
    });
    return Buffer.from(resvg.render().asPng());
  });
};
