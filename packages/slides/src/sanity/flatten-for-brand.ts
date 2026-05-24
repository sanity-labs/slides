/**
 * Adapter from `BrandTokens` (the brand team's nested mental model) to the
 * `Template` interface's flat string-keyed slots (the substrate's contract).
 *
 * The two shapes serve different audiences:
 *   - **Template authors and components import the nested shape** — `tokens.colors.primitiveByName['brand']`,
 *     `tokens.typography[i].fontSizePx`. This is what the `@sanity/sanity-id`
 *     team thinks in.
 *   - **The substrate's reconciler resolves flat dot-keyed lookups** — `Template.colors["primitive.brand"]`,
 *     `Template.typography["body-md"]`. This is what `<Color token="...">`
 *     uses internally.
 *
 * Keeping them separate keeps the extractor pure (no substrate coupling) and
 * makes the `Template` shape an integration concern — exactly one module owns
 * the bridge.
 *
 * ### Naming convention (per @slidesman's call)
 *
 * Flat keys are dot-separated, mirroring the nested path:
 *   - Primitive colors:     `"primitive.<name>"`            (e.g. `"primitive.brand"`)
 *   - Semantic colors:      `"semantic.<name>.light|dark"`  (e.g. `"semantic.fg-base.light"`)
 *   - Typography styles:    `"<name>"`                      (e.g. `"text-body-md"`)
 *   - Spacing tokens:       `"<name>"`                      (e.g. `"spacing-16"`)
 *
 * Semantic colors expand to two flat keys (one per theme) because
 * `Template.colors` is `Record<string, HexColor>`, not nested by theme. Light
 * is the default for components that don't specify; both are addressable.
 *
 * ### Unit conversion
 *
 * Two ratios are at play, both load-bearing:
 *
 *  - **Spatial: `pt = px * 0.7`** — slides are viewed from further away than
 *    websites, so spatial values compress (per the canvas-spec's locked
 *    web→slide ratio). Spacing scale is spatial.
 *
 *  - **Typography: `pt = px`** — type uses the px number directly as pt at
 *    the slide canvas. The 1.25× px→pt research finding maps to "use the px
 *    number" because the apparent size at slide viewing distance is
 *    similar to the apparent size at web viewing distance. The Slides API
 *    accepts font sizes in pt with `unit: "PT"`, so no further conversion.
 *
 * Both choices documented at the conversion sites; revisit only with a
 * canvas-spec change.
 */

import type { HexColor, Pt, TypographyToken } from '../core/index.js';
import type {
  BrandTokens,
  PrimitiveColor,
  SemanticColor,
  SpacingToken,
  TypographyStyle,
} from './tokens/types.js';

/** The three slots `Template` requires populated from extracted tokens. */
export interface FlatBrandSlots {
  readonly colors: Readonly<Record<string, HexColor>>;
  readonly typography: Readonly<Record<string, TypographyToken>>;
  readonly spacing: Readonly<Record<string, Pt>>;
}

// Hoisted at module level — engineering-standards.md.
const HEX_PATTERN = /^#[0-9a-f]{6}$/i;
const LINE_HEIGHT_MULTIPLIER = /^\d+(?:\.\d+)?$/;
const EM_LETTER_SPACING = /^(-?\d+(?:\.\d+)?)em$/;

/** Type guard for the `HexColor` template-literal type. */
const isHex = (s: string): s is HexColor => HEX_PATTERN.test(s);

/**
 * Convert a hex string from the extractor (already lowercased, validated as
 * 6-digit) to the `HexColor` template literal type. The extractor guarantees
 * the format; this is a trust-boundary assertion.
 */
const asHex = (s: string, context: string): HexColor => {
  if (!isHex(s)) {
    throw new Error(`flatten-for-brand: invalid hex "${s}" while flattening ${context}`);
  }
  return s;
};

/**
 * Map a typography style name to its semantic font role.
 *
 * `Template.typography[].fontFamily` is `'display' | 'body' | 'mono'` — the
 * resolver dereferences it against `Template.fonts` at runtime. We infer the
 * role from the style's name prefix:
 *
 *   text-page-heading-* / text-component-heading-* → display
 *   text-code-* / text-label-* / text-detail-*     → mono
 *   everything else (body / quote / inline / trim) → body
 *
 * `text-label-*` and `text-detail-*` route to `mono` because the underlying
 * tokens declare `font-family: var(--font-mono)` (IBM Plex Mono).
 * `<SectionDivider/>` eyebrows and `<Cover/>` mono captions both want the
 * mono role; a prior rule that routed `-detail-*` to body was a bug.
 *
 * If a style name doesn't match a recognized prefix, it falls back to body.
 * That's a deliberately forgiving default — adding a new typography category
 * shouldn't break the build, and any miscategorization will be visible in
 * generated decks.
 */
