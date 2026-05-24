/**
 * The reconciler — walks a React element tree and emits a sequence of
 * `SlideOp`s plus a generation manifest.
 *
 * # Why a custom walker (not `react-reconciler`)
 *
 * The natural reach is for the `react-reconciler` package — it's what
 * react-three-fiber, react-pdf, and Ink use. But the constraints of this
 * surface make a custom walker a strictly simpler fit:
 *
 * 1. **No state.** Template components are pure. No hooks, no effects, no refs.
 *    The whole reason to use `react-reconciler` is the scheduler + commit
 *    phases that make state-driven re-renders work. We don't have state.
 * 2. **Write-once.** A `renderToOps()` call produces one batch and exits.
 *    There's no incremental update model to honor.
 * 3. **No host node mutation.** Output is an immutable op list. The 30+ host-
 *    config methods `react-reconciler` requires (`appendChild`,
 *    `removeChild`, `commitMount`, etc.) all collapse to "push to an array."
 * 4. **Tree shape is shallow and known.** `Slide` → `Box` | `Image` →
 *    text runs. The walker can encode this structure directly with much
 *    better error messages than a generic reconciler would surface.
 *
 * If we ever add state-driven re-renders (probably never; the docs commit to
 * forward-only generation), we can swap in `react-reconciler` behind the same
 * `renderToOps` signature. The signature is the contract.
 *
 * # What the walker does
 *
 * 1. Resolve function components by invoking them with their props (no hooks).
 * 2. Flatten fragments and arrays.
 * 3. For each `<Slide>`, emit `createSlide`, then walk its children for
 *    `<Box>`s and `<Image>`s.
 * 4. For each `<Box>`, emit `createShape` (TEXT_BOX), then — if `fill` is
 *    set — `updateShapeProperties` carrying the resolved fill color, then
 *    collect its text runs into a single `insertText` + per-run
 *    `updateTextStyle` calls.
 * 5. For each `<Image>`, emit `createImage` with the resolved URL and (if
 *    no slotId is set) the user-supplied alt-text. Record the artifact
 *    reference in the manifest, deduped by identifier.
 *
 * Errors throw with paths like "Slide[0] > Box[1] > unexpected child" so the
 * brand-component author has enough information to localize the problem.
 *
 * # Determinism
 *
 * Object IDs are generated from a counter seeded per call. Same input tree →
 * same output ops → same snapshot. This is what makes layer-2 golden tests in
 * `docs/testing-strategy.md` work.
 */

import {
  Children,
  Fragment,
  isValidElement,
  type FunctionComponent,
  type ReactElement,
  type ReactNode,
} from 'react';
import {
  Box,
  Color,
  Text,
  Image,
  Slide,
  isPrimitive,
  type BoxFill,
  type BoxProps,
  type ColorProps,
  type TextProps,
  type ImageProps,
  type SlideProps,
} from './components.js';
import { isFontRole, resolveFontRole } from './font-resolver.js';
import { ptToEmu, type Rect } from './geometry.js';
import type { ArtifactRef, GenerationManifest, ReconcileResult, SlotId } from './manifest.js';
import type { Template } from './template.js';
import type { EmuRect, ShapeProperties, SlideOp, TextRange, TextStyle } from './runtime.js';

/** Inputs to a single render. */
export interface RenderToOpsInput {
  /** The React element tree. Top-level should be a `<Slide>` or a fragment of `<Slide>`s. */
  readonly tree: ReactNode;
  /** The template whose tokens are in scope. */
  readonly template: Template;
  /**
   * Target deck ID (re-fill case) or `null` for a new deck.
   *
   * Ops emission doesn't differ between the two today, but the manifest
   * records it, and downstream runtime adapters may use it (e.g., to skip
   * `createSlide` if the deck is being re-filled rather than rebuilt).
   */
  readonly deckId: string | null;
  /**
   * Template artifacts the deck references *in addition to* any artifacts the
   * reconciler itself records by walking `<Image>` primitives. Provided by
   * brand-component code that resolved textures/logos/etc. before invoking
   * the reconciler. The reconciler merges these with the artifacts it
   * discovers, deduping by identifier (last-wins on duplicates within either
   * source).
   */
  readonly artifacts?: readonly ArtifactRef[];
  /**
   * Override for the manifest's `generatedAt` timestamp. Tests pin this to
   * keep snapshots deterministic.
   */
  readonly now?: () => string;
}

