/**
 * `@sanity-labs/slides/mcp` — the template-agnostic MCP server framework.
 *
 * `createSlideServer({ template, runtime })` builds an `McpServer` exposing a
 * curated set of seven tools (see `server.ts` for the full breakdown):
 *
 *   slides_list, slides_validate, slides_create,
 *   slides_create_deck, slides_add_component, slides_edit_component, slides_build
 *
 * The `start({ transport })` shape is the seam for Streamable HTTP / remote
 * transports later. Today only stdio is implemented.
 *
 * ```ts
 * import { createSlideServer } from '@sanity-labs/slides/mcp';
 * import { PptxSlidesRuntime } from '@sanity-labs/slides';
 *
 * const runtime = new PptxSlidesRuntime({ outputDir: '/tmp/decks' });
 * const server = createSlideServer({ template: myTemplate, runtime });
 * await server.start({ transport: 'stdio' });
 * ```
 */

export {
  createSlideServer,
  type SlideServer,
  type SlideServerConfig,
  type StartOptions,
} from './server.js';
export { renderSlides, type RenderResult, type RenderIssue, type SlideSpec } from './render.js';
export {
  errorResult,
  formatZodIssue,
  zodErrorResult,
  type ToolErrorPayload,
  type ToolErrorResult,
} from './errors.js';
