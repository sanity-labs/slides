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
  patchComponent,
  type ComponentOpResult,
} from '../code-gen/index.js';
import {
  CANVAS_16_9,
  FakeSlidesRuntime,
  renderToOps,
  type SlidesRuntime,
  type Template,
} from '../core/index.js';
import { errorResult, zodErrorResult } from './errors.js';
import { renderSlidesToPng } from './preview-render.js';
import { renderSlides, type SlideSpec } from './render.js';

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

  const state: ServerState = { base: template, deck: undefined };

  const mcp = new McpServer(serverInfo);

  registerListTool(mcp, state);
  registerGuidelinesTool(mcp, state);
  registerValidateTool(mcp, state);
  registerCreateTool(mcp, runtime, state);
  registerPreviewTool(mcp, state);
  registerCodeGenTools(mcp, state);

  return {
    mcp,
    get activeTemplate() {
      return effectiveTemplate(state);
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

/**
 * Internal mutable state held by the server.
 *
 * `base` is the brand template the server was started with — it stays
 * untouched for the lifetime of the process. `deck` is whatever
 * agent-authored deck is currently loaded (if any). Tools render against
 * the *effective* template, which is `base` plus the deck's components
 * layered on top — see {@link effectiveTemplate}.
 */
type ServerState = {
  readonly base: Template;
  deck: { readonly template: Template; readonly path: string } | undefined;
};

/**
 * Merge the brand template's slide vocabulary with whatever deck is
 * currently loaded. Deck components shadow brand components on name
 * collision (lets the agent override a brand slide if the user asks
 * for a variant). Brand fonts / colors / canvas always win — the deck
 * never overrides the brand lock.
 */
const effectiveTemplate = (state: ServerState): Template => {
  if (!state.deck) return state.base;
  return {
    ...state.base,
    components: { ...state.base.components, ...state.deck.template.components },
  };
};

/** Names of every component contributed by the loaded deck (empty when no deck). */
const deckComponentNames = (state: ServerState): ReadonlySet<string> =>
  new Set(state.deck ? Object.keys(state.deck.template.components) : []);

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
        source: z
          .enum(['template', 'deck'])
          .describe(
            'Where this slide type comes from. "template" entries live in the read-only ' +
              'brand template; "deck" entries were written into the active deck by ' +
              'slides_add_component and can be modified with slides_edit_component.',
          ),
        inputJsonSchema: z
          .record(z.unknown())
          .optional()
          .describe(
            "JSON Schema for this slide type's props. Only present when " +
              'the caller passed detail="detailed".',
          ),
      }),
    )
    .describe('Every slide type the active template exposes (brand + deck merged).'),
  additionalImports: z
    .array(z.string())
    .optional()
    .describe(
      'Extra package specifiers the active template permits in agent-authored ' +
        'Tier-2 components, on top of the base brand-lock (@sanity-labs/slides, ' +
        '@sanity-labs/slides/media, react, zod). Use them to reach for the ' +
        "template's own chrome helpers (e.g. a `<BrandSlide>` wrapper) so custom " +
        'slides match the curated ones visually. Only present when ' +
        'detail="detailed" and the template opts in.',
    ),
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
      const effective = effectiveTemplate(state);
      const fromDeck = deckComponentNames(state);
      const wantSchemas = detail === 'detailed';
      const slides = Object.entries(effective.components).map(([name, c]) => ({
        name,
        description: c.description,
        source: (fromDeck.has(name) ? 'deck' : 'template') as 'template' | 'deck',
        ...(wantSchemas ? { inputJsonSchema: zodToJsonSchema(c.schema, JSON_SCHEMA_OPTIONS) } : {}),
      }));
      const extras = effective.additionalImportAllowlist ?? [];
      const lines = [`Template: ${effective.name}`];
      if (state.deck) lines.push(`Deck:     ${state.deck.path}`);
      lines.push('');
      lines.push('Available slide types:');
      if (slides.length === 0) {
        lines.push('  (none — call slides_add_component to add one.)');
      } else {
        for (const s of slides) {
          const tag = s.source === 'deck' ? ' [deck]' : '';
          lines.push(`  • ${s.name}${tag} — ${s.description}`);
        }
      }
      if (wantSchemas && extras.length > 0) {
        lines.push('');
        lines.push(
          'Extra imports permitted in agent-authored components (on top of the base allowlist):',
        );
        for (const ext of extras) lines.push(`  • ${ext}`);
      }
      if (!wantSchemas && slides.length > 0) {
        lines.push('');
        lines.push(
          'Call slides_list with detail="detailed" to see the JSON Schema for each ' +
            "slide type's props.",
        );
      }
      if (effective.skill) {
        lines.push('');
        lines.push(
          'This template ships design guidelines. Call slides_guidelines to read them ' +
            'before composing your first slide.',
        );
      }
      return {
        content: [{ type: 'text' as const, text: lines.join('\n') }],
        structuredContent: {
          template: effective.name,
          deckPath: state.deck?.path ?? null,
          slides,
          ...(wantSchemas && extras.length > 0 ? { additionalImports: [...extras] } : {}),
        },
      };
    },
  );
};

