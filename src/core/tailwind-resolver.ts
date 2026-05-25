/**
 * Brand-locked Tailwind-class resolver.
 *
 * Turns a `className="..."` string into a structured `ResolvedStyle` carrying
 * layout (Yoga-shaped POJO), text styling, and box fill. **Allowlist driven,
 * not denylist** — anything not on the list is rejected with a suggestion-
 * aware error that points at the closest valid class.
 *
 * # Why this exists
 *
 * Stock Tailwind has `bg-pink-500`, `text-[28px]`, arbitrary-value support, and
 * the full responsive/dark/hover variant tree. None of which respects a brand
 * template. This resolver ships the **specific subset** the framework supports:
 *
 *   - Layout primitives that translate cleanly to Yoga (flex, gap, padding,
 *     align, justify, fixed widths, fractional widths).
 *   - Typography sizing on a fixed scale (`text-xs` … `text-9xl`).
 *   - Typography roles (`text-display` / `text-body` / `text-mono`) that pin
 *     the agent to the template's three font slots.
 *   - **Brand-token colors**: `bg-<token>`, `text-<token>`, `border-<token>`
 *     where each `<token>` must exist in `template.colors`.
 *   - **Brand-token spacing**: `p-<token>`, `gap-<token>`, etc. where each
 *     `<token>` must exist in `template.spacing`. Bare numbers fall back to
 *     the 4pt scale (`p-4` = 16pt).
 *
 * Unknown classes always fail — the resolver lists the top three closest
 * matches in the error so the agent self-corrects on the next call. This is
 * the single biggest "is the agent UX good?" lever in this layer.
 *
 * # Spacing scale
 *
 * `1` unit = `4pt`. Matches Tailwind's default. `p-4` → 16pt; `gap-6` → 24pt.
 * Templates can override with named tokens (`p-md`) from `template.spacing`.
 *
 * # Resolution order for `text-*`
 *
 * `text-` is overloaded — Tailwind uses it for size, alignment, color, and
 * (in our dialect) font role. The resolver tries each interpretation in this
 * order, stopping at the first match:
 *
 *   1. Font-size keyword (`text-xs` … `text-9xl`)
 *   2. Alignment (`text-left` / `text-center` / `text-right`)
 *   3. Font role (`text-display` / `text-body` / `text-mono`)
 *   4. Brand color token (`text-<key>` for `key` in `template.colors`)
 *
 * Anything else is rejected.
 */

import type { Template } from './template.js';
import type { HexColor, TextStyle } from './runtime.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Pure data shape — translated to Yoga `setX` calls by the layout pass. */
export interface YogaStyle {
  display?: 'flex' | 'none';
  flexDirection?: 'row' | 'column';
  flex?: number;
  flexGrow?: number;
  flexShrink?: number;
  flexBasis?: number | 'auto' | `${number}%`;
  gap?: number;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  marginTop?: number;
  marginRight?: number;
  marginBottom?: number;
  marginLeft?: number;
  width?: number | 'auto' | `${number}%`;
  height?: number | 'auto' | `${number}%`;
  alignItems?: 'flex-start' | 'center' | 'flex-end' | 'stretch';
  justifyContent?:
    | 'flex-start'
    | 'center'
    | 'flex-end'
    | 'space-between'
    | 'space-around'
    | 'space-evenly';
  aspectRatio?: number;
}

/** Fill applied to a Box's background — same shape the reconciler already emits. */
export type BoxFill = { kind: 'solid'; color: HexColor };

/** Combined output of `resolveClassName`. */
export interface ResolvedStyle {
  readonly yoga: YogaStyle;
  readonly text: TextStyle;
  readonly fill: BoxFill | undefined;
}

