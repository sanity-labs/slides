/**
 * The template-agnostic MCP server framework.
 *
 * Curated set of seven tools, organised around two outcomes the agent ever
 * wants to achieve:
 *
 * **Pick a slide type from the template and render** (the "quick path"):
 *
 *   - `slides_list`     — discover which slide types are available.
 *   - `slides_validate` — pre-validate one slide's props against its schema.
 *   - `slides_create`   — render a sequence of slide specs to `.pptx`.
 *
 * **Write custom slide components** (the "code-gen power path"):
 *
 *   - `slides_create_deck`     — scaffold a writable deck project.
 *   - `slides_add_component`   — write a new `.tsx` slide + register it.
 *   - `slides_edit_component`  — overwrite an existing component's source.
 *   - `slides_build`           — re-run tsc on the deck.
 *
 * Tools share a single mutable `activeTemplate` ref: the template the
 * server started with, or whichever deck was most recently touched by a
 * code-gen tool. This is how agent-written components become addressable
 * through `slides_list` / `slides_validate` / `slides_create` without
 * registering new tools per component.
 *
 * Why a single `slides_validate` instead of one `slides_add_<type>` tool
 * per slide type: per-type tools load upfront into every MCP session and
 * burn ~200 tokens each in tool definitions. A template with 20 slide
 * types would cost ~4k tokens at session start. The Anthropic guidance
 * (Writing tools for agents, Sep 2025; Code execution with MCP, Nov 2025)
 * is to keep tool counts low and use schema-on-demand patterns — that's
 * what `slides_list({ detail: 'detailed' })` is for.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { z } from 'zod';
import type { ZodError } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
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
}

/** Options accepted by server.start. */
export type StartOptions = { readonly transport: 'stdio' };

/** The handle returned by createSlideServer. */
export interface SlideServer {
  /** The underlying MCP server. Exposed for advanced callers. */
  readonly mcp: McpServer;
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
    name: 'sanity-labs-slides:' + template.name,
    version: '0.1.0',
  };

  const state: ServerState = { active: template, activeDeckPath: undefined };

  const mcp = new McpServer(serverInfo);

  registerListTool(mcp, state);
  registerValidateTool(mcp, state);
  registerCreateTool(mcp, runtime, state);
  registerCodeGenTools(mcp, state);

  return {
    mcp,
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

const LIST_INPUT_SHAPE = {
  detail: z
    .enum(['concise', 'detailed'])
    .optional()
    .describe(
      'How much to return per slide type. ' +
        '"concise" (default): just name + description, ~30 tokens per entry. ' +
        '"detailed": adds the full JSON Schema for each slide type\'s props. ' +
        'Use "detailed" right before composing a slides_create call so you ' +
        'can fill props correctly without guessing.',
    ),
};

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
        description: z.string().describe('When to use this slide type.'),
        inputJsonSchema: z
          .record(z.unknown())
          .optional()
          .describe(
            "JSON Schema for this slide type's props. Only present when " +
              'the caller passed detail="detailed".',
          ),
      }),
    )
    .describe('Every slide type the active template exposes.'),
};