// ---------------------------------------------------------------------------
// slides_guidelines
// ---------------------------------------------------------------------------

const GUIDELINES_INPUT_SHAPE = {};

const GUIDELINES_OUTPUT_SHAPE = {
  template: z.string(),
  hasGuidelines: z.boolean(),
  guidelines: z.string().nullable(),
};

const registerGuidelinesTool = (mcp: McpServer, state: ServerState): void => {
  mcp.registerTool(
    'slides_guidelines',
    {
      title: 'Template design guidelines',
      description:
        "Read the active template's design guidelines — brand rules, component usage " +
        'patterns, and visual constraints that the template author wants you to follow. ' +
        'Call once at the start of a session. Returns null when the template has no ' +
        'guidelines.',
      inputSchema: GUIDELINES_INPUT_SHAPE,
      outputSchema: GUIDELINES_OUTPUT_SHAPE,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      const effective = effectiveTemplate(state);
      const skill = effective.skill ?? null;
      const hasGuidelines = skill !== null;

      const lines: string[] = [];
      lines.push(`Template: ${effective.name}`);
      if (hasGuidelines) {
        lines.push('');
        lines.push(skill);
      } else {
        lines.push('');
        lines.push('No template-specific design guidelines are available.');
        lines.push('Follow the general SKILL guidance for this session.');
      }

      return {
        content: [{ type: 'text' as const, text: lines.join('\n') }],
        structuredContent: {
          template: effective.name,
          hasGuidelines,
          guidelines: skill,
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
      const effective = effectiveTemplate(state);
      const entry = effective.components[component];
      if (!entry) {
        const known = Object.keys(effective.components).sort().join(', ') || '(none)';
        return errorResult(
          'unknown_component',
          `Unknown slide type "${component}". Known types in template "${effective.name}": ${known}. ` +
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
        template: effectiveTemplate(state),
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
// slides_preview
// ---------------------------------------------------------------------------

const PREVIEW_INPUT_SHAPE = {
  slides: z
    .array(SLIDE_SPEC_SCHEMA)
    .min(1)
    .describe('The slides to preview, same format as slides_create.'),
  slideIndices: z
    .array(z.number().int().nonnegative())
    .optional()
    .describe(
      'Optional 0-based indices of which slides to preview. ' +
        'When omitted, previews all slides. Use this to preview only the slides you changed ' +
        'instead of re-rendering the entire deck.',
    ),
};

const PREVIEW_OUTPUT_SHAPE = {
  slideCount: z.number().int().nonnegative(),
};

const registerPreviewTool = (mcp: McpServer, state: ServerState): void => {
  mcp.registerTool(
    'slides_preview',
    {
      title: 'Preview slides as images',
      description:
        'Render a list of slide specs to PNG images and return them inline. ' +
        'Use this after slides_create to visually review what you produced, or ' +
        'before slides_create to check layout before writing the .pptx. ' +
        'Same input format as slides_create (minus the title). ' +
        'Returns one image content block per slide.',
      inputSchema: PREVIEW_INPUT_SHAPE,
      outputSchema: PREVIEW_OUTPUT_SHAPE,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => {
      const template = effectiveTemplate(state);
      const specs: SlideSpec[] = input.slides;

      // Build the React tree from specs (same validation as slides_create)
      const { createElement, Fragment } = await import('react');
      const children: import('react').ReactNode[] = [];
      for (let i = 0; i < specs.length; i++) {
        const spec = specs[i];
        if (!spec) continue;
        const component = template.components[spec.component];
        if (!component) {
          return errorResult(
            'unknown_component',
            `slides_preview: slides[${i}].component "${spec.component}" not found.`,
          );
        }
        const parsed = component.schema.safeParse(spec.props);
        if (!parsed.success) {
          return zodErrorResult(
            `slides_preview: validation error in slides[${i}] ("${spec.component}"):`,
            parsed.error as ZodError,
            'Fix the listed fields.',
          );
        }
        children.push(createElement(component.component, { key: i, ...parsed.data }));
      }

      const tree = createElement(Fragment, null, ...children);

      try {
        const canvas = template.canvas;
        const result = renderToOps({ tree, template, deckId: null });
        const fake = new FakeSlidesRuntime();
        const { deckId } = await fake.createDeckFromMaster(template.name, 'preview');
        await fake.applyOps(deckId, result.ops);
        const deck = fake.getDeck(deckId);
        if (!deck) {
          return errorResult(
            'runtime_error',
            'slides_preview: FakeSlidesRuntime returned no deck.',
          );
        }

        const pngs = renderSlidesToPng(deck, canvas);
        const indices = input.slideIndices;
        const selectedPngs = indices ? pngs.filter((_, i) => indices.includes(i)) : pngs;
        const imageBlocks = selectedPngs.map((buf) => ({
          type: 'image' as const,
          data: buf.toString('base64'),
          mimeType: 'image/png' as const,
        }));

        const textBlock = {
          type: 'text' as const,
          text: `Rendered ${selectedPngs.length} of ${pngs.length} slide preview(s). Review the images above for layout, text overflow, color contrast, and brand compliance issues. Fix any problems before calling slides_create.`,
        };

        return {
          content: [...imageBlocks, textBlock],
          structuredContent: { slideCount: pngs.length },
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return errorResult('reconciler_error', `slides_preview render failed: ${message}`);
      }
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
        state.deck = { template: result.template, path: result.deckPath };
        return successResult({
          deckPath: result.deckPath,
          template: effectiveTemplate(state),
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
        'Imports are restricted to @sanity-labs/slides, @sanity-labs/slides/media, ' +
        'react, and zod (plus any extras the active template opts into via ' +
        '`additionalImportAllowlist`); any other import causes immediate ' +
        'rejection (no file is written). ' +
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
        const extras = effectiveTemplate(state).additionalImportAllowlist ?? [];
        const result = await addComponent({
          deckPath,
          name,
          source,
          extraImportAllowlist: extras,
        });
        adoptOpResult(state, result);
        return successResult({ ...result, template: effectiveTemplate(state) });
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
        const extras = effectiveTemplate(state).additionalImportAllowlist ?? [];
        const result = await editComponent({
          deckPath,
          name,
          source,
          extraImportAllowlist: extras,
        });
        adoptOpResult(state, result);
        return successResult({ ...result, template: effectiveTemplate(state) });
      } catch (err) {
        return errorResult('edit_component_failed', errMessage(err));
      }
    },
  );

  // slides_patch_component
  mcp.registerTool(
    'slides_patch_component',
    {
      title: 'Patch a component with search/replace',
      description:
        'Apply targeted search/replace patches to an existing component. ' +
        'Use this instead of slides_edit_component when you need to fix a className, ' +
        'change a prop default, or tweak a size \u2014 any change where rewriting the entire ' +
        'file would waste tokens. Each patch replaces the first occurrence of `old` with `new`. ' +
        'Fails fast if `old` is not found in the file.',
      inputSchema: {
        deckPath: z.string().min(1).describe('Path to the deck project.'),
        name: z.string().min(1).describe('PascalCase component name.'),
        patches: z
          .array(
            z.object({
              old: z.string().min(1).describe('Exact text to find in the component source.'),
              new: z.string().describe('Replacement text.'),
            }),
          )
          .min(1)
          .describe('Search/replace pairs. Applied sequentially; each replaces the first match.'),
      },
      outputSchema: CODE_GEN_OUTPUT_SHAPE,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ deckPath, name, patches }) => {
      try {
        const extras = effectiveTemplate(state).additionalImportAllowlist ?? [];
        const result = await patchComponent({
          deckPath,
          name,
          patches,
          extraImportAllowlist: extras,
        });
        adoptOpResult(state, result);
        return successResult({ ...result, template: effectiveTemplate(state) });
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
        const extras = effectiveTemplate(state).additionalImportAllowlist ?? [];
        const result = await buildDeck(deckPath, extras);
        adoptOpResult(state, result);
        return successResult({ ...result, template: effectiveTemplate(state) });
      } catch (err) {
        return errorResult('build_failed', errMessage(err));
      }
    },
  );
};

const adoptOpResult = (state: ServerState, result: ComponentOpResult): void => {
  if (result.template) {
    state.deck = { template: result.template, path: result.deckPath };
  } else if (state.deck === undefined || state.deck.path !== result.deckPath) {
    // Typecheck failed before we could reload the deck template, but we
    // still want subsequent calls to address the same deck path.
    state.deck = state.deck ?? {
      template: emptyDeckPlaceholder(result.deckPath),
      path: result.deckPath,
    };
  }
};

/**
 * When a code-gen op leaves the deck in a broken state (typecheck failed,
 * template didn't reload), we still want the server to remember which deck
 * the agent is working on so the next add/edit/build targets it. Use a
 * placeholder template carrying just the deck name — it'll be replaced on
 * the next successful reload.
 */
const emptyDeckPlaceholder = (deckPath: string): Template => ({
  name: deckPath.split('/').pop() ?? 'deck',
  canvas: CANVAS_16_9,
  fonts: { display: [], body: [], mono: [] },
  colors: {},
  typography: {},
  spacing: {},
  components: {},
});

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
