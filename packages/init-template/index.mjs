#!/usr/bin/env node

import { cancel, intro, isCancel, log, outro, spinner, text } from '@clack/prompts';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import pc from 'picocolors';

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_BASE = resolvePath(HERE, 'template-base');

const main = async () => {
  const cliTarget = process.argv[2];
  const isTTY = process.stdin.isTTY === true;

  const target = await resolveTarget(cliTarget, isTTY);
  const name = await resolveName(target, isTTY);

  const targetPath = resolvePath(process.cwd(), target);
  if (existsSync(targetPath) && readdirSync(targetPath).length > 0) {
    fail(`${pc.red(targetPath)} already exists and is not empty.`);
  }

  if (isTTY) intro(pc.bold(pc.bgMagenta(pc.white(' create-react-pptx-template '))));

  const s = isTTY ? spinner() : null;
  s?.start('Writing files');
  copyTemplate(TEMPLATE_BASE, targetPath, { __NAME__: name, __IDENT__: toIdentifier(name) });
  const fileCount = countFiles(targetPath);
  s?.stop(`Wrote ${fileCount} files into ${pc.cyan(relative(targetPath))}`);
  if (!isTTY) {
    process.stdout.write(`Wrote ${fileCount} files into ${relative(targetPath)}\n`);
  }

  const pm = detectPackageManager();
  if (isTTY) {
    log.info(nextSteps({ pm, target: relative(targetPath) }));
    outro(
      `${pc.green('✓')} Ready. ${pc.dim('See the README in your project for the full API tour.')}`,
    );
  } else {
    process.stdout.write('\n' + stripAnsi(nextSteps({ pm, target: relative(targetPath) })) + '\n');
  }
};
const resolveTarget = async (cliTarget, isTTY) => {
  if (cliTarget) return cliTarget;
  if (!isTTY) fail('Missing target directory. Usage: npm create react-pptx-template@latest <dir>');
  intro(pc.bold(pc.bgMagenta(pc.white(' create-react-pptx-template '))));
  const answer = await text({
    message: 'Where should we create your template?',
    placeholder: './my-template',
    defaultValue: './my-template',
    validate: (v) => (v ? undefined : 'Required'),
  });
  if (isCancel(answer)) {
    cancel('Cancelled. No files written.');
    process.exit(0);
  }
  return answer;
};

const resolveName = async (target, isTTY) => {
  const fromTarget = defaultName(target);
  if (validateName(fromTarget) === undefined) return fromTarget;
  if (!isTTY) {
    fail(`Cannot infer a valid package name from "${target}". Pass a slug like "my-template".`);
  }
  const answer = await text({
    message: 'Template name (used as the package + Template name)?',
    placeholder: 'my-template',
    validate: validateName,
  });
  if (isCancel(answer)) {
    cancel('Cancelled. No files written.');
    process.exit(0);
  }
  return answer;
};
const copyTemplate = (src, dst, replacements) => {
  mkdirSync(dst, { recursive: true });
  for (const entry of readdirSync(src)) {
    const srcEntry = join(src, entry);
    const dstEntry = join(dst, denormaliseFilename(entry));
    if (statSync(srcEntry).isDirectory()) {
      copyTemplate(srcEntry, dstEntry, replacements);
      continue;
    }
    writeFileSync(dstEntry, applyReplacements(readFileSync(srcEntry, 'utf8'), replacements));
  }
};

const denormaliseFilename = (name) => (name === '_gitignore' ? '.gitignore' : name);

const applyReplacements = (content, replacements) => {
  let out = content;
  for (const [from, to] of Object.entries(replacements)) out = out.split(from).join(to);
  return out;
};

const countFiles = (dir) => {
  let n = 0;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) n += countFiles(full);
    else n += 1;
  }
  return n;
};

const relative = (abs) => abs.replace(process.cwd() + '/', '');
const toIdentifier = (name) => name.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());

const defaultName = (target) => {
  const last = (target ?? './my-template').split('/').filter(Boolean).pop() ?? 'my-template';
  return last.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
};

const validateName = (value) => {
  if (!value) return 'Required';
  if (!/^[a-z0-9][a-z0-9-]*$/.test(value)) {
    return 'Must start with a letter or digit and contain only [a-z0-9-].';
  }
  return undefined;
};

const detectPackageManager = () => {
  const ua = process.env.npm_config_user_agent ?? '';
  if (ua.startsWith('pnpm')) return 'pnpm';
  if (ua.startsWith('yarn')) return 'yarn';
  if (ua.startsWith('bun')) return 'bun';
  return 'npm';
};

const nextSteps = ({ pm, target }) => {
  const cmds =
    pm === 'npm'
      ? { install: 'npm install', dev: 'npm run dev' }
      : { install: `${pm} install`, dev: `${pm} dev` };
  return [
    pc.bold('Next steps:'),
    `  ${pc.cyan('cd')} ${target}`,
    `  ${pc.cyan(cmds.install)}`,
    `  ${pc.cyan(cmds.dev)}`,
    '',
    pc.dim('The viewer opens at http://localhost:5173. Edit src/preview.tsx or any component'),
    pc.dim('and the page hot-reloads.'),
  ].join('\n');
};

const stripAnsi = (s) => s.replace(/\u001b\[[0-9;]*m/g, '');

const fail = (msg) => {
  process.stderr.write(`${msg}\n`);
  process.exit(1);
};

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
