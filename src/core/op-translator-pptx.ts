/**
 * Pure translation from `SlideOp` (the reconciler's typed intent) to a
 * compact intermediate representation that pptxgenjs can consume.
 *
 * # Why not emit pptxgenjs calls directly
 *
 * pptxgenjs is stateful: `slide.addText(...)` mutates the Slide. The
 * `SlideOp` stream is sequential — `createShape` is followed by
 * `insertText`, `updateTextStyle`, etc. — so a one-pass-per-op translator
 * would have to issue `addText` immediately on `createShape`, then mutate
 * the already-added text on style ops, which pptxgenjs doesn't support.
 *
 * Instead, this module collapses an op stream into an array of
 * `PptxObject` records — one per slide-level object. The runtime then walks
 * the records and emits pptxgenjs calls in one shot per shape.
 *
 * # Unit conversion
 *
 * SlideOps carry positions in EMU. pptxgenjs uses inches. This module is
 * the single boundary that converts EMU → inches; the substrate's
 * pt-then-EMU-at-emit choice is unchanged.
 *
 * # Per-runtime font substitution
 *
 * The translator accepts a `fontSubstitution` map. When a SlideOp's
 * `updateTextStyle.fontFamily` matches a key, the value replaces it on
 * emit. PPTX cannot embed fonts; viewers need the family installed locally.
 * Brands ship their own substitution table (see `@sanity-labs/slides` for an
 * example); the substrate's default is empty.
 *
 * # Known gaps
 *
 * - **Outline weight + outline color on TEXT_BOX shapes.** pptxgenjs
 *   supports outlines via `line` on `addShape`, but text boxes go through
 *   `addText` whose options don't carry an outline. If a brand needs
 *   outlined text boxes, emit a sibling rectangle.
 * - **Manifest persistence into the .pptx file.** The runtime holds the
 *   manifest in memory only; re-fill against a previously-generated .pptx
 *   is out of scope.
 */

import { EMU_PER_INCH } from './geometry.js';
import type {
  EmuRect,
  HexColor,
  ParagraphStyle,
  ShapeProperties,
  SlideOp,
  TextStyle,
} from './runtime.js';

/**
 * The pptxgenjs-shaped representation of a single object on a slide.
 * Discriminated by `kind` so the runtime can dispatch `addText` vs
 * `addShape` vs `addImage`.
 */
export type PptxObject = PptxText | PptxRectangle | PptxImage;

/** A text box (TEXT_BOX shape) — emitted via `slide.addText`. */
export interface PptxText {
  readonly kind: 'text';
  readonly slideId: string;
  readonly objectId: string;
  /** Position, in inches. */
  readonly position: PptxPosition;
  /** Background fill color, no leading `#`. */
  readonly fill?: string;
  /** Plain text content. Empty string when no `insertText` op was applied. */
  readonly text: string;
  /**
   * Per-range text-style spans. The runtime composes these into an array
   * of `TextProps` segments for pptxgenjs.
   *
   * Spans are recorded in op order; later spans on overlapping ranges win
   * at composition time (matches FakeSlidesRuntime semantics).
   */
  readonly textSpans: ReadonlyArray<{ start: number; end: number; style: TextStyle }>;
  /** Paragraph-level style — pptxgenjs applies one set per addText call. */
  readonly paragraphStyle?: ParagraphStyle;
}

/** A non-text rectangle/ellipse — emitted via `slide.addShape`. */
export interface PptxRectangle {
  readonly kind: 'rectangle';
  readonly slideId: string;
  readonly objectId: string;
  readonly position: PptxPosition;
  readonly shape: 'rect' | 'ellipse' | 'line';
  readonly fill?: string;
  readonly outlineColor?: string;
  readonly outlineWeight?: number;
}

/** An image — emitted via `slide.addImage`. */
export interface PptxImage {
  readonly kind: 'image';
  readonly slideId: string;
  readonly objectId: string;
  readonly position: PptxPosition;
  readonly url: string;
  readonly altText?: string;
  /** Object-fit semantics. Maps to pptxgenjs `sizing.type`. */
  readonly fit?: 'contain' | 'cover' | 'fill';
  /** 0–1 opacity; pptxgenjs takes the inverse on export. */
  readonly opacity?: number;
  /** Rotation in degrees, clockwise. */
  readonly rotate?: number;
}

