/**
 * Position, spacing, and color tokens for the primitives layer.
 *
 * Color tokens are mirrored here as a literal `as const` object so
 * `keyof typeof colorTokens` produces a literal-string union for type
 * safety. `tokens-extra.test.ts` asserts these stay in sync with the
 * generated `tokens.ts`.
 */

import type { HexColor, Pt } from 'react-pptx';

/** A rectangle on the slide canvas, in pt. */
export interface Rect {
  readonly x: Pt;
  readonly y: Pt;
  readonly w: Pt;
  readonly h: Pt;
}

// ---------------------------------------------------------------------------
// Position tokens — derived from the 6 PPTX-extracted draft layouts.
// Coordinates are in pt on the 960×540 canvas.
// ---------------------------------------------------------------------------

/**
 * Named slide-canvas rectangles. The LLM-facing tool surface reaches these
 * via `pos="title-default"` etc.; misspellings fail to typecheck.
 *
 * Names follow the pattern `<role>-<modifier>?`. New entries:
 *   - `-default` if the rect is the most common variant for that role.
 *   - `<role>-content-<n>col` for grid-bounding rectangles, parameterised
 *     by column count rather than slide type.
 *   - `full-bleed` for the entire canvas.
 */
export const positionTokens = {
  /** Entire canvas (960×540). For full-bleed background fills. */
  'full-bleed': { x: 0, y: 0, w: 960, h: 540 },

  /** Title bar — top-left, full width minus right margin. Used by TitleAndBody, TitleAndGrid, OneColumn. */
  'title-default': { x: 24, y: 46.72, w: 894.55, h: 60.13 },

  /** Cover-style title — taller, narrower box for the deck title. */
  'title-cover': { x: 24, y: 50.45, w: 715.43, h: 160 },

  /** Eyebrow — small upper-left subtitle/category label. */
  'eyebrow-default': { x: 24, y: 24, w: 445.98, h: 21.86 },

  /** Footer — small lower-right metadata text (page number, copyright). */
  'footer-default': { x: 780.19, y: 503.09, w: 155.81, h: 12.91 },

  /** Subtitle for the cover slide (below the title). */
  'subtitle-cover': { x: 64, y: 223.88, w: 445.2, h: 83.21 },

  /** Body for TitleAndBody — left column. */
  'body-default': { x: 57.6, y: 171.31, w: 388.44, h: 310.36 },

  /** Body subtitle for TitleAndBody — eyebrow above the body. */
  'body-subtitle-default': { x: 57.6, y: 149.45, w: 445.98, h: 21.86 },

  /** OneColumn body — narrower middle-left column. */
  'body-one-column': { x: 107.12, y: 155.31, w: 330.55, h: 27.06 },

  /** OneColumn body-subtitle — eyebrow above the OneColumn body. */
  'body-one-column-subtitle': { x: 107.12, y: 133.45, w: 330.55, h: 21.86 },

  /** Slide-number for the closing/blank slide. */
  'slide-number-default': { x: 889.5, y: 489.58, w: 57.61, h: 16.16 },

  /** Logo (white wordmark) — bottom-left chrome. */
  'logo-default': { x: 24, y: 488.93, w: 33.6, h: 27.07 },

  /** Logo-lockup (white wordmark, wider) — bottom-left for cover/title slides. */
  'logo-lockup-default': { x: 24, y: 491.19, w: 115.2, h: 28.36 },

  // -------------------------------------------------------------------------
  // Grid bounding rectangles — derived from TITLE_AND_TWO_COLUMNS variants.
  // Each `content-<n>col-<rows>row` is the bounding rect for a grid that
  // matches the corresponding designer variant. The Grid primitive takes
  // these as its `pos` and divides space deterministically.
  //
  // Bounds derived from extracted positions (TitleAndTwoColumns):
  //   x=57.6 (leftmost cell start), y=149.45 (eyebrow row top of first row)
  //   x=626.37 + 276.03 = 902.4 (rightmost cell end), y=283.22 + 133.77 = 416.99
  // Total bounding rect: { x: 57.6, y: 149.45, w: 844.8, h: 267.54 }
  // -------------------------------------------------------------------------

  /** Three-column grid bounding rect — 3×2 cells per the reference template. */
  'content-grid-3col': { x: 57.6, y: 149.45, w: 844.8, h: 267.54 },

  /** Two-column grid bounding rect — same y/h as 3col, narrower x. */
  'content-grid-2col': { x: 57.6, y: 149.45, w: 844.8, h: 267.54 },

  /** Single column body area — same as body-default. */
  'content-area-default': { x: 57.6, y: 145, w: 844, h: 350 },
} as const satisfies Readonly<Record<string, Rect>>;