const registerListTool = (mcp: McpServer, state: ServerState): void => {
  mcp.registerTool(
    'slides_list',
    {
      title: 'List slide types',
      description:
        'List every slide type the active template supports. ' +
        'Reflects whichever deck the server has loaded most recently; if none, ' +
        "it's the template the server was started with. " +
        "Call once at the start of a session to learn what's available, and " +
        'again after any code-gen operation (slides_create_deck, slides_add_component, ' +
        'slides_edit_component) to refresh. ' +
        'Pass `detail: "detailed"` to also get the JSON Schema for each slide ' +
        "type's props — useful right before composing a slides_create call.",
      inputSchema: LIST_INPUT_SHAPE,
      outputSchema: LIST_OUTPUT_SHAPE,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ detail }) => {
      const active = state.active;
      const wantSchemas = detail === 'detailed';
      const slides = Object.entries(active.components).map(([name, c]) => ({
        name,
        description: c.description,
        ...(wantSchemas ? { inputJsonSchema: zodToJsonSchema(c.schema, JSON_SCHEMA_OPTIONS) } : {}),
      }));
      const lines = [`Template: ${active.name}`];
      if (state.activeDeckPath) lines.push(`Deck:     ${state.activeDeckPath}`);
      lines.push('');
      lines.push('Available slide types:');
      if (slides.length === 0) {
        lines.push('  (none — call slides_add_component to add one.)');
      } else {
        for (const s of slides) lines.push(`  • ${s.name} — ${s.description}`);
      }
      if (!wantSchemas && slides.length > 0) {
        lines.push('');
        lines.push(
          'Call slides_list with detail="detailed" to see the JSON Schema for each ' +
            "slide type's props.",
        );
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
// slides_validate
// ---------------------------------------------------------------------------

const VALIDATE_INPUT_SHAPE = {
  component: z.string().min(1).describe('Slide-type name from slides_list, e.g. "Cover".'),
  props: z.record(z.unknown()).describe("Props matching the slide type's JSON Schema."),
};

const VALIDATE_OUTPUT_SHAPE = {
  slide: z
    .object({
      component: z.string(),
      props: z.record(z.unknown()),
    })
    .describe('A single validated slide spec, ready to be passed to slides_create.'),
};

const registerValidateTool = (mcp: McpServer, state: ServerState): void => {
  mcp.registerTool(
    'slides_validate',
    {
      title: 'Validate a single slide',
      description:
        "Validate one { component, props } pair against the active template's schema " +
        'for that component. Optional but useful when composing a complex slide (grids, ' +
        'lists, charts) — it catches schema errors with field-level paths before you ' +
        'pay the cost of a full slides_create. ' +
        'Returns the validated slide spec on success; returns a structured error with ' +
        '`issues[]` (each carrying a `path` and `message`) on failure. ' +
        'You do not need to call this if you have already checked props against the ' +
        'inputJsonSchema from slides_list(detail="detailed").',
      inputSchema: VALIDATE_INPUT_SHAPE,
      outputSchema: VALIDATE_OUTPUT_SHAPE,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ component, props }) => {
      const active = state.active;
      const entry = active.components[component];
      if (!entry) {
        const known = Object.keys(active.components).sort().join(', ') || '(none)';
        return errorResult(
          'unknown_component',
          `Unknown slide type "${component}". Known types in template "${active.name}": ${known}. ` +
            `Call slides_list to refresh.`,
        );
      }
      const parsed = entry.schema.safeParse(props);
      if (!parsed.success) {
        return zodErrorResult(
          `Validation error in slides_validate props for "${component}":`,
          parsed.error as ZodError,
          'Fix the listed fields and call slides_validate again, or pass the corrected ' +
            'props directly to slides_create — it runs the same validation.',
        );
      }
      return {
        content: [
          {
            type: 'text' as const,
            text:
              `Validated ${component} props. ` +
              `Pass { component: "${component}", props: <these> } as one entry of ` +
              `slides_create.slides.`,
          },
        ],
        structuredContent: { slide: { component, props: parsed.data } },
      };
    },
  );
};

// ---------------------------------------------------------------------------
// slides_create
// ---------------------------------------------------------------------------

const SLIDE_SPEC_SCHEMA = z
  .object({
    component: z.string().min(1).describe('The slide-type name, e.g. "Cover".'),
    props: z
      .record(z.unknown())
      .describe("Props matching that slide type's input schema (see slides_list)."),
  })
  .describe('One slide to add.');

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
      title: 'Render deck to .pptx',
      description:
        'Generate a .pptx from a sequence of slide specs and write it to disk. ' +
        'Uses whichever template the server has active — call slides_list to inspect it. ' +
        'Each spec is { component, props }. ' +
        'Returns the absolute file path; surface it to the user verbatim. ' +
        'Validation runs end-to-end before any file is written; on a per-slide schema ' +
        'failure the response includes `code: "validation_error"` and an `issues[]` array.',
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
      'Full TSX source. Must `import { Slide, Box, Text } from "@sanity-labs/slides"`, ' +
        '`import { z } from "zod"`, and `import type { ReactElement } from "react"` only — ' +
        'no other imports are allowed and the file will be rejected if it tries. ' +
        'Must export both a Zod schema (`<Name>Schema`) and a React component (`<Name>`). ' +
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
      title: 'Create a deck project',
      description:
        'Scaffold an agent-writable deck project at the given directory. ' +
        'Returns the absolute deck path. ' +
        "After this call the server's active template swaps to the new deck — " +
        'slides_list shows its components (initially empty), slides_validate validates ' +
        'against the deck schema, and slides_create renders from it. ' +
        'Templates stay read-only; the deck is where the agent writes custom slide ' +
        'components.',
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
      title: 'Add slide component',
      description:
        'Write a new TSX slide component into the deck and register it. ' +
        'The source must export `<Name>` (React component) and `<Name>Schema` (Zod). ' +
        'Imports are restricted to @sanity-labs/slides, react, and zod; any other ' +
        'import causes immediate rejection (no file is written). ' +
        'On success the active template is reloaded so the new type is visible to ' +
        'slides_list, slides_validate, and slides_create. ' +
        'If the typecheck fails, the file is kept on disk and the diagnostics are ' +
        'returned — call slides_edit_component to fix the source.',
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
      title: 'Edit slide component',
      description:
        "Overwrite an existing component's TSX source. " +
        'Useful for fixing typecheck errors from slides_add_component, refining a slide ' +
        'after rendering, or adjusting the schema. ' +
        'Imports are restricted to the same allowlist as slides_add_component. ' +
        'On success the active template is reloaded so the updated schema is visible to ' +
        'slides_list / slides_validate. ' +
        'On typecheck failure the file is kept on disk and the diagnostics are returned.',
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
      title: 'Type-check the deck',
      description:
        'Run the deck through tsc and return formatted diagnostics. ' +
        'No files are written. ' +
        'Call this between code-gen operations to confirm the deck is in a renderable ' +
        'state; not necessary right after slides_add_component or slides_edit_component, ' +
        'which already typecheck. ' +
        'Returns up to 20 diagnostics, each carrying file/line/code/message; cascades are ' +
        'truncated with a hint to fix listed errors first.',
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

/**
 * Options passed to `zod-to-json-schema` for slides_list(detail="detailed").
 *
 * - `target: 'jsonSchema7'` matches the dialect MCP servers emit and what the
 *   SDK produces internally for tool input schemas.
 * - `$refStrategy: 'none'` inlines all sub-schemas — easier for the agent to
 *   read in one pass, and slide-prop schemas are usually shallow.
 */
const JSON_SCHEMA_OPTIONS = {
  target: 'jsonSchema7',
  $refStrategy: 'none',
} as const;
