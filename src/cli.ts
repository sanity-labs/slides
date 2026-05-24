#!/usr/bin/env node
/**
 * `slidesctl` — the CLI bin shipped with `@sanity-labs/slides`.
 *
 * Subcommands:
 *
 *   serve     --template <path-or-specifier> [--output <dir>] [--name <id>]
 *               Start an MCP server over stdio. Exposes `slides_list`,
 *               `slides_add_<type>`, and `slides_create` derived from the
 *               loaded template.
 *
 *   generate  --template <path-or-specifier> [--output <dir>]
 *               Read `{ title, slides: [...] }` JSON from stdin and write
 *               the resulting `.pptx`. Prints the absolute path on stdout.
 *
 *   list      --template <path-or-specifier>
 *               Print every slide type the template exposes, with
 *               descriptions. Useful for humans inspecting a template
 *               without an MCP client.
 *
 *   scaffold  <dir> [--name <slug>]
 *               Scaffold a new template into <dir>. Replaces the old
 *               `npm create react-pptx-template` flow.
 *
 *   create-deck <dir> [--name <slug>]
 *               Scaffold an agent-writable deck project. Decks inherit
 *               the @sanity-labs/slides primitives but ship with no slide
 *               components — the agent writes them via the MCP tools.
 *
 *   skill     [--path]
 *               Print the bundled `SKILL.md` to stdout (or its absolute
 *               path with `--path`). Paste into a Claude project to teach
 *               the model how to drive any react-pptx MCP server.
 *
 * The `--template` flag accepts:
 *   - A bare package specifier resolved from the current directory
 *     (e.g. `@acme/slide-template`).
 *   - A path to a built JS file (`./dist/index.js`).
 *   - A path to a directory containing `package.json` (the bin reads
 *     `main` / `exports['.']`).
 */

import { readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { SlidesRuntime, Template } from './core/index.js';
import { PptxSlidesRuntime } from './core/index.js';
import { renderSlides } from './mcp/render.js';
import { createSlideServer } from './mcp/server.js';
import { createDeck } from './code-gen/index.js';
import { defaultName, scaffoldTemplate, validateName } from './scaffold/index.js';

const USAGE = `Usage: slidesctl <command> [options]

Commands:
  serve         Start an MCP server over stdio.
  generate      Read { title, slides } JSON from stdin, write a .pptx file.
  list          Print the slide types a template exposes.
  scaffold      Scaffold a new brand template into <dir>.
  create-deck   Scaffold an agent-writable deck project into <dir>.
  skill         Print the bundled SKILL.md.

Options (serve / generate / list):
  --template, -t <path>   Template to load. Accepts a package name, a file
                          path, or a directory.
  --output,   -o <dir>    Output directory for generated .pptx files
                          (serve/generate only; defaults to cwd).
  --name,         <id>    MCP server name override (serve only).

Options (scaffold / create-deck):
  --name      <slug>      Project name (default: inferred from <dir>).

Options (skill):
  --path                  Print SKILL.md's absolute path only.

Global:
  --help, -h              Show this message.
`;

type ParsedArgs = {
  readonly command: string | undefined;
  readonly positional: ReadonlyArray<string>;
  readonly template: string | undefined;
  readonly output: string | undefined;
  readonly name: string | undefined;
  readonly path: boolean;
  readonly help: boolean;
};

const parseArgs = (argv: readonly string[]): ParsedArgs => {
  const args: {
    command: string | undefined;
    positional: string[];
    template: string | undefined;
    output: string | undefined;
    name: string | undefined;
    path: boolean;
    help: boolean;
  } = {
    command: undefined,
    positional: [],
    template: undefined,
    output: undefined,
    name: undefined,
    path: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--help':
      case '-h':
        args.help = true;
        break;
      case '--template':
      case '-t':
        args.template = argv[++i];
        break;
      case '--output':
      case '-o':
        args.output = argv[++i];
        break;
      case '--name':
        args.name = argv[++i];
        break;
      case '--path':
        args.path = true;
        break;
      default:
        if (arg === undefined) break;
        if (arg.startsWith('-')) throw new CliError(`Unknown flag: ${arg}`);
        if (args.command === undefined) {
          args.command = arg;
        } else {
          args.positional.push(arg);
        }
    }
  }

  return args;
};

class CliError extends Error {
  constructor(
    message: string,
    readonly exitCode = 2,
  ) {
    super(message);
    this.name = 'CliError';
  }
}

/**
 * Resolve a `--template` argument to a Template instance.
 *
 * The template is the default export of the resolved module, or any named
 * export that matches the Template shape (`name`, `components`, `canvas`).
 */
