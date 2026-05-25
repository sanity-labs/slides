/**
 * Error formatting for MCP tool responses.
 *
 * Per the MCP spec (2025-06-18 / Tools) and SEP-1303: tool errors are
 * returned **inside the result with `isError: true`** rather than as
 * JSON-RPC errors, with messages that include actionable next steps so
 * the LLM can self-correct.
 *
 * One subtlety the spec is firm about: when a tool declares an
 * `outputSchema`, any `structuredContent` it returns MUST conform to that
 * schema. There is no carve-out for error responses. The SDK enforces
 * this with `data must have required property '...'` errors that surface
 * as -32602 JSON-RPC errors to the client — meaning agents can't even
 * read the helpful error message we tried to send. The fix is to drop
 * `structuredContent` entirely on errors and put the structured payload
 * inline in the text content as a fenced JSON block. Clients that want
 * to inspect it can parse the block out; LLMs read it directly.
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
  [extra: string]: unknown;
};

/** Structured payload an error message carries (exposed for inspection / tests). */
export interface ToolErrorPayload {
  /** Stable error code, e.g., `validation_error`, `unknown_component`. */
  readonly code: string;
  /** Human-readable message including suggested next steps. */
  readonly message: string;
  /** For validation errors: the per-field issues. */
  readonly issues?: ReadonlyArray<{ readonly path: string; readonly message: string }>;
}

/**
 * Marker line bracketing the JSON block we append to error responses.
 * Stable so clients can split error text into a human-readable header and
 * a machine-readable trailer if they want to. Tests use {@link parseErrorPayload}.
 */
const PAYLOAD_OPEN = '<!-- error-payload';
const PAYLOAD_CLOSE = 'error-payload -->';

/** Format a single Zod issue as a one-line bullet for inclusion in an error message. */
export const formatZodIssue = (issue: ZodIssue): { path: string; message: string } => ({
  path: issue.path.length > 0 ? issue.path.map(String).join('.') : '(root)',
  message: issue.message,
});

/**
 * Build a tool-error result for a Zod validation failure.
 *
 * Text is structured so an LLM can read off (a) which fields failed,
 * (b) why, and (c) the next-step hint. A fenced JSON payload at the end
 * carries the same info in machine-readable form for callers that want to
 * inspect it (see `parseErrorPayload`).
 */
export const zodErrorResult = (context: string, error: ZodError, hint: string): ToolErrorResult => {
  const issues = error.issues.map(formatZodIssue);
  const bullets = issues.map((i) => `  • ${i.path}: ${i.message}`).join('\n');
  const text = `${context}\n${bullets}\n${hint}`;
  return buildError({ code: 'validation_error', message: text, issues }, text);
};

/** Build a generic actionable tool error, optionally carrying field-level issues. */
export const errorResult = (
  code: string,
  message: string,
  issues?: ReadonlyArray<{ readonly path: string; readonly message: string }>,
): ToolErrorResult =>
  buildError(issues === undefined ? { code, message } : { code, message, issues }, message);

/**
 * Parse a payload-block trailer back out of an error response text. Returns
 * `undefined` if no payload block is present. Used by tests; clients can
 * use it too.
 */
export const parseErrorPayload = (text: string): ToolErrorPayload | undefined => {
  const start = text.indexOf(PAYLOAD_OPEN);
  if (start === -1) return undefined;
  const end = text.indexOf(PAYLOAD_CLOSE, start);
  if (end === -1) return undefined;
  const json = text.slice(start + PAYLOAD_OPEN.length, end).trim();
  try {
    return JSON.parse(json) as ToolErrorPayload;
  } catch {
    return undefined;
  }
};

const buildError = (payload: ToolErrorPayload, headerText: string): ToolErrorResult => {
  const text = `${headerText}\n\n${PAYLOAD_OPEN}\n${JSON.stringify(payload)}\n${PAYLOAD_CLOSE}`;
  return {
    isError: true,
    content: [{ type: 'text', text }],
  };
};
