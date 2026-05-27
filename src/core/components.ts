/**
 * The minimal JSX primitive surface the reconciler walks.
 *
 * **This is intentionally a small, lower-case set.** High-level brand
 * components (`<Cover/>`, `<TwoColumn/>`, etc.) live in brand packages
 * (e.g., `@sanity-labs/slides`) and *compose* these primitives. The substrate
 * exports just enough to render an arbitrary slide tree.
 *
 * Why hand-rolled host elements rather than `<div>`-style intrinsic elements:
 * we want the reconciler to recognize these by *type identity*, not by string
 * tag names. Type identity removes a class of bugs ("did you mean 'box' or
 * 'Box'?") and gives the type-checker something concrete to enforce.
 *
 * These don't render to the DOM — they're inert markers the reconciler walks.
 * They return `null` so they're harmless if accidentally rendered through
 * react-dom (e.g., during Storybook prototyping).
 */

import type { ReactNode } from 'react';
import type { Rect } from './geometry.js';
import type { ArtifactRef, SlotId } from './manifest.js';
import type { HexColor, ParagraphStyle, TextStyle } from './runtime.js';
import type { YogaStyle } from './tailwind-resolver.js';

/**
 * A single slide in the deck.
 *
 * Every `<Slide>` becomes a `createSlide` op. Children are rendered into the
 * slide's coordinate space.
 *
 * Layout defaults to `flex flex-col` when neither `className` nor `style` is
 * set — children stack vertically across the canvas. Override with
 * `className="flex flex-row"` etc., or escape to absolute positioning by
 * giving every child a `rect` prop.
 */
export interface SlideProps {
  /** Children: `<Box>` and `<Image>` shapes laid out inside the slide. */
  children?: ReactNode;
  /**
   * Brand-locked Tailwind classes, resolved against the active template.
   * See `src/core/tailwind-resolver.ts` for the allowlist.
   */
  className?: string;
  /**
   * Inline layout style. Lower-level escape hatch for cases where the
   * Tailwind allowlist doesn't express what you need (custom flex basis,
   * direct width in pt). Inline `style` wins over `className` on collision.
   */
  style?: YogaStyle;
  /**
   * Per-slide variation passed to the template's `layout` component.
   *
   * Templates that declare a `layout` (e.g. a brand chrome wrapper) can
   * read these to customise individual slides — a Cover might pass
   * `{ tone: 'dark', lockup: true }` while content slides pass nothing.
   *
   * Ignored when the active template has no `layout` set, or when
   * `noLayout` is true.
   */
  layoutProps?: Record<string, unknown>;
  /**
   * Skip the template's `layout` wrapper for this slide.
   *
   * Use sparingly — for full-bleed photos, one-off graphic slides, or
   * cases where the template chrome would interfere with the content.
   * Most slides should let the layout wrap them so the deck reads as a
   * single, consistent visual system.
   */
  noLayout?: boolean;
}

/**
 * A discriminated union describing a `<Box>`'s background fill.
 *
 * Shaped as a tagged union — *not* a flat `fill?: HexColor` — so future fill
 * kinds (texture, image-as-background, gradient) can be added without
 * sprouting parallel optional props. The discriminator is load-bearing:
 * off-brand fills are inexpressible at the type level when a brand component
 * narrows what kinds it accepts.
 *
 * Today only `'solid'` is supported. Image fills (full-bleed photos) are
 * authored as `<Image>` siblings of `<Box>` rather than nested inside a
 * Box's fill.
 */
export type BoxFill = { kind: 'solid'; color: HexColor };

/**
 * A rectangular text box on the slide canvas.
 *
 * Becomes a `createShape` op with shape `TEXT_BOX` (the only shape this
 * primitive set produces; other shape kinds are reserved for the future).
 * Children are concatenated into a single text run with style spans.
 *
 * **Position is resolved one of three ways**, in priority order:
 *
 *   1. `rect={{x,y,w,h}}` — absolute coords, the original (pre-Yoga) API.
 *      Still supported as an escape hatch for hand-tuned layouts.
 *   2. `className="flex … p-… gap-… bg-…"` — brand-locked Tailwind classes
 *      resolved against the active template. The reconciler runs Yoga to
 *      compute the rect from the resulting flex layout.
 *   3. `style={{ flexDirection: …, gap: … }}` — raw Yoga style; same layout
 *      pipeline as className, lower-level. Overlay-able with className.
 *
 * Boxes nest freely under Yoga — a flex container Box can hold child Boxes,
 * Images, and/or text. The reconciler decides per-Box whether to emit text
 * ops based on the children present.
 */
