/**
 * Enforce the brand-locked import surface for agent-authored components.
 *
 * The whole point of the framework is that agents only get to spend the
 * template's tokens — Box/Text/Slide/Image primitives from
 * `@sanity-labs/slides`, schemas from `zod`, and React types from `react`.
 * Anything else (fs, child_process, an external UI library) either breaks
 * the brand lock or — worse — lets the agent execute arbitrary code in the
 * MCP server process when the deck is loaded.
 *
 * **Per-template extension.** Brand templates can declare additional
 * importable packages via `Template.additionalImportAllowlist`. Common case:
 * a template exposes its own chrome helpers (a `<BrandSlide>` that wraps
 * children with a logo + footer) and wants its agent-authored components to
 * reuse them for visual consistency. The template author opts in to the
 * broader surface; the framework default stays brand-locked-only.
 *
 * We enforce the allowlist with a quick scan of every `from "..."` /
 * `import("...")` / `require("...")` in the source. Not a perfect sandbox
 * (a determined attacker can use `new Function`, top-level eval, etc.) but
 * it raises the bar from "agent can `rm -rf $HOME` by accident" to "agent
 * has to actively try to escape", which is the practical threat model for
 * a local stdio MCP server.
 */

/** Packages every agent component may import, regardless of template. */
const BASE_ALLOWED = Object.freeze([
  '@sanity-labs/slides',
  'react',
  'react/jsx-runtime',
  'react/jsx-dev-runtime',
  'zod',
] as const);

/**
 * Scan a source string for static, dynamic, and `require()` imports.
 * Returns the disallowed specifiers in source order. Empty array = ok.
 *
 * `extraAllowlist` adds template-specific packages on top of the base
 * surface (e.g. a template's own chrome-helper export).
 */
export const findDisallowedImports = (
  source: string,
  extraAllowlist: readonly string[] = [],
): string[] => {
  const allowed = new Set<string>([...BASE_ALLOWED, ...extraAllowlist]);
  // Strip line + block comments before scanning so we don't reject
  // specifiers that only appear inside example code in JSDoc.
  const stripped = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const offenders: string[] = [];
  for (const pattern of PATTERNS) {
    for (const m of stripped.matchAll(pattern)) {
      const specifier = m[1];
      if (specifier && !allowed.has(specifier)) offenders.push(specifier);
    }
  }
  return Array.from(new Set(offenders));
};

const PATTERNS: RegExp[] = [
  // import ... from 'x'  /  import 'x'  /  export ... from 'x'
  /(?:import|export)\s+(?:[^'"]+?\s+from\s+)?['"]([^'"]+)['"]/g,
  // import('x')
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  // require('x')
  /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
];

/**
 * Throw with an agent-actionable message if `source` imports anything
 * outside the union of the base allowlist and the template's extras.
 */
export const assertAllowedImports = (
  source: string,
  extraAllowlist: readonly string[] = [],
): void => {
  const bad = findDisallowedImports(source, extraAllowlist);
  if (bad.length === 0) return;
  const list = bad.map((b) => `"${b}"`).join(', ');
  const allowedList = [...BASE_ALLOWED, ...extraAllowlist].sort().join(', ');
  throw new Error(
    `Component source imports ${list}, which is not allowed. ` +
      `Slide components may only import from: ${allowedList}. ` +
      `Build the slide using only the substrate primitives (Slide, Box, Text, Image) ` +
      `and the template's exposed surface, and compute everything else inline.`,
  );
};

/** Public, immutable view of the base allowlist for diagnostics / docs. */
export const BASE_ALLOWED_IMPORTS: readonly string[] = BASE_ALLOWED;
