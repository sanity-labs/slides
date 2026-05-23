/**
 * Token shapes extracted from `@sanity/sanity-id`.
 *
 * The CSS source declares ~150 brand tokens across six categories. This module
 * defines the in-memory shapes those tokens take after parsing, before they're
 * either:
 *
 *  - emitted as a typed `tokens.ts` module (for consumers of `@sanity-labs/slides`), or
 *  - flattened into the substrate's `Template` shape (for the reconciler).
 *
 * The categories deliberately preserve the brand team's mental model. Primitive
 * vs. semantic colors are kept separate (semantics carry light/dark pairs);
 * textures use a discriminated union by pattern family because dots-* and
 * lines-* genuinely have different axes (Q-018). Typography styles bundle the
 * full set of font properties because that's how `@sanity/sanity-id` ships
 * them (`@utility text-*`).
 *
 * The flattening to `Template.colors`/`.typography`/`.spacing` happens elsewhere
 * (`flatten-for-brand.ts`) — this module stays brand-shape-pure.
 */

/** A primitive color from `:root` — atomic palette stop. */
export interface PrimitiveColor {
  /** kebab-case name as in CSS, e.g. `"gray-100"`, `"brand"`. */
  readonly name: string;
  /**
   * sRGB hex, always present. For colors that originate as P3 in CSS, this
   * is the gamut-mapped fallback (sourced from `colors.ts` when available;
   * see `derive-color.ts`).
   */
  readonly hex: string;
  /** Original P3 declaration if the CSS used `color(display-p3 ...)`. */
  readonly p3?: string;
}

/** A semantic color — light/dark pair resolved from `[data-theme]` blocks. */
export interface SemanticColor {
  /** kebab-case name, e.g. `"fg-base"`, `"bg-accent-blue-dim"`. */
  readonly name: string;
  /** Resolved hex for the light theme. */
  readonly light: string;
  /** Resolved hex for the dark theme. */
  readonly dark: string;
}

/** A spacing value declared in `@theme` or `:root`. */
export interface SpacingToken {
  /** kebab-case name, e.g. `"spacing-16"`, `"spacing-icon-md"`. */
  readonly name: string;
  /** The raw declared value (e.g. `"1rem"`, `"calc((25 / 16) * 1rem)"`). */
  readonly raw: string;
  /** Computed rem value if numeric, else null. */
  readonly rem: number | null;
  /** Computed px value at 16px base, else null. */
  readonly px: number | null;
}

/** A border-radius token. */
export interface RadiusToken {
  readonly name: string;
  readonly raw: string;
}

/**
 * A texture URL, structured by pattern family.
 *
 * Discriminated union by `pattern` because dots-* carries a `density` axis
 * that lines-* doesn't (Q-018). Encoding this as the type means impossible
 * states (a `lines-grid` with `density: "dense"`) are unrepresentable —
 * the same property `.strict()` gives us at the schema layer.
 */
export type TextureToken =
  | {
      readonly pattern: 'dots-grid' | 'dots-hex';
      readonly density: 'base' | 'dense' | 'spread';
      readonly size: 'small' | 'medium' | 'large';
      readonly theme: 'light' | 'dark';
      readonly url: string;
    }
  | {
      readonly pattern: 'lines-grid' | 'lines-horizontal';
      readonly size: 'small' | 'medium' | 'large';
      readonly theme: 'light' | 'dark';
      readonly url: string;
    };

/**
 * A typography style — bundled set of properties for a named text role.
 *
 * `@sanity/sanity-id` ships these as Tailwind v4 `@utility` rules whose
 * bodies declare font / size / weight / letter-spacing / line-height /
 * font-features. Some carry responsive variants (`@variant screen-md/lg`);
 * we record them but the canonical `fontSize*` is the *largest* size since
 * slides don't reflow.
 */
export interface TypographyStyle {
  /** kebab-case name as in CSS, e.g. `"text-page-heading-xl"`. */
  readonly name: string;
  /** Font family declaration, kept literal (e.g. `"var(--font-sans)"`). */
  readonly fontFamily?: string;
  /** Computed font size at the largest variant, in rem. */
  readonly fontSizeRem: number | null;
  /** Computed font size at the largest variant, in px. */
  readonly fontSizePx: number | null;
  /** Numeric font weight (100-900). */
  readonly fontWeight?: number;
  /** Letter-spacing as in source (e.g. `"-0.04em"`). */
  readonly letterSpacing?: string;
  /** Line-height as in source — multiplier or absolute. */
  readonly lineHeight?: string;
  /** Font-feature-settings literal. */
  readonly fontFeatureSettings?: string;
  /**
   * Responsive variants captured from `@variant screen-*` rules. Not used
   * by slides (no reflow) but kept for fidelity.
   */
  readonly variants?: Readonly<
    Record<string, { fontSizeRem: number | null; fontSizePx: number | null }>
  >;
}

/** The complete brand-token surface for the Sanity template. */
export interface BrandTokens {
  readonly primitiveColors: ReadonlyArray<PrimitiveColor>;
  readonly semanticColors: ReadonlyArray<SemanticColor>;
  readonly spacing: ReadonlyArray<SpacingToken>;
  readonly radii: ReadonlyArray<RadiusToken>;
  readonly textures: ReadonlyArray<TextureToken>;
  readonly typography: ReadonlyArray<TypographyStyle>;
}
