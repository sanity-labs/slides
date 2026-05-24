/**
 * Marker-based splicing for the deck's `src/index.ts`.
 *
 * The deck scaffold seeds two anchor pairs:
 *
 *   // <generated-imports>
 *   // </generated-imports>
 *
 *   // <generated-components>
 *   // </generated-components>
 *
 * Code-gen tools own everything between each pair. We re-derive the contents
 * from a flat list of component names every time, so the anchors stay
 * declarative — there's no incremental "find this entry and edit it"
 * logic to get wrong on the second write.
 *
 * One registered component produces two splices:
 *
 *   import { RevenueChart, RevenueChartSchema } from './components/RevenueChart.js';
 *
 *   RevenueChart: defineTemplateComponent({
 *     component: RevenueChart,
 *     schema: RevenueChartSchema,
 *     description: 'Custom slide type: RevenueChart.',
 *   }),
 */

const IMPORTS_OPEN = '// <generated-imports>';
const IMPORTS_CLOSE = '// </generated-imports>';
const COMPONENTS_OPEN = '// <generated-components>';
const COMPONENTS_CLOSE = '// </generated-components>';

/**
 * Rewrite the imports and components anchors so they register exactly the
 * named components (in array order).
 *
 * Throws if either anchor pair is missing or malformed.
 */
export const writeAnchors = (source: string, names: ReadonlyArray<string>): string => {
  // Validate both anchor pairs exist before touching the source — `String.replace`
  // silently no-ops on a missing pattern, which would leave the deck broken.
  assertAnchor(source, IMPORTS_OPEN, IMPORTS_CLOSE);
  assertAnchor(source, COMPONENTS_OPEN, COMPONENTS_CLOSE);
  const imports = names
    .map((n) => `import { ${n}, ${n}Schema } from './components/${n}.js';`)
    .join('\n');
  const components = names
    .map(
      (n) =>
        `    ${n}: defineTemplateComponent({\n` +
        `      component: ${n},\n` +
        `      schema: ${n}Schema,\n` +
        `      description: ${JSON.stringify(defaultDescription(n))},\n` +
        `    }),`,
    )
    .join('\n');
  return source
    .replace(spanRegex(IMPORTS_OPEN, IMPORTS_CLOSE), wrap(IMPORTS_OPEN, IMPORTS_CLOSE, imports, ''))
    .replace(
      spanRegex(COMPONENTS_OPEN, COMPONENTS_CLOSE),
      wrap(COMPONENTS_OPEN, COMPONENTS_CLOSE, components, '    '),
    );
};

/**
 * Read the currently registered component names out of an index.ts.
 * Used to compute the union before re-emitting and to detect duplicates.
 */
export const readRegisteredNames = (source: string): string[] => {
  const block = extractSpan(source, COMPONENTS_OPEN, COMPONENTS_CLOSE);
  const names: string[] = [];
  const ENTRY = /^\s*(\w+):\s*defineTemplateComponent\(/gm;
  let m: RegExpExecArray | null;
  while ((m = ENTRY.exec(block)) !== null) {
    if (m[1]) names.push(m[1]);
  }
  return names;
};

const defaultDescription = (name: string): string => `Custom slide type: ${name}.`;

const spanRegex = (open: string, close: string): RegExp =>
  new RegExp(`${escapeRegExp(open)}[\\s\\S]*?${escapeRegExp(close)}`);

const extractSpan = (source: string, open: string, close: string): string => {
  const match = spanRegex(open, close).exec(source);
  if (!match) throw missingAnchorError(open, close);
  return match[0].slice(open.length, -close.length);
};

const assertAnchor = (source: string, open: string, close: string): void => {
  if (!spanRegex(open, close).test(source)) throw missingAnchorError(open, close);
};

const missingAnchorError = (open: string, close: string): Error =>
  new Error(
    `Deck index.ts is missing the "${open}" / "${close}" anchor pair. ` +
      `The file may have been hand-edited; recreate the deck with slides_create_deck.`,
  );

const wrap = (open: string, close: string, body: string, indent: string): string =>
  body.length === 0 ? `${open}\n${indent}${close}` : `${open}\n${body}\n${indent}${close}`;

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
