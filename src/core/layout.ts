/**
 * Yoga layout pass — turns a resolved JSX tree of `<Slide>` / `<Box>` /
 * `<Image>` elements into a parallel tree of computed rects.
 *
 * # Why a separate pass
 *
 * The reconciler used to require every `<Box>` to carry an absolute `rect`
 * prop. That worked but every reconciler error agents hit on real harness
 * runs was a positioning bug. Yoga + Tailwind eliminates the class: agents
 * write `<Slide className="flex flex-col gap-6 p-12">` and the framework
 * does the math.
 *
 * # Architecture
 *
 * For each `<Slide>`:
 *
 *   1. Walk the resolved children, build a parallel Yoga tree. Each
 *      `LayoutNode` mirrors a JSX primitive (`Slide`/`Box`/`Image`) and
 *      holds its own `Yoga.Node`.
 *   2. Call `calculateLayout(canvas.w, canvas.h, LTR)` on the root.
 *   3. Read each node's `getComputedLayout()` into a plain `Rect` and store
 *      on the `LayoutNode`.
 *   4. Free the Yoga tree.
 *
 * The reconciler then walks the `LayoutNode` tree (not the React tree) to
 * emit ops — every node already carries its rect, its source element, and
 * its resolved fill / text style. No reconciler-side resolution needed.
 *
 * # Rect prop as an escape hatch
 *
 * If a `<Box>` carries `rect={{x,y,w,h}}`, we feed Yoga an absolute-positioned
 * leaf at that location. The flex parent treats it as overlay content (doesn't
 * affect sibling layout). Existing rect-based code keeps working.
 *
 * # Text measurement
 *
 * Text-bearing leaf boxes get a heuristic measure function — `fontSize × 0.55`
 * char-width, `fontSize × 1.3` line height — so flex can size them by content
 * without a real font-metrics engine. Approximate, but produces visible slides
 * without forcing the agent to specify `w-{N}` / `h-{N}` on every text Box.
 */

import { Children, Fragment, isValidElement, type ReactElement, type ReactNode } from 'react';
import Yoga, {
  Align,
  Direction,
  Display,
  Edge,
  FlexDirection,
  Gutter,
  Justify,
  MeasureMode,
  PositionType,
  type Node as YogaNode,
} from 'yoga-layout';
import {
  markerKind,
  type BoxFill,
  type BoxProps,
  type ImageProps,
  type SlideProps,
  type TextProps,
} from './components.js';
import type { Rect } from './geometry.js';
import type { Template } from './template.js';
import type { TextStyle } from './runtime.js';
import { resolveClassName, type YogaStyle } from './tailwind-resolver.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type LayoutKind = 'slide' | 'box' | 'image';

/**
 * One node in the laid-out tree the reconciler walks to emit ops.
 *
 * Mirrors the structure of the source JSX (1:1 with resolved primitives) but
 * carries computed rects + resolved style. Free `yoga` via `freeLayoutTree`.
 */
export interface LayoutNode {
  readonly kind: LayoutKind;
  /** The source JSX element this node was built from. */
  readonly element: ReactElement;
  /** Rect in points, in slide-canvas coordinates. */
  readonly rect: Rect;
  /** Children (Slide → Boxes/Images; Box → Boxes/Images). Image is always a leaf. */
  readonly children: readonly LayoutNode[];
  /** Resolved fill (from className `bg-<token>` or explicit `fill` prop). Boxes only. */
  readonly fill: BoxFill | undefined;
  /**
   * Resolved text style from className/textStyle. Boxes only — applied to
   * the Box's text descendants by the reconciler. Stable identity: if no
   * style was resolved, this is `undefined` rather than `{}` so consumers
   * can short-circuit.
   */
  readonly textStyle: TextStyle | undefined;
  /** Paragraph alignment from `text-{left,center,right}`, when set. */
  readonly textAlign: 'left' | 'center' | 'right' | undefined;
}

// ---------------------------------------------------------------------------
// Layout entry points
// ---------------------------------------------------------------------------

/**
 * Build the layout tree for one `<Slide>`.
 *
 * The slide is the Yoga root. Defaults to `flex flex-col` if the source
 * doesn't override.
 */
