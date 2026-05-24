/**
 * The template-agnostic MCP server framework.
 *
 * createSlideServer({ template, runtime }) builds an McpServer that exposes
 * three tool families:
 *
 * 1. **Discovery + render tools** working off the server's *active template*:
 *    - `slides_list`    — names + descriptions of every slide type.
 *    - `slides_create`  — render a deck → `.pptx`.
 *    The active template starts as the one passed at construction time, but
 *    swaps to a deck's template after any of the code-gen tools succeed
 *    (`slides_create_deck`, `slides_add_component`, `slides_edit_component`,
 *    `slides_build`). That's how an agent's hand-written components become
 *    addressable through `slides_create`.
 *
 * 2. **One tool per slide type** in the initial template, named
 *    `<toolPrefix><snake_case>` (default prefix `slides_add_`). These are
 *    derived at construction; they don't dynamically appear for
 *    agent-written components — those go straight through `slides_create`.
 *
 * 3. **Code-gen tools** for agent-authored slides:
 *    - `slides_create_deck`     — scaffold a deck project.
 *    - `slides_add_component`   — write a new `.tsx` slide.
 *    - `slides_edit_component`  — overwrite a slide's source.
 *    - `slides_build`           — type-check the deck.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { z } from 'zod';
import type { ZodError } from 'zod';
import {
  addComponent,
  buildDeck,
  createDeck,
  editComponent,
  type ComponentOpResult,
} from '../code-gen/index.js';
import type { SlidesRuntime, Template } from '../core/index.js';
import { errorResult, zodErrorResult } from './errors.js';
import { renderSlides } from './render.js';
import { deriveComponentTools, type DerivedTool } from './schema.js';

/** Configuration accepted by createSlideServer. */
export interface SlideServerConfig {
  /** The initial template (slide-component vocabulary + tokens). */
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
   */
  readonly toolPrefix?: string;
}

/** Options accepted by server.start. */
export type StartOptions = { readonly transport: 'stdio' };

/** The handle returned by createSlideServer. */
export interface SlideServer {
  /** The underlying MCP server. Exposed for advanced callers. */
  readonly mcp: McpServer;
  /** Tool definitions derived from the initial template. */
  readonly tools: ReadonlyArray<DerivedTool>;
  /** The currently active template (initial OR a loaded deck). */
  readonly activeTemplate: Template;
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

  const state: ServerState = { active: template, activeDeckPath: undefined };

  const mcp = new McpServer(serverInfo);
  const tools = deriveComponentTools(template, config.toolPrefix);

  registerListTool(mcp, state, tools);
  registerComponentTools(mcp, tools);
  registerCreateTool(mcp, runtime, state);
  registerCodeGenTools(mcp, state);