/** Thrown when a className contains a class outside the brand-locked allowlist. */
export class UnknownClassError extends Error {
  constructor(
    readonly className: string,
    readonly suggestions: readonly string[],
    template: Template,
  ) {
    const sugList = suggestions.length > 0 ? `Did you mean: ${suggestions.join(', ')}?` : '';
    const tokens = listBrandTokens(template);
    super(
      `Unknown class "${className}". ${sugList} ` +
        `Brand-locked Tailwind dialect — only the allowlist is accepted; arbitrary ` +
        `Tailwind classes (bg-pink-500, text-[28px], hover:..., etc.) are not. ` +
        `Template "${template.name}" exposes: ${tokens}.`,
    );
    this.name = 'UnknownClassError';
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a className string against the brand-locked allowlist.
 *
 * Whitespace-separated. Empty input returns the empty style.
 *
 * Throws `UnknownClassError` on the first unrecognised class — the agent
 * gets a suggestion-aware message and can self-correct.
 */
export const resolveClassName = (className: string, template: Template): ResolvedStyle => {
  const yoga: YogaStyle = {};
  const text: TextStyle = {};
  let fill: BoxFill | undefined;

  for (const raw of className.split(/\s+/).filter(Boolean)) {
    const handler = matchHandler(raw, template);
    if (!handler) {
      throw new UnknownClassError(raw, suggestionsFor(raw, template), template);
    }
    handler({ yoga, text, fill: (next) => (fill = next) }, raw, template);
  }
  return { yoga, text, fill };
};

/**
 * Public helper for tests / debug tooling: enumerate every class name that
 * would be accepted for the given template. Excludes the infinite-cardinality
 * brand-token forms — those are tested separately.
 */
export const enumerateStaticClasses = (): readonly string[] =>
  [
    ...STATIC_CLASSES.keys(),
    ...spacingScale().flatMap((n) => SPACING_PREFIXES.map((p) => `${p}-${n}`)),
    ...textSizeKeys(),
  ].sort();

// ---------------------------------------------------------------------------
// Internals — class table
// ---------------------------------------------------------------------------

type Sink = {
  readonly yoga: YogaStyle;
  readonly text: TextStyle;
  readonly fill: (next: BoxFill) => void;
};

type Handler = (sink: Sink, raw: string, template: Template) => void;

/**
 * One handler per static class name (no numeric suffix).
 *
 * Dynamic prefixes (`gap-*`, `p-*`, `bg-*`, etc.) go through
 * `matchHandler` below before this table is consulted.
 */
const STATIC_CLASSES = new Map<string, Handler>([
  ['flex', (s) => void (s.yoga.display = 'flex')],
  ['hidden', (s) => void (s.yoga.display = 'none')],
  ['flex-row', (s) => void (s.yoga.flexDirection = 'row')],
  ['flex-col', (s) => void (s.yoga.flexDirection = 'column')],
  ['flex-1', (s) => void (s.yoga.flex = 1)],
  ['flex-auto', (s) => void (s.yoga.flexBasis = 'auto')],
  ['flex-none', (s) => void (s.yoga.flex = 0)],
  ['flex-grow', (s) => void (s.yoga.flexGrow = 1)],
  ['flex-shrink-0', (s) => void (s.yoga.flexShrink = 0)],

  ['w-full', (s) => void (s.yoga.width = '100%')],
  ['w-1/2', (s) => void (s.yoga.width = '50%')],
  ['w-1/3', (s) => void (s.yoga.width = '33.3333%')],
  ['w-2/3', (s) => void (s.yoga.width = '66.6667%')],
  ['w-1/4', (s) => void (s.yoga.width = '25%')],
  ['w-3/4', (s) => void (s.yoga.width = '75%')],
  ['w-auto', (s) => void (s.yoga.width = 'auto')],
  ['h-full', (s) => void (s.yoga.height = '100%')],
  ['h-1/2', (s) => void (s.yoga.height = '50%')],
  ['h-1/3', (s) => void (s.yoga.height = '33.3333%')],
  ['h-2/3', (s) => void (s.yoga.height = '66.6667%')],
  ['h-auto', (s) => void (s.yoga.height = 'auto')],

  ['aspect-square', (s) => void (s.yoga.aspectRatio = 1)],
  ['aspect-video', (s) => void (s.yoga.aspectRatio = 16 / 9)],

  ['items-start', (s) => void (s.yoga.alignItems = 'flex-start')],
  ['items-center', (s) => void (s.yoga.alignItems = 'center')],
  ['items-end', (s) => void (s.yoga.alignItems = 'flex-end')],
  ['items-stretch', (s) => void (s.yoga.alignItems = 'stretch')],

  ['justify-start', (s) => void (s.yoga.justifyContent = 'flex-start')],
  ['justify-center', (s) => void (s.yoga.justifyContent = 'center')],
  ['justify-end', (s) => void (s.yoga.justifyContent = 'flex-end')],
  ['justify-between', (s) => void (s.yoga.justifyContent = 'space-between')],
  ['justify-around', (s) => void (s.yoga.justifyContent = 'space-around')],
  ['justify-evenly', (s) => void (s.yoga.justifyContent = 'space-evenly')],

  ['font-bold', (s) => void (s.text.bold = true)],
  ['font-normal', (s) => void (s.text.bold = false)],
  ['italic', (s) => void (s.text.italic = true)],
  ['not-italic', (s) => void (s.text.italic = false)],
  ['underline', (s) => void (s.text.underline = true)],
  ['no-underline', (s) => void (s.text.underline = false)],

  // Note: text-{left,center,right} live here for completeness, but the
  // Box-level emitter forwards them through `paragraphStyle.alignment`
  // (not `textStyle`). We stash on a private text key the reconciler reads.
  ['text-left', (s) => void ((s.text as { textAlign?: string }).textAlign = 'left')],
  ['text-center', (s) => void ((s.text as { textAlign?: string }).textAlign = 'center')],
  ['text-right', (s) => void ((s.text as { textAlign?: string }).textAlign = 'right')],

  ['text-display', (s) => void (s.text.fontFamily = 'display')],
  ['text-body', (s) => void (s.text.fontFamily = 'body')],
  ['text-mono', (s) => void (s.text.fontFamily = 'mono')],

  // Tracking + leading aren't carried on TextStyle today; map to safe
  // pass-throughs that brand templates can extend later. Accept but no-op for
  // now so the agent isn't punished for using them.
  ['tracking-tight', () => void 0],
  ['tracking-normal', () => void 0],
  ['tracking-wide', () => void 0],
  ['leading-tight', () => void 0],
  ['leading-normal', () => void 0],
  ['leading-loose', () => void 0],
]);

/** Text-size keywords on a fixed scale. */
const TEXT_SIZES: ReadonlyMap<string, number> = new Map([
  ['text-xs', 8],
  ['text-sm', 10],
  ['text-base', 12],
  ['text-lg', 14],
  ['text-xl', 16],
  ['text-2xl', 20],
  ['text-3xl', 24],
  ['text-4xl', 32],
  ['text-5xl', 40],
  ['text-6xl', 48],
  ['text-7xl', 56],
  ['text-8xl', 64],
  ['text-9xl', 72],
]);

const textSizeKeys = (): string[] => [...TEXT_SIZES.keys()];

/** Edge-shorthand prefixes that take a spacing value: `p`, `px`, `pt`, etc. */
const SPACING_PREFIXES = [
  'p',
  'px',
  'py',
  'pt',
  'pr',
  'pb',
  'pl',
  'm',
  'mx',
  'my',
  'mt',
  'mr',
  'mb',
  'ml',
  'gap',
] as const;

type SpacingPrefix = (typeof SPACING_PREFIXES)[number];

/** Conservative starting scale: `0` … `16`. Tailwind's default tops out higher; we don't need it. */
const spacingScale = (): number[] => Array.from({ length: 17 }, (_, i) => i);

/**
 * Pick the handler for one class.
 *
 * The order matters — static map wins first (cheap exact lookup), then the
 * dynamic prefixes, then brand tokens. Returns `undefined` if nothing matches.
 */
const matchHandler = (raw: string, template: Template): Handler | undefined => {
  const staticHandler = STATIC_CLASSES.get(raw);
  if (staticHandler) return staticHandler;

  const sizeHandler = matchTextSize(raw);
  if (sizeHandler) return sizeHandler;

  const spacingHandler = matchSpacing(raw, template);
  if (spacingHandler) return spacingHandler;

  const colorHandler = matchColor(raw, template);
  if (colorHandler) return colorHandler;

  return undefined;
};

const matchTextSize = (raw: string): Handler | undefined => {
  const pt = TEXT_SIZES.get(raw);
  if (pt === undefined) return undefined;
  return (s) => void (s.text.fontSize = pt);
};

/**
 * Match a class against the spacing prefixes (`p-*`, `mx-*`, `gap-*`, etc.).
 *
 * Numeric suffix (`p-4`) resolves on the 4pt scale (`p-4` = 16pt).
 * Token suffix (`p-md`) resolves against `template.spacing[<key>]`.
 */
const matchSpacing = (raw: string, template: Template): Handler | undefined => {
  const dash = raw.indexOf('-');
  if (dash < 0) return undefined;
  const prefix = raw.slice(0, dash);
  const suffix = raw.slice(dash + 1);
  if (!isSpacingPrefix(prefix)) return undefined;

  const pt = resolveSpacingSuffix(suffix, template);
  if (pt === undefined) return undefined;

  return (s) => applySpacing(s.yoga, prefix, pt);
};

const isSpacingPrefix = (s: string): s is SpacingPrefix =>
  (SPACING_PREFIXES as readonly string[]).includes(s);

const resolveSpacingSuffix = (suffix: string, template: Template): number | undefined => {
  if (/^\d+$/.test(suffix)) {
    const n = Number(suffix);
    if (n >= 0 && n <= 16) return n * 4;
    return undefined;
  }
  const tokenValue = template.spacing[suffix];
  return typeof tokenValue === 'number' ? tokenValue : undefined;
};

const applySpacing = (yoga: YogaStyle, prefix: SpacingPrefix, pt: number): void => {
  switch (prefix) {
    case 'p':
      yoga.paddingTop = pt;
      yoga.paddingRight = pt;
      yoga.paddingBottom = pt;
      yoga.paddingLeft = pt;
      return;
    case 'px':
      yoga.paddingLeft = pt;
      yoga.paddingRight = pt;
      return;
    case 'py':
      yoga.paddingTop = pt;
      yoga.paddingBottom = pt;
      return;
    case 'pt':
      yoga.paddingTop = pt;
      return;
    case 'pr':
      yoga.paddingRight = pt;
      return;
    case 'pb':
      yoga.paddingBottom = pt;
      return;
    case 'pl':
      yoga.paddingLeft = pt;
      return;
    case 'm':
      yoga.marginTop = pt;
      yoga.marginRight = pt;
      yoga.marginBottom = pt;
      yoga.marginLeft = pt;
      return;
    case 'mx':
      yoga.marginLeft = pt;
      yoga.marginRight = pt;
      return;
    case 'my':
      yoga.marginTop = pt;
      yoga.marginBottom = pt;
      return;
    case 'mt':
      yoga.marginTop = pt;
      return;
    case 'mr':
      yoga.marginRight = pt;
      return;
    case 'mb':
      yoga.marginBottom = pt;
      return;
    case 'ml':
      yoga.marginLeft = pt;
      return;
    case 'gap':
      yoga.gap = pt;
      return;
  }
};

/**
 * Match a class against the brand color tokens.
 *
 * Only `bg-<token>` and `text-<token>` are supported. `border-<token>` is
 * **not** in the allowlist: the reconciler doesn't emit border ops yet, and
 * silently accepting `border-*` would mask a real "this class did nothing"
 * bug as the agent debugs why their borders aren't showing. Better to reject
 * and surface that limitation through the standard `UnknownClassError` so
 * the agent picks something that actually renders.
 */
const matchColor = (raw: string, template: Template): Handler | undefined => {
  for (const prefix of ['bg-', 'text-'] as const) {
    if (!raw.startsWith(prefix)) continue;
    const token = raw.slice(prefix.length);
    const color = template.colors[token];
    if (color === undefined) continue;
    if (prefix === 'bg-') {
      return (s) => s.fill({ kind: 'solid', color });
    }
    return (s) => void (s.text.foregroundColor = color);
  }
  return undefined;
};

// ---------------------------------------------------------------------------
// Suggestion engine
// ---------------------------------------------------------------------------

/**
 * Return up to three closest matches for an unknown class, ranked by edit
 * distance. The candidate set includes static classes, dynamic forms with
 * tokens / numbers populated for this template, so suggestions feel
 * template-aware ("did you mean `bg-fg-base`?" rather than "did you mean
 * `bg-<token>`?").
 */
export const suggestionsFor = (raw: string, template: Template): string[] => {
  const candidates = candidateClasses(template);
  const scored = candidates.map((c) => [c, distance(raw, c)] as const);
  scored.sort((a, b) => a[1] - b[1]);
  return scored
    .slice(0, 3)
    .filter(([, d]) => d <= Math.max(2, Math.floor(raw.length / 2)))
    .map(([c]) => c);
};

const candidateClasses = (template: Template): string[] => {
  const out: string[] = [];
  out.push(...STATIC_CLASSES.keys());
  out.push(...TEXT_SIZES.keys());
  for (const prefix of SPACING_PREFIXES) {
    for (const n of spacingScale()) out.push(`${prefix}-${n}`);
    for (const token of Object.keys(template.spacing)) out.push(`${prefix}-${token}`);
  }
  for (const color of Object.keys(template.colors)) {
    out.push(`bg-${color}`);
    out.push(`text-${color}`);
  }
  return out;
};

/** Levenshtein with early exit at a 4-edit cap; we never surface anything worse. */
const distance = (a: string, b: string): number => {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 4) return 1 + Math.abs(a.length - b.length);
  const m = a.length;
  const n = b.length;
  // Row-pair rolling table — O(min(m,n)) memory.
  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min((prev[j] ?? 0) + 1, (curr[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n] ?? Number.MAX_SAFE_INTEGER;
};

const listBrandTokens = (template: Template): string => {
  const colors = Object.keys(template.colors).sort();
  const spacing = Object.keys(template.spacing).sort();
  const parts: string[] = [];
  if (colors.length > 0) parts.push(`colors {${colors.join(', ')}}`);
  if (spacing.length > 0) parts.push(`spacing {${spacing.join(', ')}}`);
  if (parts.length === 0) return 'no brand tokens declared';
  return parts.join('; ');
};