/** Internal mutable state carried through the walk. */
interface WalkContext {
  readonly template: Template;
  readonly ops: SlideOp[];
  readonly slots: Map<SlotId, string>;
  /**
   * Template artifacts discovered while walking, keyed by identifier so a single
   * texture or logo referenced from multiple slides only appears once in the
   * manifest. Insertion order is preserved by the underlying Map.
   */
  readonly artifacts: Map<string, ArtifactRef>;
  /** Counter for generating unique slide / shape / image IDs. */
  idCounter: number;
  /** The slide currently being walked, for error context. */
  currentSlideIndex: number;
  /** The box being walked (if any), for error context. */
  currentBoxIndex: number;
}

/**
 * Render a React tree to ops + manifest.
 *
 * The function is synchronous: function components are invoked inline, and the
 * walk is purely structural. There's no scheduling, no async boundaries.
 */
export const renderToOps = (input: RenderToOpsInput): ReconcileResult => {
  const ctx: WalkContext = {
    template: input.template,
    ops: [],
    slots: new Map(),
    artifacts: new Map(),
    idCounter: 0,
    currentSlideIndex: -1,
    currentBoxIndex: -1,
  };

  // Seed with caller-supplied artifacts first so reconciler-discovered
  // artifacts on the same identifier overwrite (more recent / context-bound
  // resolution wins). Insertion order is preserved.
  if (input.artifacts !== undefined) {
    for (const artifact of input.artifacts) {
      ctx.artifacts.set(artifact.identifier, artifact);
    }
  }

  const slides = collectSlides(input.tree, ctx);
  slides.forEach((slide, index) => {
    ctx.currentSlideIndex = index;
    ctx.currentBoxIndex = -1;
    walkSlide(slide, index, ctx);
  });

  const manifest: GenerationManifest = {
    manifestVersion: '1',
    generatedBy: 'react-pptx',
    generatedAt: (input.now ?? defaultNow)(),
    templateName: input.template.name,
    deckId: input.deckId,
    slots: Object.fromEntries(ctx.slots) as Record<SlotId, string>,
    artifacts: [...ctx.artifacts.values()],
  };

  return { ops: ctx.ops, manifest };
};

const defaultNow = (): string => new Date().toISOString();

// ---------------------------------------------------------------------------
// Tree walk
// ---------------------------------------------------------------------------

/**
 * Resolve a node to its concrete element form, invoking function components.
 *
 * Returns:
 * - An array of resolved primitives if the node is a fragment / array / function
 *   component that returned multiple children.
 * - A single primitive element if the node resolves to one.
 * - Empty array for falsy / boolean / null nodes (React's "render nothing").
 *
 * This is what makes `<Cover/>` work: `Cover` is a function component that
 * returns `<Slide>...</Slide>`, so resolving it yields the underlying Slide.
 */
const resolveNode = (node: ReactNode, ctx: WalkContext): ReactElement[] => {
  if (node === null || node === undefined || node === false || node === true) {
    return [];
  }
  if (typeof node === 'string' || typeof node === 'number') {
    throw new ReconcilerError(
      `Unexpected text node "${node}" at top level — text must live inside a <Box>.`,
      ctx,
    );
  }
  if (Array.isArray(node)) {
    return node.flatMap((child) => resolveNode(child, ctx));
  }
  if (!isValidElement(node)) {
    throw new ReconcilerError(`Unsupported child of type ${typeof node}.`, ctx);
  }

  // React.Fragment: descend into children.
  if (node.type === Fragment) {
    const props = node.props as { children?: ReactNode };
    return resolveNode(props.children, ctx);
  }

  // Primitive host element: pass through.
  if (isPrimitive(node.type)) {
    return [node];
  }

  // Function component: invoke with its props (no hooks; brand components are pure).
  if (typeof node.type === 'function') {
    const Component = node.type as FunctionComponent<unknown>;
    const result = invokeComponent(Component, node.props, ctx);
    return resolveNode(result, ctx);
  }

  // Class components, intrinsic strings, etc.: not supported.
  const typeName = describeType(node.type);
  throw new ReconcilerError(`Unsupported element type ${typeName}.`, ctx);
};