export interface BoxProps {
  /**
   * Absolute coords in *points*. When set, the Box is pinned at this
   * location and skips flex contribution (siblings lay out around it).
   * Mutually informative with `className` / `style`: if `rect` is set, the
   * flex props are ignored for this Box's own positioning, though its
   * children still flex inside the rect.
   */
  rect?: Rect;
  /**
   * Brand-locked Tailwind classes. See `src/core/tailwind-resolver.ts` for
   * the allowlist (layout, typography, brand-token colors, brand-token
   * spacing). Resolved at render time; unknown classes throw with a
   * suggestion-aware error.
   */
  className?: string;
  /**
   * Inline Yoga-shaped style. Same layout pipeline as `className`, lower-
   * level escape hatch. Inline style wins over className on collision.
   */
  style?: YogaStyle;

  /**
   * Optional slot ID, encoded into the shape's alt-text. Required for any text
   * box that re-fill should target. Format: `<componentName>:<slotName>`,
   * e.g., `"cover:title"`. See `manifest.ts` for encoding details.
   */
  slotId?: SlotId;

  /**
   * Optional background fill. When set, the reconciler emits an
   * `updateShapeProperties` op immediately after the shape is created,
   * before any text or text-style ops. An empty Box (no children) with a
   * `fill` is a valid full-bleed colored background.
   */
  fill?: BoxFill;

  /** Default text style applied to the shape's contents. */
  textStyle?: TextStyle;

  /** Default paragraph style. */
  paragraphStyle?: ParagraphStyle;

  /** Children: `<Text>` runs and/or raw strings. */
  children?: ReactNode;
}

/**
 * A styled text run inside a `<Box>`.
 *
 * Multiple `<Text>` children of the same `<Box>` are concatenated; each
 * run's style is applied to its character range via `updateTextStyle` ops.
 * Raw string children of `<Box>` are equivalent to `<Text>{text}</Text>`
 * with no style override.
 *
 * The intent of carrying `textStyle` here (rather than mandating a typography
 * token) is: high-level brand components compose this primitive *and* enforce
 * brand-token discipline at *their* layer. The substrate stays brand-agnostic.
 *
 * `<Text>` accepts `className` for typography classes (`text-xl`, `font-bold`,
 * `text-display`, `text-<brand-color-token>`). Layout classes on `<Text>` are
 * a no-op — Text doesn't participate in flex layout; its parent Box does.
 */
export interface TextProps {
  /** Style applied to this run only. Merges over `<Box>`'s `textStyle`. */
  textStyle?: TextStyle;
  /**
   * Brand-locked Tailwind classes — only the typography subset is meaningful
   * here (`text-{size}`, `font-bold`, `italic`, `text-{role}`, `text-{token}`).
   * Layout classes are silently ignored.
   */
  className?: string;
  /** Children: text content. Nested elements are flattened to their text. */
  children?: ReactNode;
}

/**
 * A wrapper that sets the foreground color of its children.
 *
 * A thin convenience over `<Text textStyle={{foregroundColor}}/>` so
 * brand components can read more declaratively. The reconciler treats this
 * identically to a `<Text>` with the same style.
 */
export interface ColorProps {
  /** The color to apply, as a 24-bit hex. (`#RRGGBB`.) */
  color: HexColor;
  /** Children: text or `<Text>` runs. */
  children?: ReactNode;
}

/**
 * A reference to a brand-resolved image, including its provenance.
 *
 * The `artifact` field is **required**: every image rendered through the
 * substrate is recorded in the generation manifest's `artifacts` list, so
 * downstream tooling can detect 404s and verify content integrity. An
 * `<Image>` without a `ArtifactRef` is impossible to construct —
 * type-level enforcement of the manifest contract.
 */
export interface ImageRef {
  /** Resolved URL the runtime will fetch the image bytes from. */
  readonly url: string;
  /** Template-artifact provenance — recorded in manifest.artifacts. Required. */
  readonly artifact: ArtifactRef;
}

/**
 * A bitmap image placed on a slide, rendered as a `createImage` op.
 *
 * Sibling of `<Box>` inside a `<Slide>`. Used for full-bleed background
 * photos, dot-grid texture overlays, brand logos, and any other rasterized
 * brand artifact. Vector content (lines, rectangles, etc.) goes through
 * `<Box>` and the (future) shape-kind extension to its fill prop.
 */
export interface ImageProps {
  /**
   * Absolute coords in *points*. When set, pins the image at this location
   * and skips flex contribution — same escape-hatch semantics as `<Box>`.
   * Mutually informative with `className`/`style`: if `rect` is set,
   * positioning comes from rect; everything else from className/style.
   */
  rect?: Rect;

  /**
   * Brand-locked Tailwind classes for sizing the image inside a flex layout
   * (e.g. `aspect-square`, `w-1/3`, `flex-1`). Color/text classes are
   * ignored — Image has no foreground/background of its own.
   */
  className?: string;