  return {
    mcp,
    tools,
    get activeTemplate() {
      return state.active;
    },
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

/** Internal mutable state held by the server. */
type ServerState = {
  active: Template;
  activeDeckPath: string | undefined;
};

// ---------------------------------------------------------------------------
// slides_list
// ---------------------------------------------------------------------------

const LIST_OUTPUT_SHAPE = {
  template: z.string().describe('The name of the active template.'),
  deckPath: z
    .string()
    .nullable()
    .describe('The deck project the active template was loaded from, if any.'),
  slides: z
    .array(
      z.object({
        name: z.string().describe('Slide-type name, e.g. "Cover".'),
        toolName: z
          .string()
          .nullable()
          .describe(
            'Pre-registered MCP tool name for this slide type, or null for agent-written components ' +
              '(those skip the per-type tool and go straight through slides_create).',
          ),
        description: z.string().describe('When to use this slide type.'),
      }),
    )
    .describe('Every slide type the active template exposes.'),
};

const registerListTool = (
  mcp: McpServer,
  state: ServerState,
  initialTools: ReadonlyArray<DerivedTool>,
): void => {
  mcp.registerTool(
    'slides_list',
    {
      description:
        "List every slide type the active template supports. Reflects whichever deck the server has loaded most recently; if none, it's the template the server was started with. " +
        'Call once at the start of a session, and again after any code-gen operation, to learn the current surface.',
      outputSchema: LIST_OUTPUT_SHAPE,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      const active = state.active;
      const toolByName = new Map(initialTools.map((t) => [t.componentName, t.name]));
      const slides = Object.entries(active.components).map(([name, c]) => ({
        name,
        toolName: toolByName.get(name) ?? null,
        description: c.description,
      }));
      const initialBullets = slides
        .filter((s) => s.toolName !== null)
        .map((s) => `  • ${s.name} (${s.toolName}) — ${s.description}`);
      const customBullets = slides
        .filter((s) => s.toolName === null)
        .map((s) => `  • ${s.name} — ${s.description}`);
      const lines = [`Template: ${active.name}`];
      if (state.activeDeckPath) lines.push(`Deck:     ${state.activeDeckPath}`);
      lines.push('');
      lines.push('Available slide types:');
      lines.push(...(initialBullets.length > 0 ? initialBullets : ['  (none from the template)']));
      if (customBullets.length > 0) {
        lines.push('');
        lines.push('Agent-written slide types (use these via slides_create directly):');
        lines.push(...customBullets);
      }
      return {
        content: [{ type: 'text' as const, text: lines.join('\n') }],
        structuredContent: {
          template: active.name,
          deckPath: state.activeDeckPath ?? null,
          slides,
        },
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

const registerCreateTool = (mcp: McpServer, runtime: SlidesRuntime, state: ServerState): void => {
  mcp.registerTool(
    'slides_create',
    {
      description:
        'Generate a .pptx from a sequence of slide specs and write it to disk. ' +
        'Uses whichever template the server has active — call slides_list to inspect it. ' +
        'Each spec is { component, props }. Returns the absolute file path.',
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
        template: state.active,
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

// ---------------------------------------------------------------------------
// Code-gen tools (create_deck / add_component / edit_component / build)
// ---------------------------------------------------------------------------

const CREATE_DECK_INPUT_SHAPE = {
  dir: z
    .string()
    .min(1)
    .describe(
      'Target directory for the deck project. May be relative (resolved against cwd) ' +
        'or absolute. Created if missing; must be empty if it exists.',
    ),
  name: z
    .string()
    .min(1)
    .optional()
    .describe('Optional deck name. Defaults to the directory name (kebab-cased).'),
};

const ADD_COMPONENT_INPUT_SHAPE = {
  deckPath: z
    .string()
    .min(1)
    .describe('Absolute path to the deck project (returned by slides_create_deck).'),
  name: z.string().min(1).describe('PascalCase component name. Example: "RevenueChart".'),
  source: z
    .string()
    .min(1)
    .describe(
      'Full TSX source. Must `import { Slide, Box, Text } from "@sanity-labs/slides"` ' +
        'and export both a Zod schema (`<Name>Schema`) and a React component (`<Name>`). ' +
        'See the SKILL for the canonical shape.',
    ),
};

const EDIT_COMPONENT_INPUT_SHAPE = ADD_COMPONENT_INPUT_SHAPE;

const BUILD_INPUT_SHAPE = {
  deckPath: z.string().min(1).describe('Absolute path to the deck project.'),
};

const CODE_GEN_OUTPUT_SHAPE = {
  deckPath: z.string(),
  template: z
    .string()
    .nullable()
    .describe('Name of the deck template after the operation, or null if it failed to load.'),
  registeredComponents: z
    .array(z.string())
    .describe('Names of every slide type registered in the deck after this operation.'),
  typecheck: z
    .object({
      ok: z.boolean(),
      summary: z.string(),
    })
    .describe('Typecheck status. If not ok, summary contains formatted errors.'),
};

const registerCodeGenTools = (mcp: McpServer, state: ServerState): void => {
  mcp.registerTool(
    'slides_create_deck',
    {
      description:
        'Scaffold an agent-writable deck project at the given directory. Returns the absolute deck path. ' +
        "After this call the server's active template swaps to the new deck — slides_list shows its components (initially empty), and slides_create renders from it. " +
        'Templates stay read-only; the deck is where the agent writes custom slide components.',
      inputSchema: CREATE_DECK_INPUT_SHAPE,
      outputSchema: CODE_GEN_OUTPUT_SHAPE,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ dir, name }) => {
      try {
        const result = await createDeck({ dir, ...(name ? { name } : {}) });
        state.active = result.template;
        state.activeDeckPath = result.deckPath;
        return successResult({
          deckPath: result.deckPath,
          template: result.template,
          typecheck: { ok: true, summary: 'Scaffolded a fresh deck.' },
        });
      } catch (err) {
        return errorResult('create_deck_failed', errMessage(err));
      }
    },
  );

  mcp.registerTool(
    'slides_add_component',
    {
      description:
        'Write a new TSX slide component into the deck and register it. The source must export `<Name>` (React component) and `<Name>Schema` (Zod). On success the active template is reloaded so the new type is visible to slides_list and slides_create. If the typecheck fails, the file is kept on disk and the diagnostics are returned — call slides_edit_component to fix the source, then slides_build (or another slides_edit_component) to re-check.',
      inputSchema: ADD_COMPONENT_INPUT_SHAPE,
      outputSchema: CODE_GEN_OUTPUT_SHAPE,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ deckPath, name, source }) => {
      try {
        const result = await addComponent({ deckPath, name, source });
        adoptOpResult(state, result);
        return successResult(result);
      } catch (err) {
        return errorResult('add_component_failed', errMessage(err));
      }
    },
  );

  mcp.registerTool(
    'slides_edit_component',
    {
      description:
        "Overwrite an existing component's TSX source. Useful for fixing typecheck errors from slides_add_component or refining a slide after seeing the rendered output.",
      inputSchema: EDIT_COMPONENT_INPUT_SHAPE,
      outputSchema: CODE_GEN_OUTPUT_SHAPE,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ deckPath, name, source }) => {
      try {
        const result = await editComponent({ deckPath, name, source });
        adoptOpResult(state, result);
        return successResult(result);
      } catch (err) {
        return errorResult('edit_component_failed', errMessage(err));
      }
    },
  );

  mcp.registerTool(
    'slides_build',
    {
      description:
        'Run the deck through tsc and return formatted diagnostics. Call this between code-gen operations to confirm the deck is in a renderable state. No files are written.',
      inputSchema: BUILD_INPUT_SHAPE,
      outputSchema: CODE_GEN_OUTPUT_SHAPE,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ deckPath }) => {
      try {
        const result = await buildDeck(deckPath);
        adoptOpResult(state, result);
        return successResult(result);
      } catch (err) {
        return errorResult('build_failed', errMessage(err));
      }
    },
  );
};

const adoptOpResult = (state: ServerState, result: ComponentOpResult): void => {
  state.activeDeckPath = result.deckPath;
  if (result.template) state.active = result.template;
};

const successResult = (
  input:
    | { deckPath: string; template: Template; typecheck: { ok: boolean; summary: string } }
    | ComponentOpResult,
): {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent: Record<string, unknown>;
} => {
  const deckPath = input.deckPath;
  const template = (input as { template?: Template }).template;
  const typecheck = input.typecheck;
  const registered = template ? Object.keys(template.components) : [];
  const text = [
    `${typecheck.summary}`,
    '',
    `Deck:     ${deckPath}`,
    template ? `Template: ${template.name}` : 'Template: (not loaded — fix typecheck errors first)',
    registered.length > 0
      ? `Registered components: ${registered.join(', ')}`
      : 'Registered components: (none yet)',
  ].join('\n');
  return {
    content: [{ type: 'text', text }],
    structuredContent: {
      deckPath,
      template: template?.name ?? null,
      registeredComponents: registered,
      typecheck: { ok: typecheck.ok, summary: typecheck.summary },
    },
  };
};

const errMessage = (err: unknown): string => (err instanceof Error ? err.message : String(err));