const collectSlides = (tree: ReactNode, ctx: WalkContext): ReactElement[] => {
  const resolved = resolveNode(tree, ctx);
  for (const el of resolved) {
    if (el.type !== Slide) {
      throw new ReconcilerError(
        `Top-level children must be <Slide> elements; got <${describeType(el.type)}>.`,
        ctx,
      );
    }
  }
  return resolved;
};

const walkSlide = (slide: ReactElement, index: number, ctx: WalkContext): void => {
  const props = slide.props as SlideProps;
  const slideId = makeId('slide', ctx);
  ctx.ops.push({
    type: 'createSlide',
    slideId,
    insertAt: index,
  });

  const children = resolveNode(props.children, ctx);
  children.forEach((child, childIndex) => {
    ctx.currentBoxIndex = childIndex;
    if (child.type === Box) {
      walkBox(child, slideId, ctx);
      return;
    }
    if (child.type === Image) {
      walkImage(child, slideId, ctx);
      return;
    }
    throw new ReconcilerError(
      `<Slide> children must be <Box> or <Image> elements; got <${describeType(child.type)}>.`,
      ctx,
    );
  });
};

const walkBox = (box: ReactElement, slideId: string, ctx: WalkContext): void => {
  const props = box.props as BoxProps;
  const shapeId = makeId('shape', ctx);
  ctx.ops.push({
    type: 'createShape',
    slideId,
    shapeId,
    shape: 'TEXT_BOX',
    rect: rectToEmu(props.rect),
  });

  // Fill applies to the shape itself, before any text. Order matters:
  //   createShape → updateShapeProperties → insertText → updateTextStyle
  // This way an empty Box with a fill is a valid full-bleed colored
  // background, and a Box with both fill and text gets the fill behind the
  // text without any z-order ambiguity.
  if (props.fill !== undefined) {
    const properties = boxFillToShapeProperties(props.fill);
    ctx.ops.push({
      type: 'updateShapeProperties',
      objectId: shapeId,
      properties,
    });
  }

  if (props.slotId !== undefined) {
    if (ctx.slots.has(props.slotId)) {
      throw new ReconcilerError(
        `Duplicate slotId "${props.slotId}" — slot IDs must be unique within a deck.`,
        ctx,
      );
    }
    ctx.slots.set(props.slotId, shapeId);
    // Slot identity is encoded into shape alt-text per generation-model.md.
    // We re-use `updateShapeProperties` semantics by piggybacking through a
    // dedicated op-shape — here, alt-text is set via a property update at the
    // runtime layer. The op carries no fillColor/outlineColor, signalling
    // "alt text only." If alt-text ever deserves its own op type, this is the
    // keeps the SlideOp union narrow.
    //
    // NOTE: `updateShapeProperties` doesn't currently carry alt-text; the
    // runtime adapter resolves slot alt-text from the manifest's `slots` map,
    // not from an op. The manifest is the source of truth for slot identity.
    // This is intentional: ops express "what to do," manifest expresses "what
    // is true after." Encoding alt-text into ops would duplicate the manifest
    // entry.
  }

  // Default styles to apply across the whole shape after text is inserted.
  const text = collectTextRuns(props.children, ctx);
  if (text.runs.length === 0) {
    // Empty Box is permitted (colored rectangle, full-bleed background).
    return;
  }

  ctx.ops.push({ type: 'insertText', objectId: shapeId, text: text.full });

  if (props.textStyle !== undefined && Object.keys(props.textStyle).length > 0) {
    ctx.ops.push({
      type: 'updateTextStyle',
      objectId: shapeId,
      range: { start: 0, end: text.full.length },
      style: resolveTextStyleFonts(props.textStyle, ctx.template, ctx),
    });
  }

  if (props.paragraphStyle !== undefined && Object.keys(props.paragraphStyle).length > 0) {
    ctx.ops.push({
      type: 'updateParagraphStyle',
      objectId: shapeId,
      range: { start: 0, end: text.full.length },
      style: props.paragraphStyle,
    });
  }

  for (const run of text.runs) {
    if (Object.keys(run.style).length === 0) continue;
    ctx.ops.push({
      type: 'updateTextStyle',
      objectId: shapeId,
      range: run.range,
      style: resolveTextStyleFonts(run.style, ctx.template, ctx),
    });
  }
};

