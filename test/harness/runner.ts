/**
 * Drives an LLM through the real MCP server for each scenario.
 *
 * Per scenario:
 *
 * 1. Spawn `slidesctl serve` as a subprocess with a fresh output dir.
 * 2. Connect both an MCP client (StdioClientTransport) and an Anthropic
 *    client.
 * 3. Load `SKILL.md` and feed it as the system prompt so Claude is in the
 *    same context an Anthropic user would have.
 * 4. Run the agentic loop with the scenario's `userPrompt`.
 * 5. Call the scenario's `expect` against the resulting `AgentOutcome`,
 *    plus a few common helpers (e.g. `pptxIn(outputDir)`).
 *
 * No vitest. No CI. This file is meant to be invoked from a developer's
 * terminal with an `ANTHROPIC_API_KEY` env var; failures print a verbose
 * trace so you can see exactly which tool the agent called and why.
 */

import Anthropic from '@anthropic-ai/sdk';
import { existsSync, promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { runAgentLoop, type AgentOutcome, type HarnessEvent } from './agent-loop.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const CLI_PATH = path.join(REPO_ROOT, 'dist', 'cli.js');
const SKILL_PATH = path.join(REPO_ROOT, 'SKILL.md');
const ENV_FILE = path.join(REPO_ROOT, '.env');
const FIXTURE_TEMPLATE = path.join(
  REPO_ROOT,
  'src',
  '__tests__',
  'fixtures',
  'test-template',
  'index.tsx',
);

/**
 * Pull `.env` at the repo root into `process.env` if present. Lets developers
 * keep their `ANTHROPIC_API_KEY` in a file rather than exporting it into
 * every shell. Existing env vars win (so you can override per-invocation).
 */
const loadEnvFile = (): void => {
  if (!existsSync(ENV_FILE)) return;
  // process.loadEnvFile is stable in Node 20.12+, which is below our >=20 floor;
  // bail quietly if it's missing on an older runtime.
  if (typeof process.loadEnvFile !== 'function') return;
  try {
    process.loadEnvFile(ENV_FILE);
  } catch {
    // Malformed .env shouldn't kill the harness — the apiKey check below
    // will fail with a clear message if the key still isn't set.
  }
};

// ---------------------------------------------------------------------------
// Scenario surface (mirrors sanity-agent/harness shape, simplified)
// ---------------------------------------------------------------------------

export type Verdict =
  | { readonly pass: true }
  | { readonly pass: false; readonly level: 'warn' | 'fail'; readonly reason: string };

export type ExpectResult =
  | boolean
  | string
  | null
  | undefined
  | void
  | Verdict
  | ReadonlyArray<Verdict>;

export type RunOutcome = AgentOutcome & {
  readonly scenarioName: string;
  readonly userPrompt: string;
  readonly outputDir: string;
  /** Absolute paths of every `.pptx` file the agent created in the output dir. */
  readonly producedPptx: ReadonlyArray<string>;
  readonly durationMs: number;
};

export type ExpectFn = (outcome: RunOutcome) => ExpectResult | Promise<ExpectResult>;

export type Scenario = {
  readonly name: string;
  readonly description: string;
  readonly userPrompt: string;
  readonly expect: ExpectFn;
  /** Override the agent-loop turn cap (default 12). */
  readonly maxTurns?: number;
};

export type ScenarioResult = {
  readonly name: string;
  readonly description: string;
  readonly verdicts: ReadonlyArray<Verdict>;
  readonly outcome?: RunOutcome;
  readonly error?: { readonly message: string };
  readonly durationMs: number;
};

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export type RunnerOptions = {
  readonly verbose: boolean;
  /**
   * If set, copy every produced `.pptx` into this directory before the
   * scenario's tmp dir is swept. Useful for eyeballing what Claude actually
   * rendered — e.g. `--keep-output ~/Downloads`.
   */
  readonly keepOutputDir?: string;
};

const runOne = async (
  scenario: Scenario,
  anthropic: Anthropic,
  systemPrompt: string,
  options: RunnerOptions,
): Promise<ScenarioResult> => {
  const t0 = performance.now();
  const scenarioTmp = await fs.mkdtemp(path.join(tmpdir(), `slides-harness-${scenario.name}-`));
  const outputDir = path.join(scenarioTmp, 'output');
  await fs.mkdir(outputDir, { recursive: true });

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [CLI_PATH, 'serve', '--template', FIXTURE_TEMPLATE, '--output', outputDir],
    stderr: 'pipe',
    cwd: scenarioTmp,
  });
  const mcp = new Client({ name: `harness-${scenario.name}`, version: '0.0.0' });
  const stderrChunks: string[] = [];
  if (transport.stderr) {
    transport.stderr.on('data', (chunk: Buffer | string) => {
      stderrChunks.push(typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
    });
  }

  try {
    await mcp.connect(transport);
    const outcome = await runAgentLoop({
      anthropic,
      mcp,
      prompt: scenario.userPrompt,
      systemPrompt,
      ...(scenario.maxTurns !== undefined ? { maxTurns: scenario.maxTurns } : {}),
    });
    const producedPptx = await listPptx(outputDir);
    const keptOutputPaths = options.keepOutputDir
      ? await keepPptxFiles(producedPptx, options.keepOutputDir, scenario.name)
      : producedPptx;
    const enriched: RunOutcome = {
      ...outcome,
      scenarioName: scenario.name,
      userPrompt: scenario.userPrompt,
      outputDir,
      producedPptx: keptOutputPaths,
      durationMs: Math.round(performance.now() - t0),
    };
    const verdicts = await runExpect(scenario.expect, enriched);
    return {
      name: scenario.name,
      description: scenario.description,
      verdicts,
      outcome: enriched,
      durationMs: Math.round(performance.now() - t0),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const tail = stderrChunks.join('').slice(-500);
    return {
      name: scenario.name,
      description: scenario.description,
      verdicts: [],
      error: { message: tail ? `${message}\n[server stderr tail]\n${tail}` : message },
      durationMs: Math.round(performance.now() - t0),
    };
  } finally {
    try {
      await mcp.close();
    } catch {
      // server may already be dead
    }
    await fs.rm(scenarioTmp, { recursive: true, force: true }).catch(() => {});
  }
};

/** Run every scenario sequentially, printing results as we go. */
export const runAll = async (
  scenarios: ReadonlyArray<Scenario>,
  options: RunnerOptions,
): Promise<ScenarioResult[]> => {
  assertCliBuilt();
  loadEnvFile();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    process.stderr.write(
      `ANTHROPIC_API_KEY is not set.\n` +
        `The harness drives a real Claude session against the MCP server, so it\n` +
        `needs an API key. Get one at https://console.anthropic.com/ and either:\n` +
        `  - copy .env.template to .env and fill in ANTHROPIC_API_KEY=..., or\n` +
        `  - export ANTHROPIC_API_KEY=sk-ant-... in your shell.\n`,
    );
    process.exit(2);
  }
  const anthropic = new Anthropic({ apiKey });
  const systemPrompt = await buildSystemPrompt();

  const results: ScenarioResult[] = [];
  for (const scenario of scenarios) {
    process.stdout.write(`\n▸ ${scenario.name}  —  ${scenario.description}\n`);
    const result = await runOne(scenario, anthropic, systemPrompt, options);
    results.push(result);
    printResult(result, options.verbose);
  }
  printSummary(results);
  return results;
};

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

