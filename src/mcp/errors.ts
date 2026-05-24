/**
 * Error formatting for MCP tool responses.
 *
 * Per SEP-1303 and the mcp-best-practices doc: tool errors are returned
 * **inside the result with `isError: true`** rather than as JSON-RPC errors,
 * with messages that include actionable next steps so the LLM can self-correct.
 */

import type { ZodError, ZodIssue } from 'zod';

/**
 * The shape of an MCP tool result error response (subset we use).
 *
 * Includes `[x: string]: unknown` so it's assignable to the SDK's wider
 * `CallToolResult` type (which carries an open index signature). The fields
 * we set are the only ones we depend on.
 */
export type ToolErrorResult = {
  isError: true;
  content: Array<{ type: 'text'; text: string }>;
  structuredContent: { error: ToolErrorPayload };
  [extra: string]: unknown;
};

/** Structured-content payload for tool errors, exposed for callers that want to inspect. */
export interface ToolErrorPayload {
  /** Stable error code, e.g., `validation_error`, `unknown_component`. */
  readonly code: string;
  /** Human-readable message including suggested next steps. */
  readonly message: string;
  /** For validation errors: the per-field issues. */
  readonly issues?: ReadonlyArray<{ readonly path: string; readonly message: string }>;
}

/** Format a single Zod issue as a one-line bullet for inclusion in an error message. */
export const formatZodIssue = (issue: ZodIssue): { path: string; message: string } => ({
  path: issue.path.length > 0 ? issue.path.map(String).join('.') : '(root)',
  message: issue.message,
});

/**
 * Build a tool-error result for a Zod validation failure.
 *
 * The text is structured so an LLM can read off (a) which fields failed,
 * (b) why, and (c) the next-step hint. The structuredContent carries the
 * machine-readable shape for non-LLM callers.
 */
export const zodErrorResult = (context: string, error: ZodError, hint: string): ToolErrorResult => {
  const issues = error.issues.map(formatZodIssue);
  const bullets = issues.map((i) => `  • ${i.path}: ${i.message}`).join('\n');
  const text = `${context}\n${bullets}\n${hint}`;
  return {
    isError: true,
    content: [{ type: 'text', text }],
    structuredContent: {
      error: {
        code: 'validation_error',
        message: text,
        issues,
      },
    },
  };
};

/** Build a generic actionable tool error, optionally carrying field-level issues. */
export const errorResult = (
  code: string,
  message: string,
  issues?: ReadonlyArray<{ readonly path: string; readonly message: string }>,
): ToolErrorResult => ({
  isError: true,
  content: [{ type: 'text', text: message }],
  structuredContent: {
    error: issues === undefined ? { code, message } : { code, message, issues },
  },
});
