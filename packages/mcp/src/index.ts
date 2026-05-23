/**
 * react-pptx-mcp — template-agnostic MCP server framework.
 *
 * The substrate a template package wires into to expose its slide-component
 * library as an MCP server. Iterates the template's components, derives one
 * MCP tool per slide type (default name `slides_add_<component>`; override
 * via `SlideServerConfig.toolPrefix`), plus a discovery tool (`slides_list`)
 * and a one-shot create tool (`slides_create`), then starts a stdio transport.
 *
 * The `start({ transport })` shape is the seam for Streamable HTTP / remote
 * transports later. Today only stdio is implemented.
 *
 * Public API:
 *
 * ```ts
 * import { createSlideServer } from 'react-pptx-mcp';
 * import { PptxSlidesRuntime } from 'react-pptx'; // or any SlidesRuntime
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
  componentToTool,
  deriveComponentTools,
  type DerivedTool,
  type JsonSchema,
} from './schema.js';
export { DEFAULT_COMPONENT_TOOL_PREFIX, componentToolName, toSnakeCase } from './naming.js';
export {
  errorResult,
  formatZodIssue,
  zodErrorResult,
  type ToolErrorPayload,
  type ToolErrorResult,
} from './errors.js';
