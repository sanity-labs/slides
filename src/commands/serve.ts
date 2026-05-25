/**
 * `slidesctl serve` — start an MCP server over stdio.
 *
 * The MCP surface (the seven `slides_*` tools) is derived from the loaded
 * template's components plus the code-gen helpers. See `src/mcp/server.ts`
 * for what gets registered.
 */

import { Command, Flags } from '@oclif/core';
import { createSlideServer } from '../mcp/server.js';
import { loadTemplate, TemplateLoadError } from '../cli/template-loader.js';
import { newRuntime } from '../cli/runtime-helpers.js';

export default class Serve extends Command {
  static override description = 'Start an MCP server over stdio.';

  static override examples = [
    '<%= config.bin %> <%= command.id %> --template ./my-template',
    '<%= config.bin %> <%= command.id %> --template @acme/slide-template --output ~/Desktop',
  ];

  static override flags = {
    template: Flags.string({
      char: 't',
      description: 'Template to load. Accepts a package name, a file path, or a directory.',
      required: true,
    }),
    output: Flags.string({
      char: 'o',
      description: 'Output directory for generated .pptx files (defaults to cwd).',
    }),
    name: Flags.string({
      description: 'MCP server name override.',
    }),
  };

  override async run(): Promise<void> {
    const { flags } = await this.parse(Serve);
    let template;
    try {
      template = await loadTemplate(flags.template);
    } catch (err) {
      if (err instanceof TemplateLoadError) this.error(err.message, { exit: 2 });
      throw err;
    }
    const runtime = newRuntime(flags.output);
    const server = createSlideServer({
      template,
      runtime,
      ...(flags.name ? { serverInfo: { name: flags.name, version: '0.1.0' } } : {}),
    });
    await server.start({ transport: 'stdio' });
  }
}
