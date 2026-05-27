/**
 * The seam between the reconciler and the slide runtime backend.
 *
 * Production wires `PptxSlidesRuntime` into the reconciler. Tests wire
 * `FakeSlidesRuntime` which records every operation and builds an in-memory
 * deck model.
 *
 * See `docs/testing-strategy.md` for the rationale.
 */

import type { Emu } from './geometry.js';
import type { GenerationManifest } from './manifest.js';

/**
 * A typed Slides API operation the reconciler emits.
 *
 * This is intentionally NOT a 1:1 mapping of any specific slide API — it's
 * the *intent* the reconciler emits, with EMU and IDs already resolved. The
 * runtime adapter turns these into backend-specific operations.
 *
 * Keeping ops at this layer (vs raw API requests) means:
 * 1. Goldens read clearly. `{ type: "createShape", ... }` beats a 50-line nested object.
 * 2. The API can evolve underneath without churning every test snapshot.
 * 3. Template-agnostic; nothing here is Sanity-specific.
 */
export type SlideOp =
  | { type: 'createSlide'; slideId: string; insertAt?: number }
  | { type: 'createShape'; slideId: string; shapeId: string; shape: ShapeKind; rect: EmuRect }
  | { type: 'insertText'; objectId: string; text: string }
  | { type: 'updateTextStyle'; objectId: string; range: TextRange; style: TextStyle }
  | { type: 'updateParagraphStyle'; objectId: string; range: TextRange; style: ParagraphStyle }
  | {
      type: 'createImage';
      slideId: string;
      imageId: string;
      url: string;
      rect: EmuRect;
      altText?: string;
      /**
       * How the image fits inside the rect when its intrinsic aspect ratio
       * doesn't match the rect's. Mirrors CSS `object-fit`.
       *
       *   - `'contain'`: scale to fit, letterboxed if needed.
       *   - `'cover'`: scale to fill, cropped if needed.
       *   - `'fill'` (default for back-compat): stretch to the rect.
       *
       * Maps to pptxgenjs's `sizing.type` in the PPTX runtime, and to CSS
       * `object-fit` in the dev viewer. `'contain'` and `'cover'` only produce
       * correct PPTX output when {@link intrinsicWidth} / {@link intrinsicHeight}
       * are also set — pptxgenjs uses them to compute the aspect-correct crop.
       * Without them, the runtime falls back to plain stretch.
       */
      fit?: 'contain' | 'cover' | 'fill';
      /**
       * Intrinsic pixel width of the underlying image. Used by the PPTX
       * runtime to compute aspect-correct sizing for `fit: 'contain'` and
       * `fit: 'cover'`. Has no effect in the dev viewer (CSS `object-fit`
       * handles aspect correction directly from the browser-loaded image).
       */
      intrinsicWidth?: number;
      /** Intrinsic pixel height of the underlying image. See {@link intrinsicWidth}. */
      intrinsicHeight?: number;
      /**
       * Opacity, 0–1. Maps to pptxgenjs's `transparency` (inverted: pptxgenjs
       * uses 0–100 where 100 is fully transparent) and to CSS `opacity` in
       * the dev viewer.
       */
      opacity?: number;
      /**
       * Rotation in degrees clockwise. Maps to pptxgenjs's `rotate` and to
       * a CSS `transform: rotate(...)` in the dev viewer.
       */
      rotate?: number;
    }
  | { type: 'updateShapeProperties'; objectId: string; properties: ShapeProperties };

/** A rectangle in EMU — the reconciler converts pt → EMU before emitting. */
export interface EmuRect {
  x: Emu;
  y: Emu;
  w: Emu;
  h: Emu;
}

/**
 * Shape kinds the reconciler emits. Names mirror the Office Open XML /
 * Google Slides API enum so translators on either side can pass through
 * without a lookup table.
 */
export type ShapeKind = 'TEXT_BOX' | 'RECTANGLE' | 'ELLIPSE' | 'LINE';

/** Inclusive-exclusive index range over a string of text. */
export interface TextRange {
  start: number;
  end: number;
}

/**
 * A font role keyword. Resolved against `Template.fonts[role][0]` at the
 * reconciler boundary; the role keywords (`'display'` / `'body'` / `'mono'`)
 * are reserved — a brand cannot have a literal font family named "display."
 *
 * See `reconciler.ts` for resolution semantics; the role keywords mirror
 * `FontStack` keys so adding a role to one ripples to the other.
 */
export type FontRole = 'display' | 'body' | 'mono';

/** Text-style properties supported at the reconciler boundary. */
export interface TextStyle {
  /**
   * Font family. Either:
   * - A role keyword (`'display'` / `'body'` / `'mono'`), resolved against
   *   `Template.fonts[role][0]` at the reconciler boundary before the op is
   *   emitted. This is what brand components and `<Text/>` consumers
   *   should pass — it keeps the brand's font choice load-bearing.
   * - A literal family name (e.g., `'Geist'`, `'Inter'`), passed through
   *   verbatim. Template authors with a specific family in mind use this.
   *
   * The role keywords are reserved — they shadow any literal family of the
   * same name. If a future brand needed a literal `'display'` family, the
   * shape would need to migrate to a discriminated union.
   *
   * Why a string union (vs. discriminated): the role keywords are vanishingly
   * unlikely to ever be a real family; a discriminated union would force every
   * literal-family consumer to write `{ kind: 'family', family: ... }` for no
   * win. `flatten-for-brand.ts:inferFontRole` returns role strings directly,
   * which compose cleanly into this shape.
   */
  fontFamily?: FontRole | string;
  fontSize?: number; // pt — passes straight through, NOT converted to EMU
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  foregroundColor?: HexColor;
  backgroundColor?: HexColor;
}

/** Paragraph-style properties supported at the reconciler boundary. */
export interface ParagraphStyle {
  alignment?: 'START' | 'CENTER' | 'END' | 'JUSTIFIED';
  lineSpacing?: number; // multiplier (e.g., 1.2)
  spaceAbove?: number; // pt
  spaceBelow?: number; // pt
}

/** Shape-level visual properties. */
export interface ShapeProperties {
  fillColor?: HexColor;
  outlineColor?: HexColor;
  outlineWeight?: number; // pt
}

/** A 24-bit hex color, e.g., "#FF5500". The reconciler converts to RGB at emit. */
export type HexColor = `#${string}`;

/**
 * The runtime contract every slide backend satisfies. This is the seam that
 * makes layered testing work — see `docs/testing-strategy.md`.
 */
export interface SlidesRuntime {
  /** Apply a sequence of slide operations to a deck. */
  applyOps(deckId: string, ops: readonly SlideOp[]): Promise<ApplyOpsResult>;

  /**
   * Create a new deck, optionally seeded from a template reference.
   *
   * `masterRef` is opaque to the substrate; runtimes that don't have a
   * master-template concept ignore it and initialize a blank deck.
   */
  createDeckFromMaster(masterRef: string, title: string): Promise<{ deckId: string }>;

  /** Write the deck to a file on disk. Returns the absolute path. */
  write(deckId: string): Promise<{ filePath: string }>;

  /** Attach a manifest to a deck (for later retrieval). */
  attachManifest(deckId: string, manifest: GenerationManifest): void;
}

/** What the runtime returns after applying a batch of ops. */
export interface ApplyOpsResult {
  /** IDs of objects created during this batch, keyed by the requested ID. */
  createdObjectIds: Readonly<Record<string, string>>;
  /** Revision token for optimistic-concurrency on the next call. */
  revisionId?: string;
}
