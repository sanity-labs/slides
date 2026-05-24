/**
 * The template-agnostic MCP server framework.
 *
 * createSlideServer({ template, runtime }) builds an McpServer that exposes
 * three kinds of tools:
 *
 * 1. **`slides_list`** — returns the list of slide types the loaded template
 *    supports, with descriptions. One round-trip to discover the surface.
 *
 * 2. **One tool per slide type**, named `<toolPrefix><snake_case>` (default
 *    prefix `slides_add_`). Validates user-supplied props against the
 *    component's Zod schema and echoes them back as a slide spec. Used
 *    iteratively by an LLM to assemble a deck before calling `slides_create`.
 *
 * 3. **`slides_create`** — full pipeline. Takes `{ title, slides }`, renders
 *    via the reconciler, applies through the PPTX runtime, writes the .pptx
 *    file to disk, and returns the path.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { z } from 'zod';
import type { ZodError } from 'zod';
import type { SlidesRuntime, Template } from '../core/index.js';
import { errorResult, zodErrorResult } from './errors.js';
import { renderSlides } from './render.js';
import { deriveComponentTools, type DerivedTool } from './schema.js';

/** Configuration accepted by createSlideServer. */
export interface SlideServerConfig {
  /** The template (component vocabulary + tokens) the server exposes. */
  readonly template: Template;
  /** The PPTX runtime used to materialize presentations. */
  readonly runtime: SlidesRuntime;
  /**
   * Override the server's reported name/version. Defaults to a name derived
   * from the template and version `'0.1.0'`.
   */
  readonly serverInfo?: { readonly name: string; readonly version: string };
  /**
   * Override the per-slide-type tool-name prefix. Default: `'slides_add_'`.
   * Use this when the server emits something other than slide decks (a
   * report-builder might use `'report_add_'`, etc.).
   */
  readonly toolPrefix?: string;
}

/** Options accepted by server.start. */
export type StartOptions = { readonly transport: 'stdio' };

/** The handle returned by createSlideServer. */
export interface SlideServer {
  /** The underlying MCP server. Exposed for advanced callers. */
  readonly mcp: McpServer;
  /** Tool definitions derived from the template. */
  readonly tools: ReadonlyArray<DerivedTool>;
  /** Connect to the given transport. Lower-level than start. */
  connect(transport: Transport): Promise<void>;
  /** Start serving over the configured transport. */
  start(options: StartOptions): Promise<void>;
  /** Close the server and disconnect any active transport. */
  close(): Promise<void>;
}

/** Construct a template-locked MCP server. */
export const createSlideServer = (config: SlideServerConfig): SlideServer => {
  const { template, runtime } = config;
  const serverInfo = config.serverInfo ?? {
    name: 'react-pptx-mcp:' + template.name,
    version: '0.1.0',
  };

  const mcp = new McpServer(serverInfo);
  const tools = deriveComponentTools(template, config.toolPrefix);

  registerListTool(mcp, template, tools);
  registerComponentTools(mcp, tools);
  registerCreateTool(mcp, runtime, template);

  return {
    mcp,
    tools,
    connect: (transport) => mcp.connect(transport),
    start: async (options) => {
      switch (options.transport) {
        case 'stdio': {
          await mcp.connect(new StdioServerTransport());
          return;
        }
      }
    },
    close: () => mcp.close(),
  };
};

// ---------------------------------------------------------------------------
// slides_list
// ---------------------------------------------------------------------------

const LIST_OUTPUT_SHAPE = {
  template: z.string().describe('The name of the loaded template.'),
  slides: z
    .array(
      z.object({
        name: z.string().describe('Slide-type name, e.g. "Cover".'),
        toolName: z.string().describe('MCP tool name for this slide type.'),
        description: z.string().describe('When to use this slide type.'),
      }),
    )
    .describe('Every slide type the template exposes.'),
};

