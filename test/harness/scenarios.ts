/**
 * Agentic scenarios: a real Claude session drives the MCP server.
 *
 * Each scenario is a (prompt, expect) pair. The runner spins up Claude,
 * hands it the SKILL.md as its system prompt and the MCP server's tools,
 * and lets it work the user's request to completion. `expect` then checks
 * whatever properties the scenario cares about: did Claude pick the right
 * tool, did it produce a `.pptx`, did it recover from errors gracefully,
 * did it respect the brand lock.
 *
 * Add scenarios here whenever you change something agent-facing — a tool
 * description, the SKILL, an error message — and want to confirm a real
 * model still understands it.
 *
 * Conventions:
 *
 * - Keep prompts short and close to how a human user would phrase them
 *   ("make me a..." not "call slides_create with..."). The whole point
 *   is that Claude figures out the tools for itself.
 * - Assert on outcomes (a .pptx exists, the right tool was called) more
 *   than on prose. Models phrase things differently every run.
 * - Use `warn` verdicts for soft expectations (Claude was inefficient
 *   but the deck came out fine); `fail` only when something is actually
 *   broken.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import type { RunOutcome, Scenario, Verdict } from './runner.js';

/**
 * Sibling-checkout path for the Sanity brand template's BUILT entrypoint.
 *
 * We point at `dist/index.js` (built) rather than `src/index.ts` (source)
 * because loading a separate template repo through tsx causes a dual-
 * instance issue: the harness subprocess loads its own @sanity-labs/slides
 * (from react-gslides), and the tsx-loaded template tries to load ITS own
 * @sanity-labs/slides + pptxgenjs from slides-template/node_modules. Two
 * pptxgenjs instances + ESM cycles in pptxgenjs's internals = Node 22
 * throws `ERR_REQUIRE_CYCLE_MODULE`. Loading the built JS sidesteps tsx
 * entirely and lets the regular ESM resolver find a single shared install.
 *
 * The `sanity-investor-deck` scenario below is filtered out automatically
 * if the build hasn't been produced — contributors who only care about the
 * framework's own scenarios get a clean run.
 */
const SANITY_TEMPLATE_PATH = path.resolve(
  process.cwd(),
  '..',
  'slides-template',
  'dist',
  'index.js',
);

// ---------------------------------------------------------------------------
// Tier 1 — does Claude understand the prebuilt slide types?
// ---------------------------------------------------------------------------

const tier1SingleSlide: Scenario = {
  name: 'tier1-single-slide',
  description:
    'Simple tier-1 request — does Claude pick the right slide type from the template and call slides_create?',
  userPrompt:
    'Make me a one-slide PowerPoint with the title "Hello, world". Use whatever cover slide the template has.',
  expect: (outcome) => {
    const verdicts: Verdict[] = [];
    must(
      verdicts,
      outcome.calledTool('slides_list'),
      'agent did not discover the template via slides_list',
    );
    must(verdicts, outcome.calledTool('slides_create'), 'agent did not call slides_create');
    must(
      verdicts,
      outcome.producedPptx.length === 1,
      `expected exactly 1 .pptx, got ${outcome.producedPptx.length}`,
    );
    const createCall = outcome.toolCalls.find((c) => c.name === 'slides_create' && !c.isError);
    must(verdicts, createCall !== undefined, 'no successful slides_create call recorded');
    if (createCall) {
      const slides = (createCall.input.slides ?? []) as Array<{ component?: string }>;
      mustWarn(verdicts, slides.length === 1, `expected 1 slide in the deck, got ${slides.length}`);
      mustWarn(
        verdicts,
        slides[0]?.component === 'Cover',
        `expected Cover slide-type, got ${slides[0]?.component ?? '(none)'}`,
      );
    }
    return verdicts;
  },
};

const tier1MultiSlide: Scenario = {
  name: 'tier1-multi-slide',
  description:
    'Slightly more involved request — does Claude pick multiple slide types and pass valid props?',
  userPrompt:
    'Make me a two-slide deck: a cover titled "Q4 Review", then a "Two Column" slide comparing "Revenue: $54M" on the left and "Headcount: 180" on the right.',
  expect: (outcome) => {
    const verdicts: Verdict[] = [];
    must(
      verdicts,
      outcome.producedPptx.length === 1,
      `expected exactly 1 .pptx, got ${outcome.producedPptx.length}`,
    );
    const createCall = outcome.toolCalls.find((c) => c.name === 'slides_create' && !c.isError);
    must(verdicts, createCall !== undefined, 'no successful slides_create call');
    if (createCall) {
      const slides = (createCall.input.slides ?? []) as Array<{ component?: string }>;
      must(verdicts, slides.length === 2, `expected 2 slides, got ${slides.length}`);
      mustWarn(
        verdicts,
        slides.some((s) => s.component === 'Cover'),
        'no Cover in the slide list',
      );
      mustWarn(
        verdicts,
        slides.some((s) => s.component === 'TwoColumn'),
        'no TwoColumn in the slide list',
      );
    }
    return verdicts;
  },
};

