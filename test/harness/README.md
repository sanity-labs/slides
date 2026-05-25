# `test/harness` — agentic MCP harness

A real Claude session drives the real `slidesctl serve` subprocess through
the MCP wire protocol for each scenario in `scenarios.ts`. Run from your
shell while iterating on tool descriptions, the SKILL, or any
agent-facing surface to confirm a real model still understands the
server.

Not a unit test. **Not in CI.** It costs real Anthropic credits per run.

## Why this exists

Unit tests cover the protocol contract — given input X, the server
returns Y. They miss the things that only show up when an LLM is in the
loop: ambiguous tool descriptions, missing error context, the model
looping on a reconciler error because the error message lacks rect info,
hidden bugs in low-level rendering paths.

The first three real harness runs found:

- An **empty-deck regression in the renderer** that had been latent the
  whole life of the project. The reconciler compared primitives with
  `===`, but src and dist hold different `Slide`/`Box`/`Text` function
  instances, so every agent-authored component got silently dropped.
  Unit tests didn't catch it because they only checked the `.pptx` magic
  bytes, not its slide contents.
- A **missing template-inheritance feature** Claude noticed immediately:
  *"the deck is empty — Cover from the original template isn't here."*
  Now the deck's components are merged on top of the brand template at
  render time instead of clobbering it.
- An **error-message ergonomics bug** where Claude burned 24 turns and
  ~600k tokens chasing a reconciler error to the wrong sibling Box. The
  error said `Slide[3] > Box[3]` (correct) but Claude couldn't tell which
  Box that was without counting source. After adding the offending Box's
  `rect` to the error path, the same scenario converged in 5 turns and
  64k tokens.

Each of those would have shipped in a "verify-bins green" PR without the
harness.

## Setup

1. Build the bin once. The harness spawns `dist/cli.js` as a subprocess.

   ```sh
   pnpm build
   ```

2. Drop your Anthropic key into `.env` at the repo root. The harness
   auto-loads it. `.env` is git-ignored; `.env.template` shows the
   shape.

   ```sh
   cp .env.template .env
   $EDITOR .env   # set ANTHROPIC_API_KEY=sk-ant-...
   ```

## Running

```sh
pnpm harness                                  # all scenarios
pnpm harness --only tier2-pitch-deck          # one scenario
pnpm harness --verbose                        # per-turn trace + tool calls
pnpm harness --keep-output ~/Downloads        # copy produced .pptx files out
                                              #   before the scenario tmp dir
                                              #   is swept
HARNESS_MODEL=claude-sonnet-4-6 pnpm harness  # override the model
```

`pnpm harness --help` for the full flag list.

Exit code 0 if every scenario's hard verdicts (`fail` level) passed;
non-zero otherwise. `warn`-level verdicts don't fail the run.

## What runs per scenario

For each scenario:

1. Spawn `node dist/cli.js serve --template <fixture> --output <tmp>` as
   a subprocess.
2. Connect an MCP client over `StdioClientTransport`.
3. Load `SKILL.md` (frontmatter stripped) as the Anthropic system
   prompt — mirrors how Claude Desktop loads a Skill.
4. Run the agent loop in `agent-loop.ts`: send the scenario's
   `userPrompt`, execute every `tool_use` block against the MCP client,
   feed `tool_result` back, repeat until `stop_reason !== 'tool_use'` or
   the turn cap.
5. Pass the resulting `RunOutcome` to the scenario's `expect` callback.
6. Tear down: close the client, kill the subprocess, sweep the tmp dir
   (unless `--keep-output` is set).

## What a scenario looks like

```ts
import type { Scenario, Verdict } from './runner.js';

const tier1SingleSlide: Scenario = {
  name: 'tier1-single-slide',
  description: 'Simple tier-1 request — does Claude pick the right slide type?',
  userPrompt:
    'Make me a one-slide PowerPoint with the title "Hello, world". Use ' +
    'whatever cover slide the template has.',
  // optional: override the 12-turn cap; only bump for scenarios that
  // genuinely need more (deep code-gen, error recovery).
  maxTurns: 12,
  expect: (outcome) => {
    const verdicts: Verdict[] = [];
    must(verdicts, outcome.calledTool('slides_create'), 'no slides_create call');
    must(verdicts, outcome.producedPptx.length === 1, 'expected 1 .pptx');
    return verdicts;
  },
};
```

### The outcome surface

Each scenario's `expect(outcome)` gets a `RunOutcome` carrying:

