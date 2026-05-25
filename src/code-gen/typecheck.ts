/**
 * Type-check a deck project and return diagnostics formatted for an agent.
 *
 * We call the TypeScript programmatic API rather than shelling out so the
 * agent's `add_component` → `build` → `fix` loop doesn't pay Node startup
 * cost on every iteration. Incremental builds are cached via
 * `tsBuildInfoFile` (configured in the deck's `tsconfig.json`).
 *
 * Diagnostics are returned as a `Diagnostic[]` (relative path + line/col +
 * code + message + optional first line of source context) so the MCP tool
 * can render them as a structured list. The flat `summary` string is what
 * agents read; we prepend a hint pointing at the available primitives and
 * canvas dimensions so they self-correct without consulting docs.
 */

import { join, relative } from 'node:path';
import { linkDeckDeps } from './link-deps.js';

export type Diagnostic = {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly code: number;
  readonly message: string;
};

export type TypecheckResult =
  | { readonly ok: true; readonly summary: string }
  | { readonly ok: false; readonly summary: string; readonly diagnostics: Diagnostic[] };

/**
 * Run tsc against the deck's `tsconfig.json`, return formatted diagnostics.
 */
export const typecheckDeck = async (deckPath: string): Promise<TypecheckResult> => {
  linkDeckDeps(deckPath);
  const ts = (await import('typescript')).default;

  const configPath = join(deckPath, 'tsconfig.json');
  const parsed = ts.getParsedCommandLineOfConfigFile(configPath, undefined, {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: () => {},
  });
  if (!parsed) {
    return errorResult([
      {
        file: 'tsconfig.json',
        line: 1,
        column: 1,
        code: 0,
        message: `Cannot read tsconfig.json at ${configPath}.`,
      },
    ]);
  }

  const program = ts.createProgram({
    rootNames: parsed.fileNames,
    options: parsed.options,
  });
  const raw = ts.getPreEmitDiagnostics(program);
  if (raw.length === 0) {
    return {
      ok: true,
      summary: `Typecheck passed (${parsed.fileNames.length} files).`,
    };
  }

  const diagnostics = raw.map((d) => formatDiagnostic(d, deckPath, ts));
  return errorResult(diagnostics);
};

const formatDiagnostic = (
  d: import('typescript').Diagnostic,
  deckPath: string,
  ts: typeof import('typescript'),
): Diagnostic => {
  const file = d.file?.fileName ?? '(unknown)';
  let line = 1;
  let column = 1;
  if (d.file && d.start !== undefined) {
    const pos = d.file.getLineAndCharacterOfPosition(d.start);
    line = pos.line + 1;
    column = pos.character + 1;
  }
  return {
    file: relative(deckPath, file) || file,
    line,
    column,
    code: d.code,
    message: ts.flattenDiagnosticMessageText(d.messageText, '\n  '),
  };
};

/**
 * How many diagnostics we surface to the agent at once. Tsc cascades — a
 * single missing import can produce 30+ downstream errors — so we cap the
 * visible list and let the agent iterate. Aligns with Anthropic's guidance
 * to keep tool responses bounded (default ~25k tokens for Claude Code).
 */
const MAX_VISIBLE_DIAGNOSTICS = 20;

const errorResult = (diagnostics: Diagnostic[]): TypecheckResult => {
  const visible = diagnostics.slice(0, MAX_VISIBLE_DIAGNOSTICS);
  const hidden = diagnostics.length - visible.length;
  const bullets = visible
    .map((d) => `  • ${d.file}:${d.line}:${d.column}  TS${d.code}: ${d.message}`)
    .join('\n');
  const overflow =
    hidden > 0
      ? `\n  … and ${hidden} more. Fix the listed errors first — ` +
        `they typically cascade and most downstream diagnostics will clear ` +
        `on their own. Call slides_build after each fix to refresh.`
      : '';
  const summary =
    `Typecheck failed with ${diagnostics.length} ${diagnostics.length === 1 ? 'error' : 'errors'}:\n` +
    bullets +
    overflow +
    '\n\n' +
    AGENT_HINT;
  return { ok: false, summary, diagnostics };
};

/**
 * Short hint appended to every `build_failed` summary so the agent has the
 * minimum context to retry without re-loading the SKILL.
 *
 * **Keep this short.** Per-turn input cost is paid for every typecheck loop;
 * the SKILL already owns the full Tailwind dialect + readability rules. Mirror
 * just the primitives and the next-action so the agent knows where to go.
 */
const AGENT_HINT = [
  'Primitives (from "@sanity-labs/slides"): <Slide>, <Box>, <Text>, <Image>.',
  'Layout is flex + brand-locked Tailwind. Read slides_list({ detail: "detailed" }) to see the template\'s color and spacing tokens before composing classes.',
  'On a `bg-<dark>` Box, text inside needs a light token; on a light surface, a dark one. The full SKILL covers the rest.',
  'Fix the error file/line via slides_edit_component, then call slides_build to re-check.',
].join('\n');
