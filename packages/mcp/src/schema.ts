/**
 * Schema-derivation helpers.
 *
 * Two things happen here:
 *
 * 1. **Template component → MCP tool definition.** We iterate `brand.components`
 *    and return a list of `DerivedTool` records — each one is everything the
 *    server needs to call `McpServer.registerTool`.
 *
 * 2. **Zod → JSON Schema conversion.** The MCP wire format uses JSON Schema
 *    for tool input/output. The SDK's `registerTool` accepts Zod and converts
 *    internally; we ALSO produce JSON Schema explicitly via `zod-to-json-schema`
 *    so callers (and unit tests) can inspect the derived shape without
 *    spinning up a server.
 */

import { zodToJsonSchema, type Options as ZodToJsonSchemaOptions } from 'zod-to-json-schema';

import type { z } from 'zod';
import type { Template, TemplateComponent } from 'react-pptx';
import { componentToolName } from './naming.js';

/** A JSON Schema document. We keep this loose; consumers can refine if needed. */
export type JsonSchema = Record<string, unknown>;

/**
 * Everything the server needs to register a single brand-component-backed tool.
 *
 * Exposed as part of the package's public surface so callers (CLI smoke tests,
 * doc generators, anything inspecting the brand) can list the derived tools
 * without instantiating a server.
 */
export interface DerivedTool {
  /** The MCP tool name, e.g. `slides_add_cover`. */
  readonly name: string;
  /** The tool description (LLM-facing, taken from the brand component). */
  readonly description: string;
  /** The input shape. `Record<string, ZodType>` is what the SDK expects. */
  readonly inputShape: z.ZodRawShape;
  /** The Zod object schema, retained for runtime validation in tool handlers. */
  readonly inputSchema: z.ZodObject<z.ZodRawShape>;
  /** JSON Schema representation of the input, for inspection. */
  readonly inputJsonSchema: JsonSchema;
  /** Stable component name from the brand (e.g., `Cover`). */
  readonly componentName: string;
}

/**
 * Convert a single brand component to a derived-tool record.
 *
 * Pure function: same component → same DerivedTool. The conversion of
 * `schema` to JSON Schema runs through `zod-to-json-schema`, which produces
 * Draft-07 by default (matching the MCP wire format).
 *
 * `toolPrefix` defaults to `'slides_add_'`. Servers that want a different
 * verb or service prefix (e.g., `'report_add_'`) override it.
 */
export const componentToTool = (
  componentName: string,
  component: TemplateComponent,
  toolPrefix?: string,
): DerivedTool => {
  const inputShape = component.schema.shape;
  const inputJsonSchema = zodToJsonSchema(component.schema, JSON_SCHEMA_OPTIONS);
  return {
    name: componentToolName(componentName, toolPrefix),
    description: component.description,
    inputShape,
    inputSchema: component.schema,
    inputJsonSchema,
    componentName,
  };
};

/** Derive every per-component tool from a brand. */
export const deriveComponentTools = (brand: Template, toolPrefix?: string): DerivedTool[] =>
  Object.entries(brand.components).map(([name, component]) =>
    componentToTool(name, component, toolPrefix),
  );

/**
 * Options passed to `zod-to-json-schema`.
 *
 * - `target: 'jsonSchema7'` matches the dialect MCP servers emit (and what the
 *   official SDK produces internally when given a Zod schema).
 * - `$refStrategy: 'none'` inlines all sub-schemas — simpler for LLMs to read
 *   in tool descriptions, and the schemas are typically shallow so the inline
 *   bloat is negligible.
 */
const JSON_SCHEMA_OPTIONS: Partial<ZodToJsonSchemaOptions> = {
  target: 'jsonSchema7',
  $refStrategy: 'none',
};