export const layoutSlide = (
  slide: ReactElement,
  template: Template,
  canvas: { w: number; h: number },
  resolveNode: (node: ReactNode) => ReactElement[],
): LayoutNode => {
  const props = slide.props as SlideProps & ClassNameStyleProps;
  const resolved = resolveStyles(props, template);
  // Slide defaults: full canvas, flex-col when neither className nor style sets
  // direction. Width/height are pinned to the canvas regardless of className
  // (a `w-1/2` Slide would be a weird ask).
  const slideNode = Yoga.Node.create();

  // Wrap every Yoga allocation in a try/finally so a throw between create and
  // freeRecursive doesn't leak Wasm memory. The reconciler runs in a long-
  // lived MCP server; a leak per failed layout would compound across sessions.
  try {
    applyDefaults(slideNode, { display: 'flex', flexDirection: 'column' });
    applyYogaStyle(slideNode, resolved.yoga);
    slideNode.setWidth(canvas.w);
    slideNode.setHeight(canvas.h);

    const childElements = resolveNode(props.children);
    const childNodes = childElements.map((el) => buildChildNode(el, template, resolveNode));
    childNodes.forEach((child, i) => slideNode.insertChild(child.yoga, i));

    slideNode.calculateLayout(canvas.w, canvas.h, Direction.LTR);

    // Yoga returns each node's computed position relative to its parent's
    // content edge — same as CSS flexbox. PPTX `createShape` takes absolute
    // slide-canvas coordinates, so we accumulate parent offsets as we walk the
    // ChildBuild tree and store absolute rects on every LayoutNode. The slide
    // root sits at (0, 0).
    return {
      kind: 'slide',
      element: slide,
      rect: { x: 0, y: 0, w: canvas.w, h: canvas.h },
      children: childNodes.map((c) => readComputed(c, { x: 0, y: 0 })),
      fill: resolved.fill,
      textStyle: nonEmpty(resolved.text),
      textAlign: extractTextAlign(resolved.text),
    };
  } finally {
    // freeRecursive cascades to every child Yoga node created above, even
    // those that were partially attached when an exception fired. Safe to
    // call on a node mid-construction — Yoga handles it.
    slideNode.freeRecursive();
  }
};

// ---------------------------------------------------------------------------
// Internals — child node construction (pre-layout)
// ---------------------------------------------------------------------------

interface ChildBuild {
  readonly element: ReactElement;
  readonly kind: LayoutKind;
  readonly yoga: YogaNode;
  readonly children: readonly ChildBuild[];
  readonly fill: BoxFill | undefined;
  readonly textStyle: TextStyle | undefined;
  readonly textAlign: 'left' | 'center' | 'right' | undefined;
}

const buildChildNode = (
  element: ReactElement,
  template: Template,
  resolveNode: (node: ReactNode) => ReactElement[],
): ChildBuild => {
  const kind = markerKind(element.type);
  if (kind === 'Box') {
    return buildBoxNode(element, template, resolveNode);
  }
  if (kind === 'Image') {
    return buildImageNode(element, template);
  }
  throw new LayoutError(
    `Expected <Box> or <Image> as a child of <Slide>; got <${describeElementType(element.type)}>.`,
  );
};

const buildBoxNode = (
  element: ReactElement,
  template: Template,
  resolveNode: (node: ReactNode) => ReactElement[],
): ChildBuild => {
  const props = element.props as BoxProps & ClassNameStyleProps;
  const yogaNode = Yoga.Node.create();
  const resolved = resolveStyles(props, template);

  if (props.rect) {
    // Escape hatch: agent provided absolute coords. Pin the node in place
    // and skip flex contribution. Children are still laid out inside this
    // rect (so a rect-positioned card can use flex internally) — width and
    // height come from the rect, everything else (flexDirection, gap,
    // padding, alignment) still flows in from className/style so the box's
    // inner layout matches what the agent asked for.
    yogaNode.setPositionType(PositionType.Absolute);
    yogaNode.setPosition(Edge.Left, props.rect.x);
    yogaNode.setPosition(Edge.Top, props.rect.y);
    yogaNode.setWidth(props.rect.w);
    yogaNode.setHeight(props.rect.h);
    const { width: _w, height: _h, ...inner } = resolved.yoga;
    applyYogaStyle(yogaNode, inner);
  } else {
    applyYogaStyle(yogaNode, resolved.yoga);
  }

  // Decide if this Box is a flex container (has Box/Image children) or a
  // text-bearing leaf (Text/string children only, or empty). Empty Boxes
  // act as background-fill rectangles.
  const childElements = collectBoxLikeChildren(props.children, resolveNode);
  const childBuilds = childElements.map((el) => buildChildNode(el, template, resolveNode));
  childBuilds.forEach((child, i) => yogaNode.insertChild(child.yoga, i));

  // If the Box holds text and has no flex children, give it a measure
  // function so Yoga can size it by content when the user didn't pin width
  // or height. Skipped for empty Boxes (background fills) and container
  // Boxes (their size comes from their flex children).
  if (childBuilds.length === 0 && !props.rect) {
    const text = collectTextContent(props.children, resolveNode);
    if (text.length > 0) {
      const fontSize = resolved.text.fontSize ?? 14;
      yogaNode.setMeasureFunc((width, widthMode, _height, _heightMode) =>
        measureText(text, fontSize, width, widthMode),
      );
    }
  }

  return {
    element,
    kind: 'box',
    yoga: yogaNode,
    children: childBuilds,
    // Per-field precedence: explicit `fill` prop wins over className `bg-*`.
    // Mirrors the textStyle / paragraphStyle merge in the reconciler: utility
    // classes set the default, props are the per-call override.
    fill: (props.fill as BoxFill | undefined) ?? resolved.fill,
    textStyle: nonEmpty(resolved.text),
    textAlign: extractTextAlign(resolved.text),
  };
};