/** Position in inches — pptxgenjs's native unit. */
export interface PptxPosition {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** What the translator emits for a whole `applyOps` batch. */
export interface PptxBatch {
  /**
   * Slides to create, in op order. For each entry, `insertAt` mirrors the
   * SlideOp's index (currently informational; pptxgenjs appends in
   * call order).
   */
  readonly slides: ReadonlyArray<{ slideId: string; insertAt: number | undefined }>;
  /**
   * Per-slide objects, in creation order. The runtime iterates and emits
   * the corresponding pptxgenjs call.
   */
  readonly objects: readonly PptxObject[];
  /** Object IDs (slide / shape / image) created by this batch. */
  readonly createdObjectIds: readonly string[];
}

/**
 * Per-call translator options. The font-substitution map is the Option X
 * font resolver — see `pptx-runtime.ts` for the rationale.
 */
export interface TranslateOptions {
  /**
   * Map of resolved-font-name → output-font-name. When an op's
   * `fontFamily` is a key, the value replaces it. Pass-through when not.
   */
  readonly fontSubstitution?: Readonly<Record<string, string>>;
  /**
   * Optional warning hook for fonts that aren't in the substitution table.
   * Default: no-op. The runtime itself decides whether to log; libraries
   * should not write to stdout/stderr without opt-in.
   */
  readonly onUnknownFont?: ((fontFamily: string) => void) | null;
}

/**
 * Walk a SlideOp stream and produce the pptxgenjs-shaped batch.
 *
 * The translator is stateful within a single call: shapes accumulate
 * styles from later ops. Across calls, it's pure — given the same ops
 * and options, output is deterministic.
 */
export const translateOpsToPptx = (
  ops: readonly SlideOp[],
  options: TranslateOptions = {},
): PptxBatch => {
  const slides: { slideId: string; insertAt: number | undefined }[] = [];
  const objects: PptxObject[] = [];
  const objectIndex = new Map<string, number>();
  const createdObjectIds: string[] = [];
  const subs = options.fontSubstitution ?? {};
  const warned = new Set<string>();
  // Default to a no-op: libraries shouldn't write to stdout/stderr without
  // explicit opt-in. The runtime can pass `console.warn` (or its own logger)
  // when it actually wants user-facing warnings.
  const warn = options.onUnknownFont ?? noopWarn;

  const upsertText = (slideId: string, objectId: string, position: PptxPosition): PptxText => {
    const idx = objectIndex.get(objectId);
    if (idx !== undefined) {
      const existing = objects[idx];
      if (existing && existing.kind === 'text') return existing;
      throw new Error(
        `translateOpsToPptx: object "${objectId}" already exists as a non-text ${existing?.kind ?? 'unknown'}.`,
      );
    }
    const text: PptxText = {
      kind: 'text',
      slideId,
      objectId,
      position,
      text: '',
      textSpans: [],
    } as PptxText;
    objectIndex.set(objectId, objects.length);
    objects.push(text);
    createdObjectIds.push(objectId);
    return text;
  };

  const findText = (objectId: string, opName: string): PptxText => {
    const idx = objectIndex.get(objectId);
    if (idx === undefined) {
      throw new Error(`translateOpsToPptx: ${opName} targets unknown object "${objectId}".`);
    }
    const obj = objects[idx];
    if (!obj || obj.kind !== 'text') {
      throw new Error(`translateOpsToPptx: ${opName} targets non-text object "${objectId}".`);
    }
    return obj;
  };

  const replaceObject = (idx: number, replacement: PptxObject): void => {
    objects[idx] = replacement;
  };

  for (const op of ops) {
    switch (op.type) {
      case 'createSlide': {
        slides.push({ slideId: op.slideId, insertAt: op.insertAt });
        createdObjectIds.push(op.slideId);
        break;
      }
      case 'createShape': {
        const position = emuRectToInches(op.rect);
        if (op.shape === 'TEXT_BOX') {
          upsertText(op.slideId, op.shapeId, position);
        } else {
          // RECTANGLE / ELLIPSE / LINE — emit as pptxgenjs shape.
          const rect: PptxRectangle = {
            kind: 'rectangle',
            slideId: op.slideId,
            objectId: op.shapeId,
            position,
            shape: shapeKindToPptx(op.shape),
          };
          objectIndex.set(op.shapeId, objects.length);
          objects.push(rect);
          createdObjectIds.push(op.shapeId);
        }
        break;
      }
      case 'createImage': {
        const image: PptxImage = {
          kind: 'image',
          slideId: op.slideId,
          objectId: op.imageId,
          position: emuRectToInches(op.rect),
          url: op.url,
          ...(op.altText !== undefined ? { altText: op.altText } : {}),
          ...(op.fit !== undefined ? { fit: op.fit } : {}),
          ...(op.opacity !== undefined ? { opacity: op.opacity } : {}),
          ...(op.rotate !== undefined ? { rotate: op.rotate } : {}),
        };
        objectIndex.set(op.imageId, objects.length);
        objects.push(image);
        createdObjectIds.push(op.imageId);
        break;
      }
      case 'insertText': {
        const target = findText(op.objectId, 'insertText');
        const idx = objectIndex.get(op.objectId);
        if (idx === undefined) break;
        replaceObject(idx, { ...target, text: op.text });
        break;
      }
      case 'updateTextStyle': {
        const target = findText(op.objectId, 'updateTextStyle');
        const idx = objectIndex.get(op.objectId);
        if (idx === undefined) break;
        const style = applyFontSubstitution(op.style, subs, warn, warned);
        const span = { start: op.range.start, end: op.range.end, style };
        replaceObject(idx, { ...target, textSpans: [...target.textSpans, span] });
        break;
      }
      case 'updateParagraphStyle': {
        const target = findText(op.objectId, 'updateParagraphStyle');
        const idx = objectIndex.get(op.objectId);
        if (idx === undefined) break;
        replaceObject(idx, {
          ...target,
          paragraphStyle: { ...(target.paragraphStyle ?? {}), ...op.style },
        });
        break;
      }
      case 'updateShapeProperties': {
        const idx = objectIndex.get(op.objectId);
        if (idx === undefined) {
          throw new Error(
            `translateOpsToPptx: updateShapeProperties targets unknown object "${op.objectId}".`,
          );
        }
        const obj = objects[idx];
        if (!obj) break;
        replaceObject(idx, mergeShapeProperties(obj, op.properties));
        break;
      }
    }
  }

  return { slides, objects, createdObjectIds };
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert EMU rect to inches (pptxgenjs's native unit). */
const emuRectToInches = (rect: EmuRect): PptxPosition => ({
  x: rect.x / EMU_PER_INCH,
  y: rect.y / EMU_PER_INCH,
  w: rect.w / EMU_PER_INCH,
  h: rect.h / EMU_PER_INCH,
});

const shapeKindToPptx = (kind: 'RECTANGLE' | 'ELLIPSE' | 'LINE'): 'rect' | 'ellipse' | 'line' => {
  switch (kind) {
    case 'RECTANGLE':
      return 'rect';
    case 'ELLIPSE':
      return 'ellipse';
    case 'LINE':
      return 'line';
  }
};

/**
 * Strip the leading `#` from a hex color and return uppercase. pptxgenjs
 * uses bare hex (e.g., `'FF5500'`).
 */
export const hexToPptxColor = (hex: HexColor): string => {
  const stripped = hex.startsWith('#') ? hex.slice(1) : hex;
  return stripped.toUpperCase();
};

const mergeShapeProperties = (obj: PptxObject, props: ShapeProperties): PptxObject => {
  if (obj.kind === 'text') {
    return {
      ...obj,
      ...(props.fillColor !== undefined ? { fill: hexToPptxColor(props.fillColor) } : {}),
    };
  }
  if (obj.kind === 'rectangle') {
    const next: PptxRectangle = { ...obj };
    if (props.fillColor !== undefined)
      (next as { fill?: string }).fill = hexToPptxColor(props.fillColor);
    if (props.outlineColor !== undefined)
      (next as { outlineColor?: string }).outlineColor = hexToPptxColor(props.outlineColor);
    if (props.outlineWeight !== undefined)
      (next as { outlineWeight?: number }).outlineWeight = props.outlineWeight;
    return next;
  }
  // image — no shape properties apply
  return obj;
};

const applyFontSubstitution = (
  style: TextStyle,
  subs: Readonly<Record<string, string>>,
  warn: (font: string) => void,
  warned: Set<string>,
): TextStyle => {
  if (style.fontFamily === undefined) return style;
  const sub = subs[style.fontFamily];
  if (sub !== undefined) {
    if (sub === style.fontFamily) return style;
    return { ...style, fontFamily: sub };
  }
  // Not in substitution table — emit warning once per font, then pass through.
  if (!warned.has(style.fontFamily)) {
    warned.add(style.fontFamily);
    warn(style.fontFamily);
  }
  return style;
};

const noopWarn = (_font: string): void => {};