const loadTemplate = async (spec: string): Promise<Template> => {
  const cwd = process.cwd();
  let importTarget: string;

  if (isAbsoluteOrRelative(spec)) {
    const abs = resolvePath(cwd, spec);
    let resolved: string;
    try {
      const stat = statSync(abs);
      resolved = stat.isDirectory() ? resolveDirEntry(abs) : abs;
    } catch (err) {
      throw new CliError(
        `Cannot read --template path "${spec}" (resolved to "${abs}"): ${describeError(err)}`,
      );
    }
    importTarget = pathToFileURL(resolved).href;
  } else {
    importTarget = resolveBareSpecifier(spec, cwd);
  }

  if (/\.(ts|tsx|mts|cts)(\?|$)/.test(importTarget)) await ensureTsxLoader();
  let mod: unknown;
  try {
    mod = await import(importTarget);
  } catch (err) {
    throw new CliError(`Failed to import template "${spec}": ${describeError(err)}`);
  }
  const template = pickTemplate(mod);
  if (!template) {
    throw new CliError(
      `Module at "${spec}" does not export a Template (need an object with name + components).`,
    );
  }
  return template;
};

let tsxRegistered = false;

const ensureTsxLoader = async (): Promise<void> => {
  if (tsxRegistered) return;
  const { register } = await import('tsx/esm/api');
  register();
  tsxRegistered = true;
};

const isAbsoluteOrRelative = (spec: string): boolean =>
  spec.startsWith('.') || spec.startsWith('/') || /^[A-Z]:\\/i.test(spec);

const resolveDirEntry = (dir: string): string => {
  const pkgPath = resolvePath(dir, 'package.json');
  let pkg: { main?: string; module?: string; exports?: unknown };
  try {
    pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as typeof pkg;
  } catch (err) {
    throw new CliError(
      `Template directory "${dir}" has no readable package.json: ${describeError(err)}`,
    );
  }
  const entry = pkg.module ?? pkg.main ?? exportsDefault(pkg.exports);
  if (!entry) {
    throw new CliError(`Template directory "${dir}" has no main/module/exports entry to import.`);
  }
  return resolvePath(dir, entry);
};

const exportsDefault = (exportsField: unknown): string | undefined => {
  if (typeof exportsField === 'string') return exportsField;
  if (exportsField && typeof exportsField === 'object') {
    const dot = (exportsField as Record<string, unknown>)['.'];
    if (typeof dot === 'string') return dot;
    if (dot && typeof dot === 'object') {
      const sub = dot as Record<string, unknown>;
      const candidate = sub['import'] ?? sub['default'] ?? sub['node'];
      if (typeof candidate === 'string') return candidate;
    }
  }
  return undefined;
};

const resolveBareSpecifier = (spec: string, cwd: string): string => {
  // ESM resolution honours `exports.import` and other conditions that
  // require.resolve() doesn't, which matters for templates that ship
  // conditional exports. Anchor resolution at the user's cwd via a synthetic
  // package.json URL so we look in their node_modules.
  const parentUrl = pathToFileURL(resolvePath(cwd, 'package.json')).href;
  try {
    return import.meta.resolve(spec, parentUrl);
  } catch (err) {
    throw new CliError(
      `Cannot resolve template "${spec}" from ${cwd}: ${describeError(err)}. ` +
        `Install it as a dependency or pass a path with --template.`,
    );
  }
};

const pickTemplate = (mod: unknown): Template | undefined => {
  if (!mod || typeof mod !== 'object') return undefined;
  const candidates: unknown[] = [];
  const m = mod as Record<string, unknown>;
  if (m['default']) candidates.push(m['default']);
  for (const [key, value] of Object.entries(m)) {
    if (key === 'default') continue;
    candidates.push(value);
  }
  for (const c of candidates) {
    if (isTemplate(c)) return c;
  }
  return undefined;
};

const isTemplate = (value: unknown): value is Template => {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v['name'] === 'string' && typeof v['components'] === 'object';
};

const newRuntime = (output: string | undefined): SlidesRuntime =>
  new PptxSlidesRuntime({ outputDir: output ?? process.cwd() });

const runServe = async (args: ParsedArgs): Promise<void> => {
  if (!args.template) throw new CliError('serve requires --template <path-or-specifier>.');
  const template = await loadTemplate(args.template);
  const runtime = newRuntime(args.output);
  const server = createSlideServer({
    template,
    runtime,
    ...(args.name ? { serverInfo: { name: args.name, version: '0.1.0' } } : {}),
  });
  await server.start({ transport: 'stdio' });
};

const runList = async (args: ParsedArgs): Promise<void> => {
  if (!args.template) throw new CliError('list requires --template <path-or-specifier>.');
  const template = await loadTemplate(args.template);
  const lines = [`Template: ${template.name}`, '', 'Slide types:'];
  for (const [name, tc] of Object.entries(template.components)) {
    lines.push(`  • ${name} — ${tc.description ?? '(no description)'}`);
  }
  process.stdout.write(lines.join('\n') + '\n');
};