const buildImageNode = (element: ReactElement, template: Template): ChildBuild => {
  const props = element.props as ImageProps & ClassNameStyleProps;
  const yogaNode = Yoga.Node.create();
  // Image accepts className/style for flex sizing (e.g. `aspect-square`),
  // optionally combined with a `rect` escape hatch. When both are present,
  // rect pins absolute position and the className contributes everything
  // except positioning — mirrors Box's precedence so the agent's mental model
  // is consistent.
  const resolved = resolveStyles(props, template);
  if (props.rect) {
    yogaNode.setPositionType(PositionType.Absolute);
    yogaNode.setPosition(Edge.Left, props.rect.x);
    yogaNode.setPosition(Edge.Top, props.rect.y);
    yogaNode.setWidth(props.rect.w);
    yogaNode.setHeight(props.rect.h);
  } else {
    // Without rect, the className drives sizing entirely. Without either, the
    // image is 0×0 — visible immediately when the agent forgets sizing.
    applyYogaStyle(yogaNode, resolved.yoga);
  }
  return {
    element,
    kind: 'image',
    yoga: yogaNode,
    children: [],
    fill: undefined,
    textStyle: undefined,
    textAlign: undefined,
  };
};

/**
 * From a ReactNode that's a Box's children, collect the Box/Image children
 * that should participate in flex layout. Text/string/Color elements are
 * skipped — they're flattened to text content by `collectTextContent`.
 */
const collectBoxLikeChildren = (
  node: ReactNode,
  resolveNode: (node: ReactNode) => ReactElement[],
): ReactElement[] => {
  const out: ReactElement[] = [];
  const visit = (n: ReactNode): void => {
    if (n === null || n === undefined || n === false || n === true) return;
    if (typeof n === 'string' || typeof n === 'number') return;
    if (Array.isArray(n)) {
      Children.forEach(n, visit);
      return;
    }
    if (!isValidElement(n)) return;
    if (n.type === Fragment) {
      const props = n.props as { children?: ReactNode };
      visit(props.children);
      return;
    }
    const kind = markerKind(n.type);
    if (kind === 'Box' || kind === 'Image') {
      out.push(n);
      return;
    }
    if (kind === 'Text' || kind === 'Color') {
      // Text/Color render into the Box's text content, not as flex siblings.
      return;
    }
    // Function component: resolve once via the caller's resolver (which has
    // the shared reconciler context for error messages) and recurse.
    if (typeof n.type === 'function') {
      const resolved = resolveNode(n);
      for (const r of resolved) {
        const rKind = markerKind(r.type);
        if (rKind === 'Box' || rKind === 'Image') out.push(r);
      }
      return;
    }
  };
  visit(node);
  return out;
};

/**
 * Flatten a Box's text children into a plain string for the measure function.
 * Mirrors the reconciler's text-collection walk, but returns string-only —
 * we only need the length and contents (for line breaks) at layout time.
 *
 * Function components are routed through the caller's `resolveNode` rather
 * than invoked inline. Two reasons: (1) the reconciler's resolver guards
 * against Promise returns and surfaces them as `ReconcilerError` with path
 * context, while a raw `Component(props)` here would silently stringify a
 * Promise into the measured text; (2) keeping invocation in one place means
 * function-component throws carry the slide/box path prefix consistently.
 */