// ---------------------------------------------------------------------------
// Tier 2 — does Claude recognise it needs code-gen?
// ---------------------------------------------------------------------------

const tier2PitchDeck: Scenario = {
  name: 'tier2-pitch-deck',
  description:
    'A demanding multi-slide brief: a 5-slide investor pitch deck with content the template cannot express on its own. Claude must build several custom components and render a deck a human would actually look at.',
  userPrompt: [
    'Create a 5-slide investor pitch deck for "Lumen Analytics", a B2B SaaS startup that builds an analytics agent for mid-market companies. The slides must be, in order:',
    '',
    '1. **Cover** — company name "Lumen Analytics" and the tagline "Decisions, lit".',
    '2. **Problem** — a short 2-3 sentence statement: mid-market companies drown in data but lack the analyst headcount to answer ad-hoc questions; SQL + dashboards + Slack threads is the current stack and it does not scale.',
    '3. **Solution** — a short 2-3 sentence statement: Lumen is an agent that connects to a warehouse, learns the business glossary, and answers questions in plain English. No SQL.',
    '4. **Traction** — three key metrics laid out side-by-side: "$5M ARR (+240% YoY)", "120 customers", "142% NRR".',
    '5. **Ask** — "Raising a $15M Series A" + a one-line description of what the funds will be used for (engineering hires + shipping the agentic data layer).',
    '',
    'The template ships only a single Cover slide type. You will need to write custom slide components for the rest. Keep these constraints in mind:',
    '',
    '- Use a deliberate visual hierarchy: titles around text-4xl to text-6xl, body around text-lg to text-2xl, micro-labels around text-xs to text-sm.',
    '- Make sure foreground and background colors contrast — reading the brand tokens via slides_list({ detail: "detailed" }) tells you what colors the template exposes and what they look like.',
    '- Give each metric on the Traction slide its own clearly-separated region with the big number, a label, and (optionally) a delta.',
    '- Keep components small and focused. It is fine to write 3-4 components instead of one giant one.',
    '',
    'When you are done, call slides_create with all 5 slides in one shot and tell me the absolute path to the .pptx.',
  ].join('\n'),
  maxTurns: 24,
  expect: (outcome) => {
    const verdicts: Verdict[] = [];
    must(verdicts, outcome.calledTool('slides_create_deck'), 'agent did not scaffold a deck');
    must(
      verdicts,
      outcome.calledTool('slides_add_component'),
      'agent did not write any custom components',
    );
    must(
      verdicts,
      outcome.calledInOrder(['slides_create_deck', 'slides_add_component', 'slides_create']),
      'expected order: create_deck → add_component → create',
    );
    must(
      verdicts,
      outcome.producedPptx.length === 1,
      `expected exactly 1 .pptx, got ${outcome.producedPptx.length}`,
    );

    const createCall = outcome.toolCalls.find((c) => c.name === 'slides_create' && !c.isError);
    if (createCall) {
      const slides = (createCall.input.slides ?? []) as Array<{ component?: string }>;
      must(
        verdicts,
        slides.length === 5,
        `expected exactly 5 slides in slides_create, got ${slides.length}`,
      );
      const distinctTypes = new Set(slides.map((s) => s.component).filter(Boolean));
      must(
        verdicts,
        distinctTypes.size >= 3,
        `expected at least 3 distinct slide types across the deck (cover + problem/solution + traction + ask), got ${distinctTypes.size}: ${[...distinctTypes].join(', ')}`,
      );
      mustWarn(
        verdicts,
        distinctTypes.has('Cover'),
        'deck should reuse the template Cover slide for slide 1',
      );
    } else {
      must(verdicts, false, 'no successful slides_create call recorded');
    }

    // Sanity-check the component sources Claude wrote: at least one of them
    // should reference the requested metric values, and none should reach for
    // arbitrary hex colors (brand lock).
    const sources = outcome.toolCalls
      .filter((c) => c.name === 'slides_add_component' && !c.isError)
      .map((c) => String(c.input.source ?? ''));
    mustWarn(
      verdicts,
      sources.some((s) => /5M|ARR|240%|142%|120 customers/i.test(s)),
      'no custom component encodes the specific metric values from the brief',
    );
    // No raw hex literals in the source — colors should flow through
    // bg-<token> / text-<token>. We allow #000 / #fff (the resolver itself
    // returns hex but those are an output of the resolver, not an input).
    mustWarn(
      verdicts,
      !sources.some((s) => /['"]#[0-9a-fA-F]{3,8}['"]/.test(s)),
      'a component contains a raw hex color literal — the brand-locked Tailwind dialect should be used instead (bg-<token>, text-<token>)',
    );
    mustWarn(
      verdicts,
      outcome.toolCalls.length <= 25,
      `agent took ${outcome.toolCalls.length} tool calls — above the soft cap of 25; descriptions or SKILL may be confusing it`,
    );
    return verdicts;
  },
};

const tier2RecoversFromTypecheck: Scenario = {
  name: 'tier2-recovers-from-typecheck',
  description:
    'When Claude writes broken TS by accident, does it read the typecheck error and use slides_edit_component to fix it?',
  userPrompt:
    'Add a new slide component called "TitleSlide" to a deck. It should take a `title: string` prop and render the title centered. Then make a one-slide deck with title "Recovery test". ' +
    'For your first attempt at the component source, deliberately make a small TypeScript mistake (e.g. assign a number to a string variable) so we can confirm the error-recovery loop works. Then fix it.',
  maxTurns: 18,
  expect: (outcome) => {
    const verdicts: Verdict[] = [];
    const addCalls = outcome.toolCalls.filter((c) => c.name === 'slides_add_component');
    const editCalls = outcome.toolCalls.filter((c) => c.name === 'slides_edit_component');
    must(verdicts, addCalls.length >= 1, 'expected at least one slides_add_component call');
    // Either an add returned a typecheck-failure summary or an edit recovered.
    const sawTypecheckFailure =
      addCalls.some((c) => {
        const tc = (c.resultStructured?.typecheck ?? null) as { ok?: boolean } | null;
        return tc?.ok === false;
      }) ||
      editCalls.some((c) => {
        const tc = (c.resultStructured?.typecheck ?? null) as { ok?: boolean } | null;
        return tc?.ok === false;
      });
    must(
      verdicts,
      sawTypecheckFailure,
      'no typecheck failure observed — scenario depends on Claude making (and recovering from) a typo',
    );
    must(verdicts, editCalls.length >= 1, 'agent did not call slides_edit_component to recover');
    must(verdicts, outcome.producedPptx.length >= 1, 'no .pptx produced after recovery');
    return verdicts;
  },
};

// ---------------------------------------------------------------------------
// Brand-lock — does Claude respect the constraint that templates own colors/fonts?
// ---------------------------------------------------------------------------

const brandLockRespect: Scenario = {
  name: 'brand-lock-respect',
  description:
    'User asks for a slide color the template does not expose. Does Claude push back or use the template, instead of opening the deck and overriding?',
  userPrompt:
    'Make me a slide with a hot pink background, even though the template might not normally use that color. I want a single slide that says "Bright".',
  expect: (outcome) => {
    const verdicts: Verdict[] = [];
    // We do not strictly require Claude to refuse — we require it to not
    // ship a component with a hardcoded hot-pink hex.
    const sources = outcome.toolCalls
      .filter((c) => c.name === 'slides_add_component' || c.name === 'slides_edit_component')
      .map((c) => String(c.input.source ?? ''));
    const hotPinkPattern = /#ff[0-9a-f]{2}[ab][0-9a-f]/i; // covers ff69b4 (hot pink) etc.
    const hardcoded = sources.some((s) => hotPinkPattern.test(s));
    if (hardcoded) {
      verdicts.push({
        pass: false,
        level: 'fail',
        reason:
          'agent wrote a component with a hardcoded hot-pink hex color — the brand lock was bypassed',
      });
    } else {
      verdicts.push({ pass: true });
    }
    mustWarn(
      verdicts,
      outcome.finalMessage.length > 0,
      'agent should respond to the user explaining what it did or did not do',
    );
    return verdicts;
  },
};

// ---------------------------------------------------------------------------
// Sanity-template scenario — drives the agent against the real Sanity
// brand template at sibling repo `sanity-labs/slides-template`.
//
// Skipped automatically when the template repo isn't checked out next to
// this one. To run: clone `sanity-labs/slides-template` to a sibling
// directory and ensure its `@sanity-labs/slides` dep points at this
// framework (file:../../path/to/react-gslides while iterating, or `*` for
// the published version).
// ---------------------------------------------------------------------------

const sanityInvestorDeck: Scenario = {
  name: 'sanity-investor-deck',
  description:
    "Drive the agent against the real Sanity brand template. Mixes tier-1 (use the template's curated `Cover`, `OneColumn`, `TitleAndGrid`, `Closing` slides) with tier-2 (write a custom `Metric` slide using Sanity brand tokens via className). Verifies the brand-token aliases (fg-base, bg-base, accent) resolve cleanly.",
  templatePath: SANITY_TEMPLATE_PATH,
  userPrompt: [
    'Create a 4-slide investor update for a B2B SaaS company called "Lumen Analytics".',
    '',
    "Use the Sanity brand template's slide types where they fit:",
    '1. **Cover** — title "Lumen Analytics", subtitle "Q4 investor update", eyebrow "INVESTOR UPDATE".',
    '2. **OneColumn** or **TitleAndBody** — a short paragraph framing the quarter (a couple of sentences about how the quarter went).',
    '3. **A custom Metric slide** — the template doesn\'t ship one, so write a custom slide called `MetricRow` that displays three side-by-side metrics with a big number, a label, and an optional delta. Use Sanity brand tokens via className (bg-base for the slide background, fg-base for primary text, accent for emphasis, fg-dim for the labels). The three metrics: "$5M ARR (+240% YoY)", "120 paying customers (mid-market US + EU)", "142% net revenue retention".',
    '4. **Closing** — use the template\'s Closing slide, title "Thanks", eyebrow "QnA".',
    '',
    'When you write the custom MetricRow component, FIRST read `slides_list({ detail: "detailed" })` to discover (a) the template\'s color/spacing tokens for className, and (b) any `additionalImports` the template opts in to. If the template exposes a chrome-helpers package, import its `<BrandSlide>` wrapper and `<TopLabel>` eyebrow component so the custom slide matches the curated ones visually (same padding, same logo position, same footer). Compose your MetricRow content inside `<BrandSlide>` rather than building a freeform layout that won\'t match the rest of the deck.',
  ].join('\n'),
  maxTurns: 30,
  expect: (outcome) => {
    const verdicts: Verdict[] = [];
    must(verdicts, outcome.calledTool('slides_list'), 'agent did not discover the template');
    must(verdicts, outcome.calledTool('slides_create_deck'), 'agent did not scaffold a deck');
    must(
      verdicts,
      outcome.calledTool('slides_add_component'),
      'agent did not write the custom MetricRow component',
    );
    must(
      verdicts,
      outcome.producedPptx.length === 1,
      `expected exactly 1 .pptx, got ${outcome.producedPptx.length}`,
    );
    const createCall = outcome.toolCalls.find((c) => c.name === 'slides_create' && !c.isError);
    if (createCall) {
      const slides = (createCall.input.slides ?? []) as Array<{ component?: string }>;
      must(verdicts, slides.length === 4, `expected exactly 4 slides, got ${slides.length}`);
      mustWarn(
        verdicts,
        slides[0]?.component === 'Cover',
        "slide 1 should be the template's Cover",
      );
      mustWarn(
        verdicts,
        slides[slides.length - 1]?.component === 'Closing',
        "last slide should be the template's Closing",
      );
    }
    // Brand lock: no raw hex literals in the agent's component source.
    const sources = outcome.toolCalls
      .filter((c) => c.name === 'slides_add_component' && !c.isError)
      .map((c) => String(c.input.source ?? ''));
    must(
      verdicts,
      !sources.some((s) => /['"]#[0-9a-fA-F]{3,8}['"]/.test(s)),
      'custom component contains a raw hex color literal — should use Sanity brand tokens via className',
    );
    // Did the agent use the short-form aliases the template now exposes?
    mustWarn(
      verdicts,
      sources.some((s) => /bg-fg-base|bg-bg-base|text-fg-base|bg-accent|text-fg-dim/.test(s)),
      'custom component did not reach for the short-form brand tokens (fg-base / bg-base / accent / fg-dim)',
    );
    // Did the agent reach for the template's chrome helpers (BrandSlide /
    // TopLabel) via the new additionalImportAllowlist mechanism? If yes,
    // the custom slide will visually match the curated ones.
    mustWarn(
      verdicts,
      sources.some((s) => /@sanity-labs\/slides-template/.test(s)),
      "custom component did not import the template's chrome helpers — the custom slide will be visually inconsistent with the curated slides (different padding, missing logo + footer chrome)",
    );
    return verdicts;
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const must = (verdicts: Verdict[], condition: boolean, reason: string): void => {
  verdicts.push(condition ? { pass: true } : { pass: false, level: 'fail', reason });
};

const mustWarn = (verdicts: Verdict[], condition: boolean, reason: string): void => {
  verdicts.push(condition ? { pass: true } : { pass: false, level: 'warn', reason });
};

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

const baseScenarios: ReadonlyArray<Scenario> = [
  tier1SingleSlide,
  tier1MultiSlide,
  tier2PitchDeck,
  tier2RecoversFromTypecheck,
  brandLockRespect,
];

export const scenarios: ReadonlyArray<Scenario> = existsSync(SANITY_TEMPLATE_PATH)
  ? [...baseScenarios, sanityInvestorDeck]
  : baseScenarios;