const runGenerate = async (args: ParsedArgs): Promise<void> => {
  if (!args.template) throw new CliError('generate requires --template <path-or-specifier>.');
  const template = await loadTemplate(args.template);
  const runtime = newRuntime(args.output);

  const raw = await readStdin();
  if (raw.trim().length === 0) {
    throw new CliError(
      'generate: no input on stdin. Pipe JSON of { title, slides: [{ component, props }] }.',
    );
  }
  let input: { title?: unknown; slides?: unknown };
  try {
    input = JSON.parse(raw) as typeof input;
  } catch (err) {
    throw new CliError(`generate: invalid JSON on stdin: ${describeError(err)}`);
  }
  if (typeof input.title !== 'string' || !Array.isArray(input.slides)) {
    throw new CliError('generate: input must be { title: string, slides: array }.');
  }
  const result = await renderSlides({
    template,
    runtime,
    title: input.title,
    slides: input.slides as Array<{ component: string; props: Record<string, unknown> }>,
  });
  if (result.ok) {
    process.stdout.write(`${result.filePath}\n`);
    return;
  }
  throw new CliError(result.message, result.code === 'unknown_component' ? 3 : 2);
};

const runSkill = (args: ParsedArgs): void => {
  const skillPath = resolveSkillPath();
  if (args.path) {
    process.stdout.write(`${skillPath}\n`);
    return;
  }
  process.stdout.write(readFileSync(skillPath, 'utf8'));
};

const runCreateDeck = async (args: ParsedArgs): Promise<void> => {
  const [target] = args.positional;
  if (!target) {
    throw new CliError(
      'create-deck requires a target directory: `slidesctl create-deck ./my-deck`.',
    );
  }
  const result = await createDeck({ dir: target, ...(args.name ? { name: args.name } : {}) });
  process.stdout.write(`Scaffolded deck at ${result.deckPath}\n`);
  process.stdout.write(
    `\nNext steps:\n` +
      `  Pipe slide specs to slidesctl generate --template ${result.deckPath}/src/index.ts\n` +
      `  Or wire the deck into Claude via slidesctl serve and call slides_add_component.\n`,
  );
};

const runScaffold = (args: ParsedArgs): void => {
  const [target] = args.positional;
  if (!target) {
    throw new CliError('scaffold requires a target directory: `slidesctl scaffold my-template`.');
  }
  const name = args.name ?? defaultName(target);
  const nameError = validateName(name);
  if (nameError) {
    throw new CliError(
      `Invalid template name "${name}": ${nameError}. ` + `Pass --name <slug> with a valid name.`,
    );
  }
  const result = scaffoldTemplate({ target, name });
  process.stdout.write(`Scaffolded ${result.fileCount} files into ${result.targetPath}\n`);
  process.stdout.write(
    `\nNext steps:\n  cd ${target}\n  pnpm install\n  pnpm dev   # open the viewer\n  pnpm build # emit dist/ so slidesctl can serve it\n`,
  );
};

const resolveSkillPath = (): string => {
  // SKILL.md ships at the package root, one level above dist/cli.js.
  // From src/cli.ts the same relative path resolves correctly because
  // we run from dist/ in production.
  const here = dirname(fileURLToPath(import.meta.url));
  return resolvePath(here, '..', 'SKILL.md');
};

const readStdin = (): Promise<string> => {
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    process.stdin.on('data', (chunk: Buffer | string) => {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk);
    });
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    process.stdin.on('error', (err: Error) => reject(err));
  });
};

const describeError = (err: unknown): string => (err instanceof Error ? err.message : String(err));

export const main = async (argv: readonly string[]): Promise<void> => {
  let args: ParsedArgs;
  try {
    args = parseArgs(argv);
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.stderr.write(USAGE);
    process.exit(2);
  }

  if (args.help || args.command === undefined) {
    process.stdout.write(USAGE);
    process.exit(args.help ? 0 : 1);
  }

  try {
    switch (args.command) {
      case 'serve':
        await runServe(args);
        return;
      case 'list':
        await runList(args);
        return;
      case 'generate':
        await runGenerate(args);
        return;
      case 'scaffold':
        runScaffold(args);
        return;
      case 'create-deck':
        await runCreateDeck(args);
        return;
      case 'skill':
        runSkill(args);
        return;
      default:
        process.stderr.write(`Unknown command: ${args.command}\n`);
        process.stderr.write(USAGE);
        process.exit(2);
    }
  } catch (err) {
    if (err instanceof CliError) {
      process.stderr.write(`${err.message}\n`);
      process.exit(err.exitCode);
    }
    process.stderr.write(`slidesctl failed: ${describeError(err)}\n`);
    process.exit(1);
  }
};

// pnpm's content-addressed install layout means `process.argv[1]` is the
// `.bin` symlink while `import.meta.url` is the realpath under `.pnpm/`.
// Use realpathSync on both sides so direct invocation and
// `node_modules/.bin/slidesctl` both detect this file as the entrypoint.
const argvPath = process.argv[1];
if (argvPath !== undefined) {
  try {
    const argvReal = realpathSync(argvPath);
    const selfReal = fileURLToPath(import.meta.url);
    if (argvReal === selfReal) void main(process.argv.slice(2));
  } catch {
    // not invoked as a script — module being imported, ignore.
  }
}
