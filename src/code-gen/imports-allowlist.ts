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
 * We enforce the allowlist with a quick scan of every `from "..."` /
 * `import("...")` / `require("...")` in the source. Not a perfect sandbox
 * (a determined attacker can use `new Function`, top-level eval, etc.) but
 * it raises the bar from "agent can `rm -rf $HOME` by accident" to "agent
 * has to actively try to escape", which is the practical threat model for
 * a local stdio MCP server.
 */

/** Packages an agent's component source may import. */
const ALLOWED = new Set([
  '@sanity-labs/slides',
  'react',
  'react/jsx-runtime',
  'react/jsx-dev-runtime',
  'zod',
]);

/**
 * Scan a source string for static, dynamic, and `require()` imports.
 * Returns the disallowed specifiers in source order. Empty array = ok.
 */
export const findDisallowedImports = (source: string): string[] => {
  // Strip line + block comments before scanning so we don't reject
  // specifiers that only appear inside example code in JSDoc.
  const stripped = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const offenders: string[] = [];
  for (const pattern of PATTERNS) {
    for (const m of stripped.matchAll(pattern)) {
      const specifier = m[1];
      if (specifier && !ALLOWED.has(specifier)) offenders.push(specifier);
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
 * outside the allowlist.
 */
export const assertAllowedImports = (source: string): void => {
  const bad = findDisallowedImports(source);
  if (bad.length === 0) return;
  const list = bad.map((b) => `"${b}"`).join(', ');
  throw new Error(
    `Component source imports ${list}, which is not allowed. ` +
      `Slide components may only import from: ${[...ALLOWED].sort().join(', ')}. ` +
      `Build the slide using only the @sanity-labs/slides primitives ` +
      `(Slide, Box, Text, Image) and compute everything else inline.`,
  );
};
