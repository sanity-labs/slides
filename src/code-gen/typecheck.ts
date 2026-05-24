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

import { readFileSync } from 'node:fs';
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

const errorResult = (diagnostics: Diagnostic[]): TypecheckResult => {
  const bullets = diagnostics
    .map((d) => `  • ${d.file}:${d.line}:${d.column}  TS${d.code}: ${d.message}`)
    .join('\n');
  const summary =
    `Typecheck failed with ${diagnostics.length} ${diagnostics.length === 1 ? 'error' : 'errors'}:\n` +
    bullets +
    '\n\n' +
    AGENT_HINT;
  return { ok: false, summary, diagnostics };
};

const AGENT_HINT = [
  'Available primitives (import from "@sanity-labs/slides"):',
  '  • <Slide>           — root of one slide.',
  '  • <Box rect={...}>  — positioned rectangle. rect: { x, y, w, h } in points.',
  '  • <Text textStyle={...}>{content}</Text>  — typography. fontFamily: "display" | "body" | "mono".',
  '  • <Image rect={...} src={...} />',
  'Canvas: 960pt × 540pt (16:9, CANVAS_16_9).',
  'Read the error file/line, fix the source via slides_edit_component, and call slides_build again.',
].join('\n');

/** Re-export for ergonomics in tests. */
export const readDeckIndex = (deckPath: string): string =>
  readFileSync(join(deckPath, 'src', 'index.ts'), 'utf8');
