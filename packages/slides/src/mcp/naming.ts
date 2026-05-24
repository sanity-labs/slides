/**
 * Tool-name conversion helpers.
 *
 * MCP tool names follow `{service}_{action}_{resource}` snake_case per
 * Anthropic's mcp-builder guidance. The default `service_action` prefix is
 * `slides_add_` since this framework's first target is slide decks; brand
 * servers can override via `SlideServerConfig.toolPrefix` when they ship a
 * different verb or service.
 *
 * Examples (with the default prefix):
 *   Cover           → slides_add_cover
 *   TwoColumn       → slides_add_two_column
 *   SectionDivider  → slides_add_section_divider
 */

/** The default tool-name prefix used for brand-component-derived tools. */
export const DEFAULT_COMPONENT_TOOL_PREFIX = 'slides_add_';

/**
 * Convert a PascalCase / camelCase identifier to snake_case.
 *
 * Behavior:
 * - `TwoColumn` → `two_column`
 * - `HTTPServer` → `http_server` (consecutive caps treated as a unit, then lowercased)
 * - `IOQueue` → `io_queue`
 * - already-snake or kebab text passes through with the kebabs replaced.
 *
 * Template components are expected to use PascalCase by convention, but this
 * function is forgiving so a brand author who slips can still get a stable
 * tool name without the framework refusing to start.
 */
export const toSnakeCase = (name: string): string =>
  name
    // boundary between a run of caps and a following Title-case word: `HTTPServer` → `HTTP_Server`
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    // boundary between lowercase/digit and a cap: `twoColumn` → `two_Column`
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/-/g, '_')
    .toLowerCase();

/**
 * Build the MCP tool name for a brand component.
 *
 * `prefix` defaults to `DEFAULT_COMPONENT_TOOL_PREFIX` (`slides_add_`).
 */
export const componentToolName = (
  componentName: string,
  prefix: string = DEFAULT_COMPONENT_TOOL_PREFIX,
): string => `${prefix}${toSnakeCase(componentName)}`;
