/**
 * `SlidesRuntime` that emits a .pptx file to disk via pptxgenjs.
 *
 * The brand visuals (colors, layout, typography sizes) are preserved
 * end-to-end. Fonts that aren't installed on the viewer's machine get
 * substituted via the brand-supplied substitution table (see "Font
 * substitution" below).
 *
 * # Known limitations
 *
 * - **Re-fill against an existing .pptx.** Not supported; the manifest is
 *   held in memory only.
 * - **Master templates.** PPTX has no master-ref concept here; the
 *   `masterRef` argument to `createDeckFromMaster` is recorded as the
 *   presentation's subject metadata and otherwise ignored.
 *
 * # Font substitution
 *
 * PPTX cannot embed fonts. Template-specific families (e.g., a brand's display
 * face) may not be installed on the viewer's machine. The runtime accepts a
 * `fontSubstitution` map keyed by the literal font name (as the reconciler
 * emits it after role resolution) → the family name to write into the
 * .pptx file. Anything not in the map passes through unchanged.
 *
 * The substrate ships an empty default. Brands provide their own table
 * (see `@sanity-labs/slides` for an example). Use `onUnknownFont` if you want
 * to surface diagnostics for unmapped families.
 *
 * # Manifest persistence
 *
 * Held in memory and accessible via `getManifest()`. Persistence into the
 * .pptx file itself (custom XML / hidden shape) is not implemented; re-fill
 * against a previously-generated .pptx is out of scope for this runtime.
 */

import { promises as fs, readFileSync } from 'node:fs';
import * as path from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import PptxGenJS from 'pptxgenjs';
import type { GenerationManifest } from './manifest.js';
import {
  hexToPptxColor,
  translateOpsToPptx,
  type PptxBatch,
  type PptxImage,
  type PptxObject,
  type PptxRectangle,
  type PptxText,
} from './op-translator-pptx.js';
import type {
  ApplyOpsResult,
  ParagraphStyle,
  SlideOp,
  SlidesRuntime,
  TextStyle,
} from './runtime.js';

/** Configuration for a `PptxSlidesRuntime` instance. */
export interface PptxSlidesRuntimeOptions {
  /** Output directory. Created if missing. Default: `process.cwd()`. */
  readonly outputDir?: string;
  /**
   * Substitution map: literal font name (as the reconciler emits it) → the
   * family name to write into the .pptx file. Default: `{}` (pass-through).
   * Templates inject their own table here.
   */
  readonly fontSubstitution?: Readonly<Record<string, string>>;
  /**
   * Optional hook called once per unknown font (a font not in the
   * substitution table). Default: no-op. Pass `console.warn` (or your
   * logger) to surface diagnostics.
   */
  readonly onUnknownFont?: ((fontFamily: string) => void) | null;
  /** Author metadata baked into the .pptx file. Default: `'react-pptx'`. */
  readonly author?: string;
  /** Company metadata. Default: undefined. */
  readonly company?: string;
}

/**
 * Default font substitution table for the substrate: empty.
 *
 * PPTX cannot embed fonts. Template packages ship their own substitution table
 * (see `@sanity-labs/slides` for an example) and pass it via
 * `PptxSlidesRuntimeOptions.fontSubstitution`. The substrate stays
 * brand-agnostic.
 */
export const DEFAULT_PPTX_FONT_SUBSTITUTION: Readonly<Record<string, string>> = Object.freeze({});

/** What the runtime tracks per deck. */
interface DeckEntry {
  readonly title: string;
  readonly pres: PptxGenJS;
  /**
   * Map of slide ID → pptxgenjs Slide object. Populated as
   * `createSlide` ops translate.
   */
  readonly slides: Map<string, PptxGenJS.Slide>;
  manifest?: GenerationManifest;
  revision: number;
}

/**
 * A `SlidesRuntime` that emits .pptx files via pptxgenjs.
 *
 * See module docstring for limitations and font-substitution behavior.
 */
export class PptxSlidesRuntime implements SlidesRuntime {
  private readonly outputDir: string;
  private readonly fontSubstitution: Readonly<Record<string, string>>;
  private readonly onUnknownFont: ((fontFamily: string) => void) | null;
  private readonly author: string;
  private readonly company: string | undefined;
  private readonly decks = new Map<string, DeckEntry>();
  private deckCounter = 0;

  constructor(options: PptxSlidesRuntimeOptions = {}) {
    this.outputDir = options.outputDir ?? process.cwd();
    this.fontSubstitution = options.fontSubstitution ?? DEFAULT_PPTX_FONT_SUBSTITUTION;
    this.onUnknownFont = options.onUnknownFont ?? null;
    this.author = options.author ?? 'react-pptx';
    this.company = options.company;
  }

  // -- SlidesRuntime --------------------------------------------------------

