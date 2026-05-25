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

/**
 * A single slide in the deck.
 *
 * Every `<Slide>` becomes a `createSlide` op. Children are rendered into the
 * slide's coordinate space.
 */
export interface SlideProps {
  /** Children: `<Box>` and `<Image>` shapes laid out inside the slide. */
  children?: ReactNode;
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
 */
export interface BoxProps {
  /** The shape's rect in *points*. The reconciler converts to EMU at the boundary. */
  rect: Rect;

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
 */
export interface TextProps {
  /** Style applied to this run only. Merges over `<Box>`'s `textStyle`. */
  textStyle?: TextStyle;
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
  /** The image's rect in *points*. The reconciler converts to EMU at the boundary. */
  rect: Rect;

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
