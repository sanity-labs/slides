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
import { confirm, input, select } from '@inquirer/prompts';
import { knownClients } from '../init/clients.js';
import { parseGithubSpec, formatSource } from '../init/github.js';
import { installServer } from '../init/install.js';
import { readState, type ClientId, type TemplateSource } from '../init/state.js';

export default class Init extends Command {
  static override description =
    'Install a slides MCP server entry. Pulls a template from GitHub or a local directory, builds it, and wires it into your MCP client config.';

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --name sanity-slides --source sanity-labs/slides-template',
    '<%= config.bin %> <%= command.id %> --name my-deck --source ./my-template --output ~/Desktop/decks',
  ];

  static override flags = {
    name: Flags.string({
      char: 'n',
      description:
        'Server name (the key in `mcpServers` config). Defaults to the template repo name.',
    }),
    source: Flags.string({
      char: 's',
      description:
        'Template source. GitHub: `owner/repo` (optionally `#branch`). Local: an absolute or relative path to a template directory.',
    }),
    output: Flags.string({
      char: 'o',
      description: 'Output directory for generated .pptx files.',
    }),
    client: Flags.string({
      char: 'c',
      multiple: true,
      description: 'MCP client to install into (repeatable). One of: claude-desktop, claude-code.',
    }),
    yes: Flags.boolean({
      char: 'y',
      description: 'Skip interactive prompts; require all values via flags.',
    }),
  };

  override async run(): Promise<void> {
    const { flags } = await this.parse(Init);
    const interactive = !flags.yes;

    // 1. Template source
    const sourceSpec =
      flags.source ?? (interactive ? await promptSource() : this.error('--source is required'));
    const source = resolveSource(sourceSpec);
    if (!source) {
      this.error(
        `Could not parse "${sourceSpec}" as a GitHub repo or local path. ` +
          `Try \`owner/repo\`, \`owner/repo#branch\`, or a path to a built template directory.`,
        { exit: 2 },
      );
    }

    // 2. Server name (default: github repo name or the directory basename)
    const defaultName = inferName(source);
    const name = flags.name ?? (interactive ? await promptName(defaultName) : defaultName);
    assertNameAvailable(this, name);

    // 3. Output directory
    const defaultOutput = join(homedir(), 'Desktop', `${name}-decks`);
    const outputDir =
      flags.output ?? (interactive ? await promptOutputDir(defaultOutput) : defaultOutput);

    // 4. MCP clients
    const clients = await resolveClients(flags.client, interactive, this);

    this.log('');
    this.log(`Installing ${name}…`);
    this.log(`  source:  ${formatSource(source)}`);
    this.log(`  output:  ${outputDir}`);
    this.log(`  clients: ${clients.join(', ')}`);
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
    this.log(`\u2713 Installed "${name}"`);
    this.log('');
    this.log('Restart your MCP client to load the server:');
    for (const c of clients) {
      this.log(
        c === 'claude-desktop' ? '  - Claude Desktop: Cmd+Q and reopen' : `  - ${c}: reload`,
      );
    }
  }
}

const promptSource = async (): Promise<string> => {
  const kind = await select({
    message: 'Where is your template?',
    choices: [
      {
        name: 'GitHub repo (clone + build)',
        value: 'github',
        description: 'e.g. sanity-labs/slides-template — we clone, install, and build it for you.',
      },
      {
        name: 'Local directory',
        value: 'local',
        description: 'Path to a template you have already built locally.',
      },
    ],
  });
  if (kind === 'github') {
    return input({
      message: 'GitHub repo (owner/repo[#branch]):',
      validate: (v) => (parseGithubSpec(v) ? true : 'Expected owner/repo or owner/repo#branch'),
    });
  }
  return input({
    message: 'Path to template directory:',
    validate: (v) => (v.trim().length > 0 ? true : 'Required'),
  });
};

const promptName = async (defaultName: string): Promise<string> =>
  input({
    message: 'Server name (used as the key in MCP config):',
    default: defaultName,
    validate: (v) => {
      if (!/^[a-z0-9][a-z0-9-]*$/.test(v)) {
        return 'Lowercase letters, numbers, and dashes only.';
      }
      return true;
    },
  });

const promptOutputDir = async (defaultDir: string): Promise<string> =>
  input({ message: 'Where should generated .pptx files go?', default: defaultDir });

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

const assertNameAvailable = (cmd: Command, name: string): void => {
  const state = readState();
  if (state.servers[name]) {
    cmd.warn(
      `A server named "${name}" already exists. Re-running init will refresh its template and reinstall it.`,
    );
  }
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
      else cmd.warn(`Ignoring unknown client "${c}". Supported: claude-desktop, claude-code.`);
    }
    if (cleaned.length === 0) cmd.error('No valid --client provided.', { exit: 2 });
    return cleaned;
  }

  const installed = knownClients();
  const detected = installed.filter((c) => c.installed);
  if (!interactive) {
    if (detected.length === 0) {
      cmd.error(
        'No MCP clients detected. Pass --client claude-desktop (or another supported client) explicitly.',
        { exit: 2 },
      );
    }
    return detected.map((c) => c.id);
  }

  // Interactive: confirm each detected client; for undetected, ask if they want to set it up anyway
  const chosen: ClientId[] = [];
  for (const c of installed) {
    const message = c.installed
      ? `Install into ${c.displayName}? (${c.configPath})`
      : `${c.displayName} config not detected at ${c.configPath} — install anyway?`;
    const yes = await confirm({ message, default: c.installed });
    if (yes) chosen.push(c.id);
  }
  if (chosen.length === 0) cmd.error('No clients selected — nothing to install.', { exit: 2 });
  return chosen;
};