  async applyOps(deckId: string, ops: readonly SlideOp[]): Promise<ApplyOpsResult> {
    const deck = this.requireDeck(deckId);
    const batch = translateOpsToPptx(ops, {
      fontSubstitution: this.fontSubstitution,
      onUnknownFont: this.onUnknownFont,
    });
    applyBatchToPresentation(deck, batch);
    deck.revision += 1;
    const createdObjectIds: Record<string, string> = {};
    for (const id of batch.createdObjectIds) {
      createdObjectIds[id] = id;
    }
    return { createdObjectIds, revisionId: `pptx-rev-${deck.revision}` };
  }

  async createDeckFromMaster(masterRef: string, title: string): Promise<{ deckId: string }> {
    // PPTX has no master-ref concept; `masterRef` is informational only,
    // recorded for diagnostic purposes. We initialize a blank 16:9
    // presentation matching the substrate's default canvas.
    const pres = new PptxGenJS();
    pres.layout = 'LAYOUT_WIDE'; // 13.333" x 7.5" — matches CANVAS_16_9 (960×540 pt)
    pres.title = title;
    pres.author = this.author;
    if (this.company !== undefined) pres.company = this.company;
    // Tag the presentation so curious file inspectors know what produced it.
    pres.subject = `Generated by react-pptx (template: ${masterRef})`;

    this.deckCounter += 1;
    const deckId = `pptx-deck-${this.deckCounter}`;
    this.decks.set(deckId, {
      title,
      pres,
      slides: new Map(),
      revision: 0,
    });
    return { deckId };
  }

  // -- SlidesRuntime (continued) --------------------------------------------

  /**
   * Serialize the in-memory presentation for a deck to a .pptx file.
   *
   * Returns the absolute path to the generated file. The filename is
   * derived from the deck title (sanitized) with a `.pptx` extension.
   */
  async write(deckId: string): Promise<{ filePath: string }> {
    const deck = this.requireDeck(deckId);
    await fs.mkdir(this.outputDir, { recursive: true });
    const filename = sanitizeFilename(deck.title);
    const filePath = path.join(this.outputDir, `${filename}.pptx`);
    const buffer = (await deck.pres.write({ outputType: 'nodebuffer' })) as Buffer;
    await fs.writeFile(filePath, buffer);
    return { filePath };
  }

  async toBuffer(deckId: string): Promise<Buffer> {
    const deck = this.requireDeck(deckId);
    return (await deck.pres.write({ outputType: 'nodebuffer' })) as Buffer;
  }

  /** Attach a manifest to a deck (held in memory; not embedded into the .pptx file). */
  attachManifest(deckId: string, manifest: GenerationManifest): void {
    const deck = this.requireDeck(deckId);
    deck.manifest = manifest;
  }

  // -- PPTX-specific extras -------------------------------------------------

  /** Retrieve a deck's manifest (if attached). */
  getManifest(deckId: string): GenerationManifest | undefined {
    return this.decks.get(deckId)?.manifest;
  }

  /** List deck IDs the runtime is tracking. */
  listDeckIds(): readonly string[] {
    return [...this.decks.keys()];
  }

  private requireDeck(deckId: string): DeckEntry {
    const deck = this.decks.get(deckId);
    if (!deck) {
      throw new Error(
        `PptxSlidesRuntime: deck "${deckId}" does not exist. Create it via createDeckFromMaster() first.`,
      );
    }
    return deck;
  }
}

// ---------------------------------------------------------------------------
// Apply translated batch to a pptxgenjs Presentation.
// ---------------------------------------------------------------------------

/** Apply a translated batch to a pptxgenjs presentation. */
const applyBatchToPresentation = (deck: DeckEntry, batch: PptxBatch): void => {
  for (const slideSpec of batch.slides) {
    if (deck.slides.has(slideSpec.slideId)) {
      throw new Error(`PptxSlidesRuntime: slide "${slideSpec.slideId}" already exists.`);
    }
    const slide = deck.pres.addSlide();
    deck.slides.set(slideSpec.slideId, slide);
  }
  for (const obj of batch.objects) {
    const slide = deck.slides.get(obj.slideId);
    if (!slide) {
      throw new Error(
        `PptxSlidesRuntime: object "${obj.objectId}" references unknown slide "${obj.slideId}".`,
      );
    }
    emitObjectToSlide(slide, obj);
  }
};

const emitObjectToSlide = (slide: PptxGenJS.Slide, obj: PptxObject): void => {
  switch (obj.kind) {
    case 'text':
      emitText(slide, obj);
      return;
    case 'rectangle':
      emitRectangle(slide, obj);
      return;
    case 'image':
      emitImage(slide, obj);
      return;
  }
};

