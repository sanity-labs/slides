/**
 * `slidesctl generate` — read `{ title, slides }` JSON from stdin and write
 * the resulting `.pptx`. The absolute file path is printed to stdout on
 * success. Exit 3 if the input references an unknown component name.
 */

import { Command, Flags } from '@oclif/core';
import { renderSlides } from '../mcp/render.js';
import { describeError, loadTemplate, TemplateLoadError } from '../cli/template-loader.js';
import { newRuntime, readStdin } from '../cli/runtime-helpers.js';

export default class Generate extends Command {
  static override description =
    'Read { title, slides } JSON from stdin, write a .pptx file. Prints the absolute path.';

  static override examples = [
    'echo \'{"title":"x","slides":[]}\' | <%= config.bin %> <%= command.id %> --template ./my-template',
  ];

  static override flags = {
    template: Flags.string({
      char: 't',
      description: 'Template to load. Accepts a package name, a file path, or a directory.',
      required: true,
    }),
    output: Flags.string({
      char: 'o',
      description: 'Output directory for the generated .pptx file (defaults to cwd).',
    }),
  };

  override async run(): Promise<void> {
    const { flags } = await this.parse(Generate);

    let template;
    try {
      template = await loadTemplate(flags.template);
    } catch (err) {
      if (err instanceof TemplateLoadError) this.error(err.message, { exit: 2 });
      throw err;
    }

    const runtime = newRuntime(flags.output);

    const raw = await readStdin();
    if (raw.trim().length === 0) {
      this.error(
        'generate: no input on stdin. Pipe JSON of { title, slides: [{ component, props }] }.',
        { exit: 2 },
      );
    }

    let input: { title?: unknown; slides?: unknown };
    try {
      input = JSON.parse(raw) as typeof input;
    } catch (err) {
      this.error(`generate: invalid JSON on stdin: ${describeError(err)}`, { exit: 2 });
    }
    if (typeof input.title !== 'string' || !Array.isArray(input.slides)) {
      this.error('generate: input must be { title: string, slides: array }.', { exit: 2 });
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
    this.error(result.message, { exit: result.code === 'unknown_component' ? 3 : 2 });
  }
}