  /** Inline Yoga-shaped style. Same precedence as Box's `style`. */
  style?: YogaStyle;

  /**
   * The image to render, including its brand-artifact provenance. Required —
   * an `<Image>` without an `ImageRef` is unconstructable, by design.
   */
  image: ImageRef;

  /**
   * Optional slot ID. When set, the reconciler records `SlotId → imageId` in
   * the manifest's slot registry.
   */
  slotId?: SlotId;

  /**
   * Accessibility alt-text shown to assistive tech.
   *
   * Carried through to the `createImage` op's `altText` field.
   */
  altText?: string;

  /**
   * How the image fits inside its computed rect when the intrinsic aspect
   * ratio doesn't match. Same semantics as CSS `object-fit`.
   *
   *   - `'contain'`: scale to fit, letterboxed if needed.
   *   - `'cover'`: scale to fill, cropped if needed.
   *   - `'fill'` (default): stretch to the rect.
   *
   * Maps to pptxgenjs's `sizing.type` on export and to CSS `object-fit` in
   * the dev viewer. Most consumers reach for this via the friendlier
   * wrapper exported from `@sanity-labs/slides/media`, but it is also
   * available on the primitive for low-level use.
   */
  fit?: 'contain' | 'cover' | 'fill';

  /**
   * Opacity, between `0` (fully transparent) and `1` (fully opaque). Maps
   * to pptxgenjs's `transparency` on export and to CSS `opacity` in the
   * dev viewer.
   */
  opacity?: number;

  /**
   * Rotation in degrees clockwise. Maps to pptxgenjs's `rotate` on export
   * and to a CSS `transform: rotate(...)` in the dev viewer.
   */
  rotate?: number;
}

/**
 * A unique brand for each primitive's React component.
 *
 * The reconciler identifies primitives by reading the `__rgsKind` brand,
 * never by reference equality on the function itself. That distinction
 * matters because the package's source export (`./src/index.ts`) and its
 * compiled export (`./dist/index.js`) ship two different `Slide`/`Box`/
 * etc. function instances. When the MCP server runs from `dist/` but an
 * agent-authored deck loads `@sanity-labs/slides` through `tsx` (which
 * picks up the `src/` source via `exports['.']`), the two surfaces end
 * up holding non-identical primitive references. A pure `===` check
 * silently fails on every component the agent writes — you get a 0-op
 * reconciler walk and an empty `.pptx`. The brand check survives.
 */
type Marker<TProps> = ((props: TProps) => null) & { readonly __rgsKind: string };

const makeMarker = <TProps>(kind: string): Marker<TProps> => {
  const component = (_props: TProps): null => null;
  // Display name aids debugging in React DevTools and assertion messages.
  Object.defineProperty(component, 'name', { value: kind });
  return Object.assign(component, { __rgsKind: kind } as const);
};

export const Slide = makeMarker<SlideProps>('Slide');
export const Box = makeMarker<BoxProps>('Box');
export const Text = makeMarker<TextProps>('Text');
export const Color = makeMarker<ColorProps>('Color');
export const Image = makeMarker<ImageProps>('Image');

/**
 * The set of primitive React components the reconciler recognizes.
 *
 * Used internally for type identity checks (see `reconciler.ts`). Exposed for
 * downstream packages that want to detect "is this a substrate primitive?"
 * without importing each one individually.
 */
export const PRIMITIVES = { Slide, Box, Text, Color, Image } as const;

export type PrimitiveKind = (typeof PRIMITIVES)[keyof typeof PRIMITIVES]['__rgsKind'];

const PRIMITIVE_KINDS = new Set<string>(Object.values(PRIMITIVES).map((p) => p.__rgsKind));

/**
 * Read the brand off a React-element type. Returns `undefined` for
 * anything that isn't one of our primitives — host elements, fragments,
 * user-defined function components, etc.
 *
 * Use this everywhere instead of `type === Slide` etc., because identity
 * is unreliable across the `src/`-via-tsx vs `dist/`-via-Node boundary.
 * See the comment above {@link Marker} for the full story.
 */
export const markerKind = (type: unknown): string | undefined => {
  if (typeof type !== 'function') return undefined;
  const k = (type as { __rgsKind?: unknown }).__rgsKind;
  return typeof k === 'string' ? k : undefined;
};

/** Type guard: is this React element type one of our primitives? */
export const isPrimitive = (
  type: unknown,
): type is (typeof PRIMITIVES)[keyof typeof PRIMITIVES] => {
  const k = markerKind(type);
  return k !== undefined && PRIMITIVE_KINDS.has(k);
};