export const inferFontRole = (name: string): TypographyToken['fontFamily'] => {
  if (name.startsWith('text-page-heading-') || name.startsWith('text-component-heading-')) {
    return 'display';
  }
  if (
    name.startsWith('text-code-') ||
    name.startsWith('text-label-') ||
    name.startsWith('text-detail-')
  ) {
    return 'mono';
  }
  return 'body';
};

/**
 * Convert a px value to slide pt using the *spatial* ratio.
 *
 * 1px = 0.7pt at the slide canvas, per the locked web→slide compression
 * ratio. Used for spacing tokens.
 */
const spatialPxToPt = (px: number): Pt => px * 0.7;

/**
 * Convert a px value to slide pt using the *typography* ratio.
 *
 * Type sizes pass through 1:1 — the px number from the brand's CSS becomes
 * the pt size on the slide. The Slides API takes font size in pt directly.
 *
 * The canvas spec's default is `slide_pt ≈ web_px × 1.25` for projection-
 * distance compensation, with an explicit escape hatch (`canvas-spec.md` L222)
 * for brands with strong type scales. Sanity has one, so we've taken the
 * escape hatch — but this needs empirical validation once the first Cover
 * slide renders. Single-line fix here if the ratio needs to change; the CI
 * drift gate surfaces any future adjustment as a reviewable `tokens.ts` diff.
 *
 * TODO(#9): validate against projected Cover slide with @rosti before lockdown.
 */
const typographyPxToPt = (px: number): Pt => px;

const flattenColors = (
  primitives: ReadonlyArray<PrimitiveColor>,
  semantics: ReadonlyArray<SemanticColor>,
): Readonly<Record<string, HexColor>> => {
  const out: Record<string, HexColor> = {};
  for (const p of primitives) {
    out[`primitive.${p.name}`] = asHex(p.hex, `primitive.${p.name}`);
  }
  for (const s of semantics) {
    out[`semantic.${s.name}.light`] = asHex(s.light, `semantic.${s.name}.light`);
    out[`semantic.${s.name}.dark`] = asHex(s.dark, `semantic.${s.name}.dark`);
  }
  return Object.freeze(out);
};

const flattenTypography = (
  styles: ReadonlyArray<TypographyStyle>,
): Readonly<Record<string, TypographyToken>> => {
  const out: Record<string, TypographyToken> = {};
  for (const s of styles) {
    // Skip styles without a numeric size (decorative-only utilities like
    // `text-trim`, `text-inline-link`). They're not addressable as
    // `<Text token="...">`.
    if (s.fontSizePx === null) continue;

    const token: Mutable<TypographyToken> = {
      fontFamily: inferFontRole(s.name),
      fontSize: typographyPxToPt(s.fontSizePx),
      // `lineHeight` in `Template.typography` is a multiplier; the extracted
      // value is a string that may be a multiplier ("1.4") or absolute
      // ("16px" — unused in `@sanity/sanity-id` but possible). Default to 1.5
      // when we can't parse a number.
      lineHeight: parseLineHeightMultiplier(s.lineHeight) ?? 1.5,
    };

    if (s.fontWeight !== undefined) token.fontWeight = s.fontWeight;
    if (s.letterSpacing !== undefined) {
      const ls = parseEmLetterSpacing(s.letterSpacing);
      if (ls !== null) token.letterSpacing = ls;
    }

    out[s.name] = token;
  }
  return Object.freeze(out);
};

const flattenSpacing = (tokens: ReadonlyArray<SpacingToken>): Readonly<Record<string, Pt>> => {
  const out: Record<string, Pt> = {};
  for (const t of tokens) {
    if (t.px === null) continue;
    out[t.name] = spatialPxToPt(t.px);
  }
  return Object.freeze(out);
};

const parseLineHeightMultiplier = (raw: string | undefined): number | null => {
  if (raw === undefined) return null;
  const trimmed = raw.trim();
  if (LINE_HEIGHT_MULTIPLIER.test(trimmed)) return Number.parseFloat(trimmed);
  return null;
};

const parseEmLetterSpacing = (raw: string): number | null => {
  const match = EM_LETTER_SPACING.exec(raw.trim());
  if (!match) return null;
  const n = match[1];
  return n !== undefined ? Number.parseFloat(n) : null;
};

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/**
 * Project a `BrandTokens` record into the three flat slots `Template` needs.
 *
 * @example
 *   import { tokens } from './tokens.js';
 *   import { flattenForBrand } from './flatten-for-brand.js';
 *
 *   export const sanity: Template = {
 *     name: 'sanity',
 *     canvas: CANVAS_16_9,
 *     fonts: SANITY_FONT_STACK,
 *     ...flattenForBrand(tokens),
 *     components: {},
 *   };
 */
export const flattenForBrand = (tokens: BrandTokens): FlatBrandSlots => ({
  colors: flattenColors(tokens.primitiveColors, tokens.semanticColors),
  typography: flattenTypography(tokens.typography),
  spacing: flattenSpacing(tokens.spacing),
});
