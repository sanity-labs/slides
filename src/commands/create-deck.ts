/**
 * `slidesctl create-deck` — scaffold an agent-writable deck project.
 *
 * Decks inherit the `@sanity-labs/slides` primitives but ship with no slide
 * components — the agent writes them via the MCP code-gen tools. The deck's
 * `src/index.ts` carries `<generated-imports>` / `<generated-components>`
 * anchors that the code-gen layer owns.
 */

import { Args, Command, Flags } from '@oclif/core';
import { createDeck } from '../code-gen/index.js';

export default class CreateDeck extends Command {
  static override description = 'Scaffold an agent-writable deck project into <dir>.';

  static override examples = [
    '<%= config.bin %> <%= command.id %> ./my-deck',
    '<%= config.bin %> <%= command.id %> ./my-deck --name custom-deck',
  ];

  static override args = {
    dir: Args.string({
      description: 'Target directory for the new deck project.',
      required: true,
    }),
  };

  static override flags = {
    name: Flags.string({
      description: 'Deck project name (default: inferred from <dir>).',
    }),
  };

  override async run(): Promise<void> {
    const { args, flags } = await this.parse(CreateDeck);
    const result = await createDeck({ dir: args.dir, ...(flags.name ? { name: flags.name } : {}) });
    process.stdout.write(`Scaffolded deck at ${result.deckPath}\n`);
    process.stdout.write(
      `\nNext steps:\n` +
        `  Pipe slide specs to slidesctl generate --template ${result.deckPath}/src/index.ts\n` +
        `  Or wire the deck into Claude via slidesctl serve and call slides_add_component.\n`,
    );
  }
}