const emitText = (slide: PptxGenJS.Slide, obj: PptxText): void => {
  const positionOpts = positionToPptx(obj.position);
  // If the text is empty AND we have a fill, emit a sibling rectangle for
  // the background. pptxgenjs's `addText` with no text won't emit a fill
  // reliably across renderers; `addShape` does.
  if (obj.text.length === 0 && obj.fill !== undefined) {
    slide.addShape('rect', { ...positionOpts, fill: { color: obj.fill }, line: { type: 'none' } });
    return;
  }
  if (obj.text.length === 0 && obj.fill === undefined) {
    // Empty text box, no fill — nothing to render. Skip; mirrors the
    // FakeSlidesRuntime (which keeps the shape but the live deck has no
    // visible artifact).
    return;
  }

  const textProps = composeTextSegments(obj);
  const opts: PptxGenJS.TextPropsOptions = {
    ...positionOpts,
    ...(obj.fill !== undefined ? { fill: { color: obj.fill } } : {}),
    ...paragraphStyleToPptx(obj.paragraphStyle),
    // Default vertical alignment to `top` so text starts at the top of the
    // box.
    valign: paragraphValignFromStyle(obj.paragraphStyle) ?? 'top',
    // Margin 0 — the substrate emits exact rects; pptxgenjs's default text
    // box padding would offset the visible text.
    margin: 0,
    // `fit: 'shrink'` lets PowerPoint shrink overflowing text rather than
    // clipping.
    fit: 'shrink',
  };
  slide.addText(textProps, opts);
};

const emitRectangle = (slide: PptxGenJS.Slide, obj: PptxRectangle): void => {
  const opts: PptxGenJS.ShapeProps = {
    ...positionToPptx(obj.position),
    ...(obj.fill !== undefined ? { fill: { color: obj.fill } } : {}),
  };
  if (obj.outlineColor !== undefined || obj.outlineWeight !== undefined) {
    const line: PptxGenJS.ShapeLineProps = {};
    if (obj.outlineColor !== undefined) line.color = obj.outlineColor;
    if (obj.outlineWeight !== undefined) line.width = obj.outlineWeight;
    opts.line = line;
  } else {
    // Explicit `type: 'none'` so PowerPoint doesn't draw the default 1pt
    // outline (visually noticeable on full-bleed backgrounds).
    opts.line = { type: 'none' };
  }
  slide.addShape(obj.shape, opts);
};

const emitImage = (slide: PptxGenJS.Slide, obj: PptxImage): void => {
  const opts: PptxGenJS.ImageProps = {
    ...positionToPptx(obj.position),
    ...(obj.altText !== undefined ? { altText: obj.altText } : {}),
  };
  const source = imageSourceForPptx(obj.url);
  if (source.kind === 'data') {
    opts.data = source.value;
  } else {
    opts.path = source.value;
  }
  slide.addImage(opts);
};

type PptxImageSource =
  | { readonly kind: 'data'; readonly value: string }
  | { readonly kind: 'path'; readonly value: string };

const imageSourceForPptx = (url: string): PptxImageSource => {
  if (isSvgDataUri(url)) {
    return { kind: 'data', value: svgToPngDataUri(decodeSvgDataUri(url), 'data URI') };
  }
  if (isLocalSvgPath(url)) {
    const filePath = localSvgPath(url);
    return { kind: 'data', value: svgToPngDataUri(readFileSync(filePath, 'utf8'), filePath) };
  }
  if (url.startsWith('data:')) {
    return { kind: 'data', value: url };
  }
  return { kind: 'path', value: url };
};

const isSvgDataUri = (url: string): boolean => /^data:image\/svg\+xml[;,]/i.test(url);

const decodeSvgDataUri = (url: string): string => {
  const commaIndex = url.indexOf(',');
  if (commaIndex === -1) {
    throw new Error('PptxSlidesRuntime: invalid SVG data URI; missing comma separator.');
  }
  const meta = url.slice(0, commaIndex).toLowerCase();
  const payload = url.slice(commaIndex + 1);
  return meta.includes(';base64')
    ? Buffer.from(payload, 'base64').toString('utf8')
    : decodeURIComponent(payload);
};

const isLocalSvgPath = (url: string): boolean =>
  !/^https?:\/\//i.test(url) && !url.startsWith('data:') && /\.svg(?:$|[?#])/i.test(url);

