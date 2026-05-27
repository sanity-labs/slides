import type { CSSProperties, ReactElement } from 'react';
import type { Canvas } from '../core/geometry.js';
import { EMU_PER_POINT } from '../core/geometry.js';
import type { FakeDeck, FakeShape, FakeSlide } from '../core/fake-runtime.js';
import type { ParagraphStyle, TextStyle } from '../core/runtime.js';

export type SlideCanvasProps = {
  readonly slide: FakeSlide;
  readonly deck: FakeDeck;
  readonly canvas: Canvas;
  readonly background?: string;
  readonly style?: CSSProperties;
};

export const SlideCanvas = ({
  slide,
  deck,
  canvas,
  background = '#ffffff',
  style,
}: SlideCanvasProps): ReactElement => {
  const rootStyle: CSSProperties = {
    position: 'relative',
    width: `${canvas.w}px`,
    height: `${canvas.h}px`,
    background,
    overflow: 'hidden',
    isolation: 'isolate',
    textAlign: 'left',
    ...style,
  };

  return (
    <div data-slide-id={slide.slideId} style={rootStyle}>
      {slide.shapeIds.map((id) => {
        const shape = deck.shapes.get(id);
        if (!shape) return null;
        return <Shape key={id} shape={shape} />;
      })}
    </div>
  );
};

const Shape = ({ shape }: { shape: FakeShape }): ReactElement | null => {
  const { x, y, w, h } = emuRectToPt(shape.rect);
  const baseStyle: CSSProperties = {
    position: 'absolute',
    left: `${x}px`,
    top: `${y}px`,
    width: `${w}px`,
    height: `${h}px`,
  };

  if (shape.imageUrl) {
    const objectFit: CSSProperties['objectFit'] = shape.imageFit ?? 'fill';
    const imageStyle: CSSProperties = {
      ...baseStyle,
      objectFit,
      display: 'block',
      ...(shape.imageOpacity !== undefined ? { opacity: shape.imageOpacity } : {}),
      ...(shape.imageRotate !== undefined ? { transform: `rotate(${shape.imageRotate}deg)` } : {}),
    };
    return (
      <img
        src={shape.imageUrl}
        alt={shape.altText ?? ''}
        style={imageStyle}
        data-object-id={shape.objectId}
      />
    );
  }

  const { fillColor, outlineColor, outlineWeight } = shape.shapeProperties;
  const boxStyle: CSSProperties = {
    ...baseStyle,
    ...(fillColor ? { background: fillColor } : {}),
    ...(outlineColor ? { border: `${outlineWeight ?? 1}px solid ${outlineColor}` } : {}),
  };

  if (shape.text.length === 0) {
    return <div data-object-id={shape.objectId} style={boxStyle} />;
  }

  const paragraphStyle = composeParagraphStyle(shape);
  const segments = composeTextSegments(shape.text, shape.textStyleSpans);

  return (
    <div
      data-object-id={shape.objectId}
      style={{
        ...boxStyle,
        display: 'flex',
        alignItems: 'flex-start',
        whiteSpace: 'pre-wrap',
      }}
    >
      <div style={{ width: '100%', ...paragraphStyle }}>
        {segments.map((seg, i) => (
          <span key={i} style={textStyleToCss(seg.style)}>
            {seg.text}
          </span>
        ))}
      </div>
    </div>
  );
};

const emuRectToPt = (rect: FakeShape['rect']): FakeShape['rect'] => ({
  x: rect.x / EMU_PER_POINT,
  y: rect.y / EMU_PER_POINT,
  w: rect.w / EMU_PER_POINT,
  h: rect.h / EMU_PER_POINT,
});

type Segment = { text: string; style: TextStyle };

const composeTextSegments = (text: string, spans: FakeShape['textStyleSpans']): Segment[] => {
  if (spans.length === 0) return [{ text, style: {} }];

  const cuts = new Set<number>([0, text.length]);
  for (const span of spans) {
    cuts.add(Math.max(0, Math.min(span.range.start, text.length)));
    cuts.add(Math.max(0, Math.min(span.range.end, text.length)));
  }
  const ordered = [...cuts].sort((a, b) => a - b);

  const segments: Segment[] = [];
  for (let i = 0; i < ordered.length - 1; i++) {
    const start = ordered[i] as number;
    const end = ordered[i + 1] as number;
    if (start >= end) continue;
    let style: TextStyle = {};
    for (const span of spans) {
      if (span.range.start <= start && span.range.end >= end) {
        style = { ...style, ...span.style };
      }
    }
    segments.push({ text: text.slice(start, end), style });
  }
  return segments;
};

const composeParagraphStyle = (shape: FakeShape): CSSProperties => {
  const spans = shape.paragraphStyleSpans;
  if (spans.length === 0) return {};
  const merged: ParagraphStyle = spans.reduce<ParagraphStyle>(
    (acc, s) => ({ ...acc, ...s.style }),
    {},
  );
  return paragraphStyleToCss(merged);
};

const textStyleToCss = (style: TextStyle): CSSProperties => {
  const css: CSSProperties = {};
  if (style.fontFamily) {
    const family = /\s/.test(style.fontFamily) ? `"${style.fontFamily}"` : style.fontFamily;
    css.fontFamily = `${family}, system-ui, sans-serif`;
  }
  if (style.fontSize !== undefined) css.fontSize = `${style.fontSize}px`;
  if (style.bold) css.fontWeight = 'bold';
  if (style.italic) css.fontStyle = 'italic';
  if (style.underline) css.textDecoration = 'underline';
  if (style.foregroundColor) css.color = style.foregroundColor;
  if (style.backgroundColor) css.background = style.backgroundColor;
  return css;
};

const paragraphStyleToCss = (style: ParagraphStyle): CSSProperties => {
  const css: CSSProperties = {};
  if (style.alignment) {
    const map = { START: 'left', CENTER: 'center', END: 'right', JUSTIFIED: 'justify' } as const;
    css.textAlign = map[style.alignment];
  }
  if (style.lineSpacing !== undefined) css.lineHeight = style.lineSpacing;
  if (style.spaceAbove !== undefined) css.marginTop = `${style.spaceAbove}px`;
  if (style.spaceBelow !== undefined) css.marginBottom = `${style.spaceBelow}px`;
  return css;
};