const collectTextContent = (
  node: ReactNode,
  resolveNode: (node: ReactNode) => ReactElement[],
): string => {
  let out = '';
  const visit = (n: ReactNode): void => {
    if (n === null || n === undefined || n === false || n === true) return;
    if (typeof n === 'string') {
      out += n;
      return;
    }
    if (typeof n === 'number') {
      out += String(n);
      return;
    }
    if (Array.isArray(n)) {
      Children.forEach(n, visit);
      return;
    }
    if (!isValidElement(n)) return;
    if (n.type === Fragment) {
      const props = n.props as { children?: ReactNode };
      visit(props.children);
      return;
    }
    const kind = markerKind(n.type);
    if (kind === 'Text' || kind === 'Color') {
      const props = n.props as TextProps & { children?: ReactNode };
      visit(props.children);
      return;
    }
    if (typeof n.type === 'function') {
      // Delegate to the reconciler's resolver so Promise-returning components
      // throw with context instead of stringifying "[object Promise]" into
      // measured text.
      const resolved = resolveNode(n);
      for (const r of resolved) visit(r);
    }
  };
  visit(node);
  return out;
};

/**
 * Heuristic text measurement. Real glyph metrics would need a font engine
 * we don't ship; this approximation is good enough to lay out the canonical
 * Tier-2 example without forcing every text Box to declare its size.
 *
 *   - Char width: `fontSize × 0.55` (roughly Inter / Geist medium-weight).
 *   - Line height: `fontSize × 1.3`.
 *   - Wrap by character count, not word — close enough for slide-sized text.
 *
 * Exported for unit testing the constants. The heuristic is the most
 * fragile single piece of the layout pipeline; pinning it via test means
 * future drifts are deliberate.
 */
export const measureText = (
  text: string,
  fontSize: number,
  width: number,
  widthMode: MeasureMode,
): { width: number; height: number } => {
  const charWidth = fontSize * 0.55;
  const lineHeight = fontSize * 1.3;
  const naturalWidth = text.length * charWidth;
  if (widthMode === MeasureMode.Exactly) {
    const lines = Math.max(1, Math.ceil(naturalWidth / Math.max(width, 1)));
    return { width, height: lines * lineHeight };
  }
  if (widthMode === MeasureMode.AtMost) {
    const usableWidth = Math.min(naturalWidth, width);
    const lines = Math.max(1, Math.ceil(naturalWidth / Math.max(usableWidth, 1)));
    return { width: usableWidth, height: lines * lineHeight };
  }
  return { width: naturalWidth, height: lineHeight };
};

// ---------------------------------------------------------------------------
// Internals — read computed layout
// ---------------------------------------------------------------------------

/**
 * Walk the `ChildBuild` tree after `calculateLayout`, snapshotting every
 * node's rect (resolved by Yoga) into a plain `LayoutNode`.
 *
 * Yoga reports `(left, top)` **relative to the containing block** (the
 * parent's content edge — i.e. inside any padding the parent declared). We
 * walk depth-first and accumulate `parentOffset` so the rect stored on each
 * `LayoutNode` is in **absolute slide-canvas coordinates**, which is what
 * the reconciler's `createShape` op needs. Without this, every text Box
 * inside a flex card renders at the slide's top-left instead of inside its
 * card — visually catastrophic.
 */
const readComputed = (b: ChildBuild, parentOffset: { x: number; y: number }): LayoutNode => {
  const local = b.yoga.getComputedLayout();
  const absoluteRect: Rect = {
    x: parentOffset.x + local.left,
    y: parentOffset.y + local.top,
    w: local.width,
    h: local.height,
  };
  return {
    kind: b.kind,
    element: b.element,
    rect: absoluteRect,
    children: b.children.map((c) => readComputed(c, { x: absoluteRect.x, y: absoluteRect.y })),
    fill: b.fill,
    textStyle: b.textStyle,
    textAlign: b.textAlign,
  };
};

// ---------------------------------------------------------------------------
// Internals — Yoga style application
// ---------------------------------------------------------------------------

interface ClassNameStyleProps {
  className?: string;
  style?: YogaStyle;
}

/**
 * Merge `className` (resolved via the Tailwind allowlist) and inline `style`
 * into a single resolved shape. Inline `style` wins on collision — it's the
 * lower-level escape hatch.
 */