// ---------------------------------------------------------------------------
// Spacing tokens — semantic gap names, in pt.
//
// Distinct from the generated `spacing` token catalog (which is the brand's
// CSS spacing scale). These are slide-canvas gap semantics: the names express
// intent ("small gap between grid cells"), not pixel ladder positions.
// ---------------------------------------------------------------------------

export const spacingTokens = {
  /** No gap. */
  none: 0,
  /** Extra small (4pt) — tight pairs. */
  xs: 4,
  /** Small (8pt) — between grid cells in the reference template. */
  sm: 8,
  /** Medium (16pt) — between unrelated content blocks. */
  md: 16,
  /** Large (24pt) — section gaps. */
  lg: 24,
  /** Extra large (40pt) — slide-level breathing room. */
  xl: 40,
} as const satisfies Readonly<Record<string, Pt>>;

// ---------------------------------------------------------------------------
// Color tokens — parallel `as const` map for type derivation. (Option A.)
//
// The generated `tokens.ts` exports primitive and semantic color records as
// `Record<string, HexColor>`. We mirror those keys here as a literal object
// so `keyof typeof colorTokens` produces a literal-string union — the brand
// lock at the type level.
//
// At runtime this object is the source of truth for `<TokenText color="...">`
// and `<TokenBox bg="...">` lookups; the values must stay in sync with
// `tokens.ts`. `tokens-extra.test.ts` asserts every key in
// `colorTokens` exists in `primitiveColorByName` (or `semanticColorByName`)
// with the same hex value, so a brand refresh that drops a color fails fast.
// ---------------------------------------------------------------------------

export const colorTokens = {
  // Primitive colors (mirror of tokens.ts:primitiveColors)
  black: '#0b0b0b',
  white: '#ffffff',
  brand: '#ff5500',
  'gray-100': '#ededed',
  'gray-200': '#d6d6d6',
  'gray-300': '#b9b9b9',
  'gray-500': '#797979',
  'gray-700': '#4a4a4a',
  'gray-800': '#353535',
  'gray-900': '#212121',
  'blue-100': '#afe3ff',
  'blue-300': '#55beff',
  'blue-500': '#027fff',
  'blue-700': '#0052ef',
  'green-500': '#3fea00',
  'magenta-500': '#f84eff',
  'yellow-500': '#ffff00',
} as const satisfies Readonly<Record<string, HexColor>>;

// ---------------------------------------------------------------------------
// Typography tokens — names parallel to tokens.ts `typography` array.
//
// Used for the `<TokenText size="...">` prop type. Values are the canonical
// `text-*` token names from the upstream Sanity DS; the actual font-size and
// style data lives in `typographyByName` from `@sanity-labs/slides/tokens`.
//
// We don't re-export the full token shape here — only the *name* surface —
// because the consumer (`<TokenText>`) reaches the runtime data via
// `typographyByName[size]`.
// ---------------------------------------------------------------------------

export const typographyTokens = {
  'text-page-heading-xl': 'text-page-heading-xl',
  'text-page-heading-lg': 'text-page-heading-lg',
  'text-page-heading-md': 'text-page-heading-md',
  'text-page-heading-sm': 'text-page-heading-sm',
  'text-component-heading-lg': 'text-component-heading-lg',
  'text-component-heading-md': 'text-component-heading-md',
  'text-component-heading-sm': 'text-component-heading-sm',
  'text-body-xl': 'text-body-xl',
  'text-body-lg': 'text-body-lg',
  'text-body-md': 'text-body-md',
  'text-body-sm': 'text-body-sm',
  'text-body-xs': 'text-body-xs',
  'text-label-lg': 'text-label-lg',
  'text-label-md': 'text-label-md',
  'text-label-sm': 'text-label-sm',
  'text-detail-md': 'text-detail-md',
  'text-detail-sm': 'text-detail-sm',
  'text-quote-lg': 'text-quote-lg',
  'text-quote-md': 'text-quote-md',
  'text-quote-sm': 'text-quote-sm',
  'text-code-lg': 'text-code-lg',
  'text-code-md': 'text-code-md',
  'text-code-sm': 'text-code-sm',
} as const satisfies Readonly<Record<string, string>>;

// ---------------------------------------------------------------------------
// Frozen Map lookups for hot-path reads.
// ---------------------------------------------------------------------------

/** Frozen position lookup. `POSITION_MAP.get(token)!` is non-null by type. */
export const POSITION_MAP: ReadonlyMap<keyof typeof positionTokens, Rect> = Object.freeze(
  new Map(Object.entries(positionTokens) as ReadonlyArray<[keyof typeof positionTokens, Rect]>),
);

/** Frozen spacing lookup. */
export const SPACING_MAP: ReadonlyMap<keyof typeof spacingTokens, Pt> = Object.freeze(
  new Map(Object.entries(spacingTokens) as ReadonlyArray<[keyof typeof spacingTokens, Pt]>),
);
