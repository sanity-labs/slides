/**
 * `slidesctl init` — interactive wizard to install a slides MCP server.
 *
 * Asks for: server name, template source (GitHub repo or local dir),
 * output directory, and which MCP clients to install into. Then clones
 * the template, builds it, writes the MCP config, and prints next steps.
 *
 * Non-interactive use: pass every value via flags and the wizard skips
 * straight through. Useful for scripting and CI.
 */

import { homedir } from 'node:os';
import { join } from 'node:path';
import { Command, Flags } from '@oclif/core';
import { confirm, input } from '@inquirer/prompts';
import { knownClients } from '../init/clients.js';
import { parseGithubSpec, formatSource } from '../init/github.js';
import { installServer } from '../init/install.js';
import { readState, type ClientId, type TemplateSource } from '../init/state.js';

export default class Init extends Command {
  static override description =
    'Set up a slide template so Claude can make decks in your brand. Pick a template (a GitHub link or a folder on your computer), and this command wires it up so Claude Desktop or Claude Code can use it.';

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --source sanity-labs/slides-template',
    '<%= config.bin %> <%= command.id %> --source ./my-template --output ~/Desktop/decks',
  ];

  static override flags = {
    source: Flags.string({
      char: 's',
      description:
        'The template to use. A GitHub link (`sanity-labs/slides-template`, a URL, or `owner/repo#branch`) or a folder on your computer.',
    }),
    name: Flags.string({
      char: 'n',
      description:
        'A short label for this template. Defaults to the GitHub repo or folder name. Only matters if you set up multiple templates side-by-side.',
    }),
    output: Flags.string({
      char: 'o',
      description: 'Where Claude should save the slide files it generates.',
    }),
    client: Flags.string({
      char: 'c',
      multiple: true,
      description:
        'Which app should be able to use this template. Repeatable. Options: claude-desktop, claude-code.',
    }),
    yes: Flags.boolean({
      char: 'y',
      description: 'Skip the interactive wizard — use defaults and the flags you passed.',
    }),
  };

  override async run(): Promise<void> {
    const { flags } = await this.parse(Init);
    const interactive = !flags.yes;

    // Friendly intro on the first run.
    if (interactive && Object.keys(readState().servers).length === 0) {
      this.log('');
      this.log("Let's set up a slide template so Claude can make decks in your brand.");
      this.log('');
    }

    // 1. Template source
    const sourceSpec =
      flags.source ?? (interactive ? await promptSource() : this.error('--source is required'));
    const source = resolveSource(sourceSpec);
    if (!source) {
      this.error(
        `Could not parse "${sourceSpec}" as a GitHub repo or local path. ` +
          `Try \`owner/repo\`, a GitHub URL, or a path to a built template directory.`,
        { exit: 2 },
      );
    }

    // 2. Server name. Default is the github repo / directory name. We only
    //    prompt when there's a conflict with an existing entry — most users
    //    just install one template and the name is uninteresting.
    const defaultName = inferName(source);
    const state = readState();
    let name: string;
    if (flags.name) {
      name = flags.name;
    } else if (state.servers[defaultName] && interactive) {
      // Conflict: ask what to do.
      name = await promptNameConflict(defaultName);
    } else {
      name = defaultName;
      if (state.servers[name]) {
        this.warn(
          `Replacing existing server "${name}". Pass --name <other> to install side-by-side instead.`,
        );
      }
    }

    // 3. Output directory
    const defaultOutput = join(homedir(), 'Desktop', `${name}-decks`);
    const outputDir =
      flags.output ?? (interactive ? await promptOutputDir(defaultOutput) : defaultOutput);

    // 4. Which apps to set this up for
    const clients = await resolveClients(flags.client, interactive, this);

    this.log('');
    this.log(`Setting up "${name}"…`);
    this.log(`  Template:    ${formatSource(source)}`);
    this.log(`  Decks saved: ${outputDir}`);
    this.log(`  Available in: ${clients.map(clientDisplayName).join(', ')}`);
    this.log('');

    const result = installServer({
      name,
      source,
      outputDir,
      clients,
      logger: {
        info: (msg) => process.stdout.write(`  ${msg}\n`),
        warn: (msg) => process.stderr.write(`  ${msg}\n`),
      },
    });

    if (!result.ok) {
      this.error(result.message, { exit: 1 });
    }

    this.log('');
    this.log(`\u2713 Done. "${name}" is set up.`);
    this.log('');
    this.log('What to do next:');
    for (const c of clients) {
      if (c === 'claude-desktop') {
        this.log('  1. Quit Claude Desktop completely (Cmd+Q) and reopen it.');
      } else if (c === 'claude-code') {
        this.log('  1. Restart Claude Code (close + reopen the terminal session).');
      }
    }
    this.log('  2. Ask Claude to make you a deck — e.g. "make a 5-slide pitch for Acme Corp".');
    this.log(`  3. Generated files will appear in: ${outputDir}`);
    if (source.kind === 'github') {
      this.log('');
      this.log(
        `Tip: when the template gets updates upstream, run \`slidesctl update\` to pull them down.`,
      );
    }
  }
}