const resolveStyles = (
  props: ClassNameStyleProps,
  template: Template,
): { yoga: YogaStyle; text: TextStyle; fill: BoxFill | undefined } => {
  const fromClass = props.className
    ? resolveClassName(props.className, template)
    : { yoga: {} as YogaStyle, text: {} as TextStyle, fill: undefined as BoxFill | undefined };
  const yoga: YogaStyle = { ...fromClass.yoga, ...(props.style ?? {}) };
  return { yoga, text: fromClass.text, fill: fromClass.fill };
};

const applyDefaults = (node: YogaNode, defaults: YogaStyle): void => applyYogaStyle(node, defaults);

const applyYogaStyle = (node: YogaNode, style: YogaStyle): void => {
  if (style.display !== undefined) {
    node.setDisplay(style.display === 'flex' ? Display.Flex : Display.None);
  }
  if (style.flexDirection !== undefined) {
    node.setFlexDirection(style.flexDirection === 'row' ? FlexDirection.Row : FlexDirection.Column);
  }
  if (style.flex !== undefined) node.setFlex(style.flex);
  if (style.flexGrow !== undefined) node.setFlexGrow(style.flexGrow);
  if (style.flexShrink !== undefined) node.setFlexShrink(style.flexShrink);
  if (style.flexBasis !== undefined) node.setFlexBasis(style.flexBasis);
  if (style.gap !== undefined) node.setGap(Gutter.All, style.gap);

  if (style.paddingTop !== undefined) node.setPadding(Edge.Top, style.paddingTop);
  if (style.paddingRight !== undefined) node.setPadding(Edge.Right, style.paddingRight);
  if (style.paddingBottom !== undefined) node.setPadding(Edge.Bottom, style.paddingBottom);
  if (style.paddingLeft !== undefined) node.setPadding(Edge.Left, style.paddingLeft);

  if (style.marginTop !== undefined) node.setMargin(Edge.Top, style.marginTop);
  if (style.marginRight !== undefined) node.setMargin(Edge.Right, style.marginRight);
  if (style.marginBottom !== undefined) node.setMargin(Edge.Bottom, style.marginBottom);
  if (style.marginLeft !== undefined) node.setMargin(Edge.Left, style.marginLeft);

  if (style.width !== undefined) node.setWidth(style.width);
  if (style.height !== undefined) node.setHeight(style.height);

  if (style.alignItems !== undefined) node.setAlignItems(mapAlign(style.alignItems));
  if (style.justifyContent !== undefined) node.setJustifyContent(mapJustify(style.justifyContent));

  if (style.aspectRatio !== undefined) node.setAspectRatio(style.aspectRatio);
};

const mapAlign = (a: NonNullable<YogaStyle['alignItems']>): Align => {
  switch (a) {
    case 'flex-start':
      return Align.FlexStart;
    case 'center':
      return Align.Center;
    case 'flex-end':
      return Align.FlexEnd;
    case 'stretch':
      return Align.Stretch;
  }
};

const mapJustify = (j: NonNullable<YogaStyle['justifyContent']>): Justify => {
  switch (j) {
    case 'flex-start':
      return Justify.FlexStart;
    case 'center':
      return Justify.Center;
    case 'flex-end':
      return Justify.FlexEnd;
    case 'space-between':
      return Justify.SpaceBetween;
    case 'space-around':
      return Justify.SpaceAround;
    case 'space-evenly':
      return Justify.SpaceEvenly;
  }
};

// ---------------------------------------------------------------------------
// Style helpers
// ---------------------------------------------------------------------------

const nonEmpty = (style: TextStyle): TextStyle | undefined =>
  Object.keys(style).length > 0 ? style : undefined;

const extractTextAlign = (style: TextStyle): 'left' | 'center' | 'right' | undefined => {
  const v = (style as { textAlign?: string }).textAlign;
  if (v === 'left' || v === 'center' || v === 'right') return v;
  return undefined;
};

const describeElementType = (type: unknown): string => {
  if (typeof type === 'string') return type;
  if (typeof type === 'function') {
    const f = type as { displayName?: string; name?: string };
    return f.displayName ?? f.name ?? 'anonymous';
  }
  return String(type);
};

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Layout-specific error so the reconciler can re-wrap with slide/box path context. */
export class LayoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LayoutError';
  }
}
