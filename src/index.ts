/**
 * `@sanity-labs/slides` — root export.
 *
 * The renderer (React reconciler + PPTX runtime + `Template` type +
 * primitives). What template authors `import` to write their slides.
 *
 * Other subpaths:
 *   - `@sanity-labs/slides/mcp`      → MCP server framework
 *   - `@sanity-labs/slides/dev`      → browser dev viewer
 *   - `@sanity-labs/slides/sanity`   → Sanity reference template
 *   - `@sanity-labs/slides/scaffold` → scaffold-a-new-template
 *
 * The `slidesctl` bin exposes the MCP server + generator + scaffolder as a
 * single CLI driven by Claude (or any MCP client) — see the README.
 */

export * from './core/index.js';
