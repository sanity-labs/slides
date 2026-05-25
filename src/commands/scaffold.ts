/**
 * `slidesctl scaffold` — stamp a new brand-template project into `<dir>`.
 *
 * Replaces the old `npm create react-pptx-template` flow. Brand templates
 * are author-owned packages — the agent never edits them.
 */

import { Args, Command, Flags } from '@oclif/core';
import { defaultName, scaffoldTemplate, validateName } from '../scaffold/index.js';

export default class Scaffold extends Command {
  static override description = 'Scaffold a new brand template into <dir>.';

  static override examples = [
    '<%= config.bin %> <%= command.id %> my-template',
    '<%= config.bin %> <%= command.id %> my-template --name @acme/slide-template',
  ];

  static override args = {
    dir: Args.string({
      description: 'Target directory for the new template.',
      required: true,
    }),
  };

  static override flags = {
    name: Flags.string({
      description: 'Template name (default: inferred from <dir>).',
    }),
  };

  override async run(): Promise<void> {
    const { args, flags } = await this.parse(Scaffold);
    const name = flags.name ?? defaultName(args.dir);
    const nameError = validateName(name);
    if (nameError) {
      this.error(
        `Invalid template name "${name}": ${nameError}. Pass --name <slug> with a valid name.`,
        { exit: 2 },
      );
    }
    const result = scaffoldTemplate({ target: args.dir, name });
    process.stdout.write(`Scaffolded ${result.fileCount} files into ${result.targetPath}\n`);
    process.stdout.write(
      `\nNext steps:\n  cd ${args.dir}\n  pnpm install\n  pnpm dev   # open the viewer\n  pnpm build # emit dist/ so slidesctl can serve it\n`,
    );
  }
}