/**
 * Walk an `<Image>` element: emit a `createImage` op and record the artifact.
 *
 * Slot/altText interaction: the reconciler emits `createImage` with the
 * user-supplied `altText` (if any) — that's what lands in the FakeRuntime's
 * in-memory model and what the live runtime's translator will set as the
 * page-element description initially. If a `slotId` is also set, the
 * runtime adapter's slot-stamping post-pass
 * (`op-translator.slotRegistryToAltTextRequests`) overwrites the live
 * page-element alt-text with the slot tag, because slot identity is required
 * for re-fill and wins. The op stream still carries the user altText, so the
 * substrate doesn't lose it.
 */
const walkImage = (image: ReactElement, slideId: string, ctx: WalkContext): void => {
  const props = image.props as ImageProps;
  const imageId = makeId('image', ctx);
  ctx.ops.push({
    type: 'createImage',
    slideId,
    imageId,
    url: props.image.url,
    rect: rectToEmu(props.rect),
    ...(props.altText !== undefined ? { altText: props.altText } : {}),
  });

  // Dedup by identifier: a logo or texture referenced from many slides should
  // appear in manifest.artifacts exactly once. Last-wins on conflicts (later
  // resolution overrides earlier) — typically a no-op since the brand
  // resolver is deterministic per identifier.
  ctx.artifacts.set(props.image.artifact.identifier, props.image.artifact);

  if (props.slotId !== undefined) {
    if (ctx.slots.has(props.slotId)) {
      throw new ReconcilerError(
        `Duplicate slotId "${props.slotId}" — slot IDs must be unique within a deck.`,
        ctx,
      );
    }
    ctx.slots.set(props.slotId, imageId);
  }
};

/**
 * Resolve a `BoxFill` discriminated union to the shape-properties subset the
 * reconciler emits via `updateShapeProperties`.
 *
 * The discriminant (`kind`) is exhaustively switched so adding a new fill
 * variant in `components.ts` (e.g., `'texture'`) is a compile-time prompt to
 * extend this resolver as well.
 */
const boxFillToShapeProperties = (fill: BoxFill): ShapeProperties => {
  switch (fill.kind) {
    case 'solid':
      return { fillColor: fill.color };
  }
};

// ---------------------------------------------------------------------------
// Text run collection
// ---------------------------------------------------------------------------

interface CollectedText {
  /** The full concatenated text for the box. */
  full: string;
  /** Per-run style spans, in document order. */
  runs: Array<{ range: TextRange; style: TextStyle }>;
}

/**
 * Recursively collect text runs from a Box's children.
 *
 * Rules:
 * - Strings/numbers contribute raw text with no style.
 * - `<Text>` nests its own style and contributes its children's text.
 * - `<Color>` is sugar for `<Text textStyle={{ foregroundColor }}>`.
 * - Nested function components are resolved (so `<Bullet>foo</Bullet>` works
 *   if `Bullet` is a brand component returning `<Text>foo</Text>`).
 * - Anything else is an error.
 */
const collectTextRuns = (node: ReactNode, ctx: WalkContext): CollectedText => {
  const acc: CollectedText = { full: '', runs: [] };
  const append = (text: string, style: TextStyle): void => {
    if (text.length === 0) return;
    const start = acc.full.length;
    acc.full += text;
    acc.runs.push({ range: { start, end: start + text.length }, style });
  };
  walkText(node, {}, append, ctx);
  return acc;
};