const clientDisplayName = (id: ClientId): string =>
  id === 'claude-desktop' ? 'Claude Desktop' : id === 'claude-code' ? 'Claude Code' : id;

const promptSource = async (): Promise<string> =>
  input({
    message:
      'Which template? (paste a GitHub link like `sanity-labs/slides-template`, a full URL, or a folder path on your computer)',
    validate: (v) => {
      const parsed = resolveSource(v.trim());
      return parsed
        ? true
        : 'Hmm, that doesn\u2019t look like a GitHub repo or a folder path. Try something like `sanity-labs/slides-template` or `./my-template`.';
    },
  });

const promptNameConflict = async (defaultName: string): Promise<string> =>
  input({
    message: `You already have a template called "${defaultName}". Give this one a different name (or press Enter to replace the old one):`,
    default: defaultName,
    validate: (v) => {
      if (!/^[a-z0-9][a-z0-9-]*$/.test(v)) {
        return 'Use only lowercase letters, numbers, and dashes — e.g. "my-deck" or "acme-slides".';
      }
      return true;
    },
  });

const promptOutputDir = async (defaultDir: string): Promise<string> =>
  input({ message: 'Where should Claude save the decks it makes?', default: defaultDir });

const resolveSource = (spec: string): TemplateSource | null => {
  const github = parseGithubSpec(spec);
  if (github) {
    return github.ref
      ? { kind: 'github', owner: github.owner, repo: github.repo, ref: github.ref }
      : { kind: 'github', owner: github.owner, repo: github.repo };
  }
  // Anything else: treat as a local path
  if (spec.startsWith('.') || spec.startsWith('/') || spec.startsWith('~')) {
    return { kind: 'local', path: spec.replace(/^~/, homedir()) };
  }
  return null;
};

const inferName = (source: TemplateSource): string => {
  if (source.kind === 'github') return source.repo;
  if (source.kind === 'local') {
    const parts = source.path.split('/').filter(Boolean);
    return parts[parts.length - 1] ?? 'slides';
  }
  return 'slides';
};

const resolveClients = async (
  flagClients: string[] | undefined,
  interactive: boolean,
  cmd: Command,
): Promise<ReadonlyArray<ClientId>> => {
  const valid = new Set<ClientId>(['claude-desktop', 'claude-code']);

  if (flagClients && flagClients.length > 0) {
    const cleaned: ClientId[] = [];
    for (const c of flagClients) {
      if (valid.has(c as ClientId)) cleaned.push(c as ClientId);
      else
        cmd.warn(
          `Skipping "${c}" — we don't recognise that app. Supported apps: claude-desktop, claude-code.`,
        );
    }
    if (cleaned.length === 0) cmd.error('No supported apps selected.', { exit: 2 });
    return cleaned;
  }

  const installed = knownClients();
  const detected = installed.filter((c) => c.installed);
  if (!interactive) {
    if (detected.length === 0) {
      cmd.error(
        'Could not find Claude Desktop or Claude Code on this machine. Install one of them first, or pass --client claude-desktop explicitly if you know its config path.',
        { exit: 2 },
      );
    }
    return detected.map((c) => c.id);
  }

  // Single detected app — just confirm. Multiple — ask per app.
  if (detected.length === 1 && installed.length === 1) {
    const c = detected[0]!;
    const yes = await confirm({
      message: `Set this up for ${c.displayName}?`,
      default: true,
    });
    if (!yes) cmd.error('No apps selected — nothing to set up.', { exit: 2 });
    return [c.id];
  }

  // Interactive: ask for each, with friendlier text for undetected apps
  const chosen: ClientId[] = [];
  for (const c of installed) {
    const message = c.installed
      ? `Set up for ${c.displayName}?`
      : `${c.displayName} isn't installed on this machine — set it up anyway?`;
    const yes = await confirm({ message, default: c.installed });
    if (yes) chosen.push(c.id);
  }
  if (chosen.length === 0) cmd.error('No apps selected — nothing to set up.', { exit: 2 });
  return chosen;
};
