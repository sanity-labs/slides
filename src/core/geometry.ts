/**
 * Geometry primitives for slide layout.
 *
 * Two unit systems matter:
 * - **Points (pt)** — the *authoring* unit. Designers and component code
 *   think in pt. 72 pt = 1 inch. Most slide measurements are integers at
 *   human-relevant scales.
 * - **English Metric Units (EMU)** — the Office Open XML / PPTX coordinate
 *   unit. 914,400 EMU = 1 inch. Effectively never appears outside the
 *   runtime boundary.
 *
 * The conversion happens at *exactly one* point in the system: the boundary
 * between the reconciler and the runtime. Everything above is pt; everything
 * below is EMU.
 *
 * Font sizes are an exception: backends consume font size in pt directly
 * (PPTX/Office Open XML and Google Slides both expose pt). `ptToEmu` should
 * never be called on a font size.
 */

/** Authoring unit — what designers and component code use. */
export type Pt = number;

/** Office Open XML coordinate unit — what PPTX shape positions use. */
export type Emu = number;

/** EMU per inch (Office Open XML convention). */
export const EMU_PER_INCH = 914_400;

/** EMU per point. `914400 / 72 = 12700`. */
export const EMU_PER_POINT = 12_700;

/** Points per inch (typographic standard). */
export const PT_PER_INCH = 72;

/** Convert authoring points to API EMU. Rounds to integer EMU. */
export const ptToEmu = (pt: Pt): Emu => Math.round(pt * EMU_PER_POINT);

/** Convert inches to API EMU. Rounds to integer EMU. */
export const inToEmu = (inches: number): Emu => Math.round(inches * EMU_PER_INCH);

/** Convert points to inches. */
export const ptToIn = (pt: Pt): number => pt / PT_PER_INCH;

/** Convert inches to points. */
export const inToPt = (inches: number): Pt => inches * PT_PER_INCH;

/** A 2D point on the slide canvas. Origin top-left. */
export interface Point {
  x: Pt;
  y: Pt;
}

/** A 2D size on the slide canvas. */
export interface Size {
  w: Pt;
  h: Pt;
}

/** A canvas-aligned rectangle. */
export interface Rect extends Point, Size {}

/**
 * A canvas size + its precomputed EMU dimensions.
 *
 * Constructed once per supported aspect ratio. Reconciler reads `emuW`/`emuH`
 * when emitting page-creation ops.
 */
export interface Canvas {
  /** Canvas width in points. */
  readonly w: Pt;
  /** Canvas height in points. */
  readonly h: Pt;
  /** Canvas width in EMU (precomputed). */
  readonly emuW: Emu;
  /** Canvas height in EMU (precomputed). */
  readonly emuH: Emu;
}

const makeCanvas = (w: Pt, h: Pt): Canvas => ({
  w,
  h,
  emuW: ptToEmu(w),
  emuH: ptToEmu(h),
});

/** 16:9 widescreen — the standard default. 13.333" × 7.5" → 960pt × 540pt. */
export const CANVAS_16_9: Canvas = makeCanvas(960, 540);

/** 4:3 classic — 10" × 7.5" → 720pt × 540pt. */
export const CANVAS_4_3: Canvas = makeCanvas(720, 540);