const localSvgPath = (url: string): string => {
  if (url.startsWith('file://')) {
    return new URL(url).pathname;
  }
  const queryIndex = url.search(/[?#]/);
  return queryIndex === -1 ? url : url.slice(0, queryIndex);
};

const svgToPngDataUri = (svg: string, sourceLabel: string): string => {
  try {
    const png = new Resvg(svg).render().asPng();
    return `data:image/png;base64,${Buffer.from(png).toString('base64')}`;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `PptxSlidesRuntime: failed to rasterize SVG image (${sourceLabel}): ${message}`,
    );
  }
};

// ---------------------------------------------------------------------------
// Style adapters
// ---------------------------------------------------------------------------

const positionToPptx = (position: {
  x: number;
  y: number;
  w: number;
  h: number;
}): { x: number; y: number; w: number; h: number } => ({
  x: position.x,
  y: position.y,
  w: position.w,
  h: position.h,
});

/**
 * Compose the per-range text-style spans into a flat array of pptxgenjs
 * `TextProps` segments, applying spans in op order with last-write-wins
 * semantics on overlap.
 */
const composeTextSegments = (obj: PptxText): PptxGenJS.TextProps[] => {
  const len = obj.text.length;
  if (len === 0) return [];
  // Per-character resolved style.
  const styles: TextStyle[] = Array.from({ length: len }, () => ({}));
  for (const span of obj.textSpans) {
    const start = Math.max(0, Math.min(len, span.start));
    const end = Math.max(0, Math.min(len, span.end));
    for (let i = start; i < end; i++) {
      styles[i] = { ...styles[i], ...span.style };
    }
  }
  // Coalesce consecutive characters with identical resolved style.
  const segments: PptxGenJS.TextProps[] = [];
  let segStart = 0;
  while (segStart < len) {
    let segEnd = segStart + 1;
    while (segEnd < len && styleEquals(styles[segStart] ?? {}, styles[segEnd] ?? {})) {
      segEnd++;
    }
    segments.push({
      text: obj.text.slice(segStart, segEnd),
      options: textStyleToPptx(styles[segStart] ?? {}),
    });
    segStart = segEnd;
  }
  return segments;
};

const styleEquals = (a: TextStyle, b: TextStyle): boolean => {
  const keysA = Object.keys(a) as (keyof TextStyle)[];
  const keysB = Object.keys(b) as (keyof TextStyle)[];
  if (keysA.length !== keysB.length) return false;
  return keysA.every((k) => a[k] === b[k]);
};

const textStyleToPptx = (style: TextStyle): PptxGenJS.TextPropsOptions => {
  const opts: PptxGenJS.TextPropsOptions = {};
  if (style.fontFamily !== undefined) opts.fontFace = style.fontFamily;
  if (style.fontSize !== undefined) opts.fontSize = style.fontSize;
  if (style.bold !== undefined) opts.bold = style.bold;
  if (style.italic !== undefined) opts.italic = style.italic;
  if (style.underline !== undefined && style.underline) {
    opts.underline = { style: 'sng' };
  }
  if (style.foregroundColor !== undefined) opts.color = hexToPptxColor(style.foregroundColor);
  if (style.backgroundColor !== undefined) opts.highlight = hexToPptxColor(style.backgroundColor);
  return opts;
};

const paragraphStyleToPptx = (
  style: ParagraphStyle | undefined,
): Pick<
  PptxGenJS.TextPropsOptions,
  'align' | 'lineSpacingMultiple' | 'paraSpaceBefore' | 'paraSpaceAfter'
> => {
  if (!style) return {};
  const out: Pick<
    PptxGenJS.TextPropsOptions,
    'align' | 'lineSpacingMultiple' | 'paraSpaceBefore' | 'paraSpaceAfter'
  > = {};
  if (style.alignment !== undefined) {
    out.align = pptxAlign(style.alignment);
  }
  if (style.lineSpacing !== undefined) {
    // pptxgenjs's `lineSpacingMultiple` matches the substrate's
    // multiplier (1.0 = normal). 1:1.
    out.lineSpacingMultiple = style.lineSpacing;
  }
  if (style.spaceAbove !== undefined) out.paraSpaceBefore = style.spaceAbove;
  if (style.spaceBelow !== undefined) out.paraSpaceAfter = style.spaceBelow;
  return out;
};

const pptxAlign = (
  alignment: 'START' | 'CENTER' | 'END' | 'JUSTIFIED',
): 'left' | 'center' | 'right' | 'justify' => {
  switch (alignment) {
    case 'START':
      return 'left';
    case 'CENTER':
      return 'center';
    case 'END':
      return 'right';
    case 'JUSTIFIED':
      return 'justify';
  }
};

const paragraphValignFromStyle = (
  _style: ParagraphStyle | undefined,
): 'top' | 'middle' | 'bottom' | undefined => {
  // The substrate's `ParagraphStyle` doesn't carry vertical alignment;
  // returning undefined preserves pptxgenjs's default. Reserved for a
  // future v-align addition.
  return undefined;
};

const sanitizeFilename = (title: string): string => {
  // Replace anything non-alphanumeric / non-dash / non-underscore with `-`;
  // collapse runs; trim leading/trailing dashes. Falls back to "deck" if
  // the result would be empty.
  const cleaned = title
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return cleaned.length > 0 ? cleaned : 'deck';
};