- `toolCalls`: `{ name, input, isError, resultText, resultStructured, durationMs }[]`
- `calledTool(name)`: did the agent ever invoke this tool?
- `calledInOrder(names)`: did the agent invoke these in this order (gaps allowed)?
- `producedPptx`: absolute paths of every `.pptx` left in the scenario's output dir
- `finalMessage`: the assistant's final text content
- `stopReason`: `'end_turn'` | `'max_turns_reached'` | `'tool_use'` (only if capped) | etc.
- `turnCount`, `tokens.input`, `tokens.output`, `durationMs`
- `events`: a structured time-ordered trace (`turn-start`, `tool-call`,
  `tool-result`, `assistant-text`, `stop`)

### Verdicts

`expect` can return:

- `true` / `undefined` / `null` — pass
- `false` — fail
- string — fail, with the string as the reason
- a `Verdict` — `{ pass: true }` or `{ pass: false, level: 'fail' | 'warn', reason }`
- an array of `Verdict`s

The helpers `must(...)` (fail) and `mustWarn(...)` (warn) in
`scenarios.ts` accumulate into a verdict array — see the existing
scenarios for the pattern. Use `warn` for soft signals (agent was
inefficient but the deck came out fine); `fail` only when something is
genuinely broken.

## Adding a scenario

1. Open `scenarios.ts` and add a new `Scenario` export.
2. Write a `userPrompt` that mirrors how a real user would phrase the
   request. Don't tell Claude *which tools* to call; the whole point is
   that it picks them from the descriptions + SKILL.
3. In `expect`, assert on **outcomes** (the right tool was called, the
   `.pptx` exists, a custom component encodes the requested values), not
   on prose. Models phrase things differently every run.
4. Add it to the `scenarios` array at the bottom of the file.
5. Run `pnpm harness --only <your-scenario-name> --verbose` and read the
   trace until you're happy.

Keep scenarios independent — each one spawns its own server with a
fresh output dir. Avoid scenarios that depend on each other.

## Cost expectations

Rough numbers from real runs at the time of writing:

| Scenario | Turns | Tokens (in→out) | ~Cost |
| --- | --- | --- | --- |
| tier1-single-slide | 2-3 | 25k → 0.3k | ~$0.40 |
| tier1-multi-slide | 5-6 | 55k → 2.5k | ~$1.00 |
| tier2-pitch-deck (happy) | 5-7 | 60k → 6k | ~$1.40 |
| tier2-pitch-deck (loops) | 24+ | 600k+ → 30k | ~$10+ |
| tier2-recovers-from-typecheck | 6-7 | 55k → 2k | ~$1.00 |
| brand-lock-respect | 5-6 | 55k → 1.5k | ~$1.00 |

Full run with the current scenarios: ~$4-7 when things work, more when
the harness is uncovering a real bug. If you're iterating on tool
descriptions, use `--only` so you don't pay full freight per attempt.

## Debugging a failed scenario

1. **`--verbose`.** Surfaces the per-turn trace: every tool call with
   its input (truncated), every result with the success/error flag, and
   every assistant text block.
2. **Look at the actual `.pptx`.** Add `--keep-output ~/Downloads` and
   open the file. The previous black-slide bug was invisible without
   this step — the harness reported pass on what was an empty-deck
   shell.
3. **Check the deck on disk.** When Claude calls `slides_create_deck`,
   it picks the directory (often something like `/tmp/<name>-deck`).
   Inspect `<dir>/src/components/*.tsx` to see the code the agent
   wrote, and `src/index.ts` for the registration anchors.
4. **Reproduce without API calls.** Once you have the deck on disk,
   `node ./dist/cli.js generate --template <dir>/src/index.ts --output <dir>`
   with a hand-rolled `{ title, slides }` payload runs the same render
   path the harness used, without going through Claude. Useful for
   isolating reconciler / runtime bugs from agent-behaviour bugs.
5. **Strip the failing assertions one at a time** until the scenario
   passes. The remaining assertions tell you what the model did
   correctly; the stripped ones tell you what's broken.

## Files

- `index.ts` — CLI entry (parses `--verbose` / `--only` / `--keep-output`, calls `runAll`).
- `runner.ts` — spawns the server subprocess, wires the MCP +
  Anthropic clients, runs each scenario, formats results.
- `agent-loop.ts` — the Anthropic ↔ MCP bridge. Each turn: send
  conversation + tools to Claude → execute `tool_use` via MCP →
  append `tool_result` → loop. Cap at `DEFAULT_MAX_TURNS` (12).
- `scenarios.ts` — the actual scenarios. Edit this file when iterating.
