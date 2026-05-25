/**
 * `slidesctl skill` — print the bundled `SKILL.md` to stdout.
 *
 * With `--path`, prints the absolute path instead of the file contents.
 * Useful for piping the Skill into Claude project settings or for human
 * inspection ahead of an MCP session.
 */

import { readFileSync } from 'node:fs';
import { Command, Flags } from '@oclif/core';
import { resolveSkillPath } from '../cli/runtime-helpers.js';

export default class Skill extends Command {
  static override description = 'Print the bundled SKILL.md (or its absolute path).';

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --path',
  ];

  static override flags = {
    path: Flags.boolean({
      description: "Print SKILL.md's absolute path instead of its contents.",
      default: false,
    }),
  };

  override async run(): Promise<void> {
    const { flags } = await this.parse(Skill);
    const skillPath = resolveSkillPath();
    if (flags.path) {
      process.stdout.write(`${skillPath}\n`);
      return;
    }
    process.stdout.write(readFileSync(skillPath, 'utf8'));
  }
}