/**
 * Strip the YAML frontmatter off `SKILL.md` and use the body as the system
 * prompt. That mirrors how Claude Desktop / claude.ai loads a Skill: the
 * frontmatter is metadata for the host, the body is what the model sees.
 */
const buildSystemPrompt = async (): Promise<string> => {
  if (!existsSync(SKILL_PATH)) {
    return `You are an agent with access to MCP tools that generate PowerPoint decks.`;
  }
  const raw = await fs.readFile(SKILL_PATH, 'utf8');
  const body = raw.replace(/^---\n[\s\S]*?\n---\n/, '').trim();
  return [
    `You are an agent operating in a developer's MCP harness for the @sanity-labs/slides server. ` +
      `You have access to MCP tools (names beginning with slides_) that generate PowerPoint decks. ` +
      `Drive the tools to satisfy the user's request, then return a brief final message naming the .pptx ` +
      `file you produced (or explaining why you couldn't).`,
    '',
    'The following skill describes how the server is meant to be used:',
    '',
    body,
  ].join('\n');
};

// ---------------------------------------------------------------------------
// Expect plumbing
// ---------------------------------------------------------------------------

const runExpect = async (expect: ExpectFn, outcome: RunOutcome): Promise<Verdict[]> => {
  let raw: ExpectResult;
  try {
    raw = await expect(outcome);
  } catch (err) {
    return [
      {
        pass: false,
        level: 'fail',
        reason: `expect callback threw: ${err instanceof Error ? err.message : String(err)}`,
      },
    ];
  }
  return normalizeVerdicts(raw);
};

const normalizeVerdicts = (raw: ExpectResult): Verdict[] => {
  if (raw === true || raw === null || raw === undefined) return [{ pass: true }];
  if (raw === false) return [{ pass: false, level: 'fail', reason: 'expect returned false' }];
  if (typeof raw === 'string') return [{ pass: false, level: 'fail', reason: raw }];
  if (Array.isArray(raw)) return raw.length === 0 ? [{ pass: true }] : [...raw];
  if ('pass' in raw) return [raw];
  return [{ pass: false, level: 'fail', reason: 'expect returned an unrecognized value' }];
};

// ---------------------------------------------------------------------------
// Output formatting
// ---------------------------------------------------------------------------

