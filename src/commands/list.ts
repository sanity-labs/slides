/**
 * `slidesctl list` — print the slide types a template exposes.
 *
 * Plain stdout for humans inspecting a template without an MCP client.
 */

import { Command, Flags } from '@oclif/core';
import { loadTemplate, TemplateLoadError } from '../cli/template-loader.js';

export default class List extends Command {
  static override description = 'Print the slide types a template exposes.';

  static override examples = ['<%= config.bin %> <%= command.id %> --template ./my-template'];

  static override flags = {
    template: Flags.string({
      char: 't',
      description: 'Template to load. Accepts a package name, a file path, or a directory.',
      required: true,
    }),
  };

  override async run(): Promise<void> {
    const { flags } = await this.parse(List);
    let template;
    try {
      template = await loadTemplate(flags.template);
    } catch (err) {
      if (err instanceof TemplateLoadError) this.error(err.message, { exit: 2 });
      throw err;
    }
    const lines = [`Template: ${template.name}`, '', 'Slide types:'];
    for (const [name, tc] of Object.entries(template.components)) {
      lines.push(`  • ${name} — ${tc.description ?? '(no description)'}`);
    }
    process.stdout.write(lines.join('\n') + '\n');
  }
}
