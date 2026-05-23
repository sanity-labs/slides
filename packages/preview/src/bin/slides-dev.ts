#!/usr/bin/env node

import { realpathSync } from 'node:fs';
import { basename } from 'node:path';
import pc from 'picocolors';
import { startDevServer } from '../dev-server/start.js';
import { formatBanner, formatReady, formatStartupError } from '../dev-server/output.js';

const USAGE = `${pc.bold('Usage:')} slides-dev [options]

${pc.bold('Options:')}
  --port <n>       Dev server port. Default: 5173.
  --host <h>       Dev server host. Default: localhost.
                   Pass --host with no value to expose on the network.
  -h, --help       Show this help.

Run from your template package directory.
`;

type ParsedFlags = {
  port?: number;
  host?: string;
  exposed: boolean;
};

const parseFlags = (argv: readonly string[]): ParsedFlags => {
  const out: ParsedFlags = { exposed: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      process.stdout.write(USAGE);
      process.exit(0);
    }
    if (arg === '--port') {
      const v = argv[++i];
      if (!v) throw new Error('Missing value for --port');
      out.port = Number.parseInt(v, 10);
      continue;
    }
    if (arg === '--host') {
      const v = argv[i + 1];
      if (v && !v.startsWith('--')) {
        out.host = v;
        i++;
      } else {
        out.host = '0.0.0.0';
      }
      out.exposed = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return out;
};

const main = async (): Promise<void> => {
  const flags = parseFlags(process.argv.slice(2));
  const handle = await startDevServer({
    cwd: process.cwd(),
    ...(flags.port !== undefined ? { port: flags.port } : {}),
    ...(flags.host !== undefined ? { host: flags.host } : {}),
  });

  const templateName = inferTemplateName(handle.templatePath);
  process.stdout.write(formatBanner(templateName, handle.startedInMs));
  process.stdout.write(
    formatReady({
      url: handle.url,
      templatePath: handle.templatePath,
      host: flags.exposed,
    }),
  );
  process.stdout.write('\n');

  const shutdown = async () => {
    await handle.server.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
};

const findPackageDirName = (templatePath: string): string | undefined => {
  const parts = templatePath.split('/').filter(Boolean);
  for (let i = parts.length - 1; i >= 0; i--) {
    if (parts[i] === 'src' && i > 0) return parts[i - 1];
  }
  return undefined;
};

const inferTemplateName = (templatePath: string): string =>
  findPackageDirName(templatePath) ?? basename(templatePath, '.ts');

const argvPath = process.argv[1];
const isEntrypoint = argvPath !== undefined && import.meta.filename === realpathSync(argvPath);
if (isEntrypoint) {
  main().catch((err: unknown) => {
    process.stderr.write(formatStartupError(err));
    process.exit(1);
  });
}