const printResult = (result: ScenarioResult, verbose: boolean): void => {
  const failed = result.verdicts.filter((v) => !v.pass);
  const status =
    result.error !== undefined
      ? '✖ ERROR'
      : failed.length === 0
        ? '✓ PASS'
        : failed.some((f) => !f.pass && f.level === 'fail')
          ? '✖ FAIL'
          : '⚠ WARN';
  const stats = result.outcome
    ? `${result.outcome.turnCount} turns, ${result.outcome.toolCalls.length} tool calls, ` +
      `${result.outcome.tokens.input}→${result.outcome.tokens.output} tok`
    : 'no outcome';
  process.stdout.write(`  ${status}  ${stats}  (${result.durationMs} ms)\n`);

  for (const v of result.verdicts) {
    if (v.pass) continue;
    const icon = v.level === 'fail' ? '✖' : '⚠';
    process.stdout.write(`    ${icon} ${v.reason}\n`);
  }
  if (result.error) {
    const lines = result.error.message.split('\n');
    process.stdout.write(`    ! ${lines[0]}\n`);
    if (verbose) {
      for (const line of lines.slice(1)) process.stdout.write(`      ${line}\n`);
    }
  }
  if (verbose && result.outcome) {
    printTrace(result.outcome);
  }
};

const printTrace = (outcome: RunOutcome): void => {
  process.stdout.write('    trace:\n');
  for (const e of outcome.events) {
    process.stdout.write(`      ${formatEvent(e)}\n`);
  }
  if (outcome.producedPptx.length > 0) {
    process.stdout.write(`    produced ${outcome.producedPptx.length} .pptx:\n`);
    for (const p of outcome.producedPptx) process.stdout.write(`      · ${path.basename(p)}\n`);
  }
  if (outcome.finalMessage) {
    process.stdout.write(`    final message: ${truncate(outcome.finalMessage, 200)}\n`);
  }
};

const formatEvent = (e: HarnessEvent): string => {
  const t = `t=${e.tMs}ms`;
  switch (e.type) {
    case 'turn-start':
      return `[${t}] turn ${e.turn} —————`;
    case 'assistant-text':
      return `[${t}] text: ${truncate(e.text, 140)}`;
    case 'tool-call':
      return `[${t}] → ${e.name}(${truncate(JSON.stringify(e.input), 120)})`;
    case 'tool-result':
      return `[${t}] ← ${e.name} ${e.isError ? '✖' : '✓'}`;
    case 'stop':
      return `[${t}] stop: ${e.stopReason}`;
  }
};

const printSummary = (results: ReadonlyArray<ScenarioResult>): void => {
  const total = results.length;
  const passed = results.filter((r) => !r.error && r.verdicts.every((v) => v.pass)).length;
  const totalTokens = results.reduce(
    (n, r) => n + (r.outcome ? r.outcome.tokens.input + r.outcome.tokens.output : 0),
    0,
  );
  process.stdout.write(
    `\n${passed}/${total} scenarios passed  |  ` +
      `~${totalTokens.toLocaleString()} tokens  |  ` +
      `${passed === total ? '✓ all green' : '✖ failures above'}\n`,
  );
};

const truncate = (s: string, max: number): string =>
  s.length <= max ? s : `${s.slice(0, max - 1)}…`;

// ---------------------------------------------------------------------------
// Helpers usable by scenarios via the outcome
// ---------------------------------------------------------------------------

const listPptx = async (dir: string): Promise<string[]> => {
  if (!existsSync(dir)) return [];
  const entries = await fs.readdir(dir);
  return entries.filter((f) => f.toLowerCase().endsWith('.pptx')).map((f) => path.join(dir, f));
};

/**
 * Copy each .pptx into `keepDir`, prefixing the basename with the scenario
 * name so multiple scenarios writing into the same directory don't collide.
 * Returns the new absolute paths.
 */
const keepPptxFiles = async (
  sources: ReadonlyArray<string>,
  keepDir: string,
  scenarioName: string,
): Promise<string[]> => {
  const expanded = expandHome(keepDir);
  await fs.mkdir(expanded, { recursive: true });
  const kept: string[] = [];
  for (const src of sources) {
    const stem = path.basename(src, '.pptx');
    const dst = path.join(expanded, `${scenarioName}-${stem}.pptx`);
    await fs.copyFile(src, dst);
    kept.push(dst);
  }
  return kept;
};

/** Tilde-expand a leading `~/` so users can pass shell-style paths. */
const expandHome = (p: string): string => {
  if (p === '~') return process.env.HOME ?? p;
  if (p.startsWith('~/')) return path.join(process.env.HOME ?? '~', p.slice(2));
  return path.resolve(p);
};

const assertCliBuilt = (): void => {
  if (existsSync(CLI_PATH)) return;
  process.stderr.write(
    `Harness needs the built CLI at ${CLI_PATH}.\n` +
      `Run \`pnpm build\` before \`pnpm harness\`.\n`,
  );
  process.exit(2);
};
