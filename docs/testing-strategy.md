# Testing strategy

## TL;DR

Three layers, all local, all deterministic, all fast. No HTTP-level mocks.

We do **not** validate "does the deck look right when opened in PowerPoint / Keynote / Google Slides." We validate "does the reconciler emit the correct operations." Given the reconciler is deterministic, those are the same question, and the second is testable in milliseconds without a network call.

A render backend (PPTX today, others later) is a thin translator at the edge; its own correctness is covered by a small smoke test that produces a real artifact and checks file-level invariants (magic number, opens at all).

## The pyramid

```
       ┌──────────────────────────────────────┐
       │   3. MCP integration (fake runtime)  │  per-tool, full protocol
       └──────────────────────────────────────┘
     ┌──────────────────────────────────────────┐
     │  2. Reconciler ops-sequence golden tests │  React tree -> ops, snapshot
     └──────────────────────────────────────────┘
   ┌────────────────────────────────────────────────┐
   │  1. Component unit + schema assertion tests    │  fastest, most numerous
   └────────────────────────────────────────────────┘

                          +

       ┌──────────────────────────────────────────────┐
       │   Backend smoke: real artifact written       │  e.g. .pptx → file
       └──────────────────────────────────────────────┘
```

All layers run on every PR. Total wall-clock target: under 30s.

## Layer 1 — component + schema tests

Per high-level component (`<Cover>`, `<TitleAndGrid>`, etc.):

- Valid prop combinations render successfully.
- Invalid prop combinations fail Zod parsing with a useful error message.
- Edge cases (empty children, max children, conditional variants) behave correctly.
- Schema fingerprint stable across runs (catches accidental schema mutation).

Tools: `vitest`, `@testing-library/react` only when actually rendering DOM (rare; most tests run the React tree through the test renderer).

Speed: thousands of tests, total under 5s.

## Layer 2 — reconciler ops-sequence goldens

The reconciler turns a React tree into a sequence of typed `SlideOp` records. We capture that sequence and snapshot it.

```ts
// example shape
test('Cover with title and subtitle emits expected ops', () => {
  const { ops } = renderToOps({
    tree: <Cover title="Hello" subtitle="World" />,
    brand: sanityTemplate,
    deckId: null,
  });
  expect(ops).toMatchSnapshot();
});
```

What snapshots include:

- The full `SlideOp[]` the reconciler emits
- All `createSlide`, `createShape`, `insertText`, `updateTextStyle` ops in order
- Slot IDs (alt-text-as-ID per `generation-model.md`)
- The generation manifest entry that would be written

Why goldens, not assertion-style: the ops sequence is large and structural. PR diffs are the right interface for review — "this changed, is it intentional?"

Snapshot files live in `__snapshots__/` next to the test, committed to the repo.

Speed: hundreds of tests, total under 5s.

## Layer 3 — MCP integration

The MCP server is wired up against a real `PptxSlidesRuntime` writing to a tempdir, and driven via the SDK's `InMemoryTransport` so the full MCP protocol is exercised without spawning a child process. Tests assert on the `.pptx` file the tool wrote, plus the structured error shapes for the validation paths.

The per-layer test for the reconciler itself (Layer 2) still uses `FakeSlidesRuntime` for fine-grained op-stream assertions — the runtime contract is the seam, not the wire.

```ts
const runtime = new PptxSlidesRuntime({ outputDir: tempDir });
const server = createSlideServer({ template: sanity, runtime });
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
await server.connect(serverTransport);
await client.connect(clientTransport);

const result = await client.callTool({
  name: 'slides_create',
  arguments: { title: 'Q2', slides: [...] },
});
```

Per-tool tests cover:

- Tool is registered with the expected schema
- Valid input produces valid output structure
- Invalid input produces a `result.isError: true` with actionable next-step guidance (per Anthropic MCP best-practices)
- The fake runtime received the expected sequence of calls
- The generation manifest was written/updated correctly

Speed: ~50 tests, total under 15s.

## The architectural seam

All three layers depend on one interface:

```ts
interface SlidesRuntime {
  applyOps(deckId: string, ops: readonly SlideOp[]): Promise<ApplyOpsResult>;
  createDeckFromMaster(masterRef: string, title: string): Promise<{ deckId: string }>;
  listAvailableFonts(): Promise<ReadonlySet<string>>;
  uploadImage(bytes: Uint8Array, mimeType: string): Promise<{ url: string }>;
}

class PptxSlidesRuntime implements SlidesRuntime {
  /* emits .pptx via pptxgenjs */
}
class FakeSlidesRuntime implements SlidesRuntime {
  /* records calls, in-memory deck */
}
```

Production uses a real backend (today: `PptxSlidesRuntime`). Reconciler tests use `FakeSlidesRuntime` for op-level introspection; MCP integration tests use `PptxSlidesRuntime` with a tempdir so the assertion target is a real `.pptx` file. **Never HTTP-level mocks** — they drift from real backends and lull you into a false sense of security.

## Backend smoke tests

A handful of tests produce a real artifact end-to-end to catch backend regressions:

- `pptx-smoke.test.ts` — Cover component → reconciler → PptxSlidesRuntime → `.pptx` file. Asserts the file exists and has the ZIP magic number (PPTX is a ZIP container). Catches `pptxgenjs` version bumps that break our emit path.
- `pptx-mcp.test.ts` — same path but through the MCP `slides_create` tool. Catches integration bugs between the framework and the runtime.

These do not validate visual rendering. They prove the artifact is well-formed.

## What we explicitly are not doing

- ❌ Selenium/Playwright against any rendered slide UI (tests the viewer's renderer, not ours)
- ❌ HTTP-level mocks of any backend API (drift over time)
- ❌ One big e2e test that runs everything on every PR (flaky, expensive, low-signal)
- ❌ LLM-judged visual evals (overkill given reconciler determinism)
- ❌ Pixelmatch / visual snapshot baselines (reconciler ops golden is sufficient evidence)
- ❌ Tests for the LLM's ability to call our tools correctly (LLM provider's job; ours is to give it good schemas + clear errors)