const registerListTool = (
  mcp: McpServer,
  template: Template,
  tools: ReadonlyArray<DerivedTool>,
): void => {
  mcp.registerTool(
    'slides_list',
    {
      description:
        'List every slide type this template supports, with descriptions and the per-type tool names. ' +
        'Call once at the start of a deck-building session to learn the surface.',
      outputSchema: LIST_OUTPUT_SHAPE,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      const slides = tools.map((t) => ({
        name: t.componentName,
        toolName: t.name,
        description: t.description,
      }));
      const lines = [
        `Template: ${template.name}`,
        '',
        'Available slide types:',
        ...slides.map((s) => `  • ${s.name} (${s.toolName}) — ${s.description}`),
        '',
        'Call slides_add_<type> to validate a single slide. ' +
          'Call slides_create with an array of slide specs to write a .pptx file.',
      ].join('\n');
      return {
        content: [{ type: 'text' as const, text: lines }],
        structuredContent: { template: template.name, slides },
      };
    },
  );
};

// ---------------------------------------------------------------------------
// slides_add_<component>
// ---------------------------------------------------------------------------

const COMPONENT_OUTPUT_SHAPE = {
  slide: z
    .object({
      component: z.string(),
      props: z.record(z.unknown()),
    })
    .describe('A single validated slide spec, ready to be passed to slides_create.'),
};

const registerComponentTools = (mcp: McpServer, tools: readonly DerivedTool[]): void => {
  for (const tool of tools) {
    mcp.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.inputShape,
        outputSchema: COMPONENT_OUTPUT_SHAPE,
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async (rawProps) => {
        const parsed = tool.inputSchema.safeParse(rawProps);
        if (!parsed.success) {
          return zodErrorResult(
            `Validation error in ${tool.name} props:`,
            parsed.error as ZodError,
            "Refer to this tool's input schema and retry.",
          );
        }
        return {
          content: [
            {
              type: 'text' as const,
              text:
                `Validated ${tool.componentName} props. ` +
                `Pass { component: "${tool.componentName}", props: <these> } ` +
                `as one entry of slides_create.slides.`,
            },
          ],
          structuredContent: {
            slide: { component: tool.componentName, props: parsed.data },
          },
        };
      },
    );
  }
};

// ---------------------------------------------------------------------------
// slides_create
// ---------------------------------------------------------------------------

const SLIDE_SPEC_SCHEMA = z
  .object({
    component: z.string().min(1).describe('The slide-type name, e.g. "Cover".'),
    props: z
      .record(z.unknown())
      .describe("Props matching that slide type's input schema (see slides_add_<type>)."),
  })
  .describe('One slide to add. Same shape as the structuredContent of slides_add_<type>.');

const CREATE_INPUT_SHAPE = {
  title: z.string().min(1).describe('Deck title — used as the .pptx filename stem.'),
  slides: z.array(SLIDE_SPEC_SCHEMA).min(1).describe('The slides to write, in order.'),
};

const CREATE_OUTPUT_SHAPE = {
  filePath: z.string().describe('Absolute path to the generated .pptx file.'),
  slideCount: z.number().int().nonnegative(),
};

const registerCreateTool = (mcp: McpServer, runtime: SlidesRuntime, template: Template): void => {
  mcp.registerTool(
    'slides_create',
    {
      description:
        'Generate a template-locked .pptx presentation from a sequence of slide specs and write it to disk. ' +
        'Returns the absolute file path. Each spec is { component, props } — ' +
        'use the per-type slides_add_<type> tools first to discover schemas and validate props.',
      inputSchema: CREATE_INPUT_SHAPE,
      outputSchema: CREATE_OUTPUT_SHAPE,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (input) => {
      const result = await renderSlides({
        template,
        runtime,
        title: input.title,
        slides: input.slides,
      });
      if (result.ok) {
        const slideWord = result.slideCount === 1 ? 'slide' : 'slides';
        return {
          content: [
            {
              type: 'text' as const,
              text: `Wrote ${result.slideCount} ${slideWord} to ${result.filePath}.`,
            },
          ],
          structuredContent: { filePath: result.filePath, slideCount: result.slideCount },
        };
      }
      const hint =
        result.code === 'validation_error' ? ' Fix the listed fields and retry slides_create.' : '';
      return errorResult(result.code, result.message + hint, result.issues);
    },
  );
};