const walkText = (
  node: ReactNode,
  inheritedStyle: TextStyle,
  append: (text: string, style: TextStyle) => void,
  ctx: WalkContext,
): void => {
  if (node === null || node === undefined || node === false || node === true) {
    return;
  }
  if (typeof node === 'string') {
    append(node, inheritedStyle);
    return;
  }
  if (typeof node === 'number') {
    append(String(node), inheritedStyle);
    return;
  }
  if (Array.isArray(node)) {
    Children.forEach(node, (child) => walkText(child, inheritedStyle, append, ctx));
    return;
  }
  if (!isValidElement(node)) {
    throw new ReconcilerError(`Unsupported text child of type ${typeof node}.`, ctx);
  }

  if (node.type === Fragment) {
    const props = node.props as { children?: ReactNode };
    walkText(props.children, inheritedStyle, append, ctx);
    return;
  }

  if (node.type === Text) {
    const props = node.props as TextProps;
    const merged: TextStyle = { ...inheritedStyle, ...(props.textStyle ?? {}) };
    walkText(props.children, merged, append, ctx);
    return;
  }

  if (node.type === Color) {
    const props = node.props as ColorProps;
    const merged: TextStyle = { ...inheritedStyle, foregroundColor: props.color };
    walkText(props.children, merged, append, ctx);
    return;
  }

  if (node.type === Slide || node.type === Box || node.type === Image) {
    throw new ReconcilerError(`<${describeType(node.type)}> cannot appear inside a <Box>.`, ctx);
  }

  if (typeof node.type === 'function') {
    const Component = node.type as FunctionComponent<unknown>;
    const result = invokeComponent(Component, node.props, ctx);
    walkText(result, inheritedStyle, append, ctx);
    return;
  }

  throw new ReconcilerError(`Unsupported text element <${describeType(node.type)}>.`, ctx);
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve any role-string `fontFamily` in a `TextStyle` to a literal family
 * name using the brand's font stack. Returns the same object reference if the
 * style has no role-string `fontFamily` (the common case for literal-family
 * passes — preserves snapshot stability and avoids unnecessary allocation).
 *
 * Resolution semantics (no backend querying):
 *   role keyword in → `brand.fonts[role][0]` out (the brand's first preference).
 *
 * If the brand declares an empty stack for the requested role, this throws
 * with a clear "brand defines no <role> font" error. Strict-fail beats
 * silent-Arial when the source of truth is misconfigured.
 *
 * The reconciler invokes this immediately before pushing every text-style op,
 * so downstream translators never see a role keyword as a literal family.
 */
const resolveTextStyleFonts = (
  style: TextStyle,
  template: Template,
  ctx: WalkContext,
): TextStyle => {
  const family = style.fontFamily;
  if (family === undefined) return style;
  if (!isFontRole(family)) return style; // literal family — pass through.
  try {
    return { ...style, fontFamily: resolveFontRole(template.fonts, family) };
  } catch (err) {
    if (err instanceof Error && err.name === 'EmptyFontStackError') {
      throw new ReconcilerError(
        `Template "${template.name}" defines no ${family} font (fonts.${family} is empty). Every role needs at least one entry, with a system-safe last entry (e.g., "Arial").`,
        ctx,
      );
    }
    throw err;
  }
};

const rectToEmu = (rect: Rect): EmuRect => ({
  x: ptToEmu(rect.x),
  y: ptToEmu(rect.y),
  w: ptToEmu(rect.w),
  h: ptToEmu(rect.h),
});

const makeId = (prefix: string, ctx: WalkContext): string => {
  ctx.idCounter += 1;
  return `${prefix}_${ctx.idCounter}`;
};

/**
 * Invoke a function component with its props and return its rendered children.
 *
 * Async components are not supported. React 19 widened the function-component
 * return type to `ReactNode | Promise<ReactNode>`; we narrow back to
 * `ReactNode` here and throw if a Promise is returned.
 */
const invokeComponent = (
  Component: FunctionComponent<unknown>,
  props: unknown,
  ctx: WalkContext,
): ReactNode => {
  const result = Component(props) as ReactNode | Promise<ReactNode>;
  if (typeof result === 'object' && result !== null && 'then' in result) {
    throw new ReconcilerError(
      `<${describeType(Component)}> returned a Promise. Template components must be synchronous (no async, no Suspense).`,
      ctx,
    );
  }
  return result;
};

const describeType = (type: unknown): string => {
  if (typeof type === 'string') return type;
  if (typeof type === 'function') {
    const named = type as { displayName?: string; name?: string };
    return named.displayName ?? named.name ?? 'anonymous';
  }
  if (type === Fragment) return 'Fragment';
  return String(type);
};

/** Error thrown by the reconciler with location info pre-formatted. */
export class ReconcilerError extends Error {
  constructor(message: string, ctx: Pick<WalkContext, 'currentSlideIndex' | 'currentBoxIndex'>) {
    const path: string[] = [];
    if (ctx.currentSlideIndex >= 0) path.push(`Slide[${ctx.currentSlideIndex}]`);
    if (ctx.currentBoxIndex >= 0) path.push(`Box[${ctx.currentBoxIndex}]`);
    const prefix = path.length > 0 ? `${path.join(' > ')}: ` : '';
    super(`${prefix}${message}`);
    this.name = 'ReconcilerError';
  }
}
