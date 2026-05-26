---
name: sanity-labs-slides
description: Drive a `@sanity-labs/slides` MCP server to generate brand-locked `.pptx` decks. Use this skill whenever an MCP server exposing tools that start with `slides_` is available — specifically `slides_list`, `slides_validate`, `slides_create`, `slides_create_deck`, `slides_add_component`, `slides_edit_component`, and `slides_build`. Trigger on anything that could end with a `.pptx` file: "make a deck", "create a PowerPoint", "build a pitch deck", "generate slides", "put together a presentation", "investor deck", "sales deck", "all-hands slides", "executive summary slides", references to a `.pptx` filename, "our brand template", or any company-internal slide format. Use this skill even when the user doesn't say the word "slides" or "PowerPoint" — if the deliverable is a slide deck, this skill applies. Teaches the two-tier workflow (fill JSON props for prebuilt slide types in tier 1; write React components with brand-locked Tailwind classes in tier 2), the validation contract, presentation-readability rules, and error-recovery patterns.
license: MIT
metadata:
  author: sanity-labs
  version: '3.3.0'
---

# @sanity-labs/slides MCP

## Quick reference

| What you want                                       | Where to go                                                                                  |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Understand the two tiers and pick one               | [Tier 1 — JSON props](#tier-1--json-props) or [Tier 2 — code-gen](#tier-2--code-gen)         |
| Discover slide types + brand tokens in one call     | `slides_list({ detail: "detailed" })`                                                        |
| Compose a deck from prebuilt slides only            | [Tier 1](#tier-1--json-props): `slides_list` → `slides_create`                               |
| Write a custom slide the template doesn't ship      | [Tier 2](#tier-2--code-gen): `slides_create_deck` → `slides_add_component` → `slides_create` |
| Look up the brand-locked Tailwind allowlist         | [Brand-locked Tailwind dialect](#brand-locked-tailwind-dialect)                              |
| Make sure text is readable when projected           | [Readability for presentations](#readability-for-presentations)                              |
| Fix a typecheck error after `slides_add_component`  | `slides_edit_component` with the corrected source                                            |
| Validate one slide's props before composing         | `slides_validate({ component, props })`                                                      |
| Final pre-flight check before reporting to the user | [Before declaring done](#before-declaring-done)                                              |

## Overview

`@sanity-labs/slides` exposes a brand's slide vocabulary as MCP tools. Templates are read-only — the agent never edits them — and there are two ways to drive the server:

1. **JSON props (the quick path).** Pick from the slide types the template already ships, fill props, render. This is the right move when the user's request maps cleanly to the template's existing types.
2. **Code-gen (the power path).** Scaffold an agent-writable **deck project** and add custom React components. Use this when the user asks for something the template author didn't anticipate (a custom chart, a non-standard layout, a slide that needs computation over props).

Most decks mix the two: a few prebuilt slide types for the parts that fit, custom components for the parts that don't.

## Core rules

### Server-enforced (failing these costs a roundtrip)

- Tailwind classes outside the allowlist are rejected with `UnknownClassError`. Stock Tailwind (`bg-pink-500`, `text-[20px]`, `hover:…`, responsive variants) is not allowed. Call `slides_list({ detail: "detailed" })` to see the template's actual tokens.
- Component names must come from `slides_list`. To add a new slide type use `slides_add_component`; PascalCase only.
- Custom components may only import `@sanity-labs/slides`, `react`, and `zod` — plus any **extras the active template opts into** via `additionalImportAllowlist`. Read `slides_list({ detail: "detailed" })`; its `additionalImports` field lists the template-specific extras (typically a brand-chrome helper package like `@sanity-labs/slides-template`). Other imports throw `add_component_failed` before any file is written.
- When a template lists an extras package, **prefer its chrome helpers over re-rolling the layout from primitives.** A brand template's `<BrandSlide>` / `<TopLabel>` / footer chrome exists so custom slides match the curated ones — same padding, same logo position, same footer text. A custom slide that uses raw primitives on a template that exposes chrome helpers will be visibly inconsistent with the deck's other slides.
- The `<generated-imports>` / `<generated-components>` anchors in a deck's `src/index.ts` are owned by the code-gen tools — hand edits get clobbered.

### Working principles

- **Brand tokens, not hex literals.** The template owns colors and spacing. `'#ff5500'` in source is the loudest signal that the agent went off-script.
- **One `slides_create` per deck.** The tool writes the `.pptx` atomically from the full slide array. Multiple calls produce multiple files, not one merged deck.
- **Tier 1 before tier 2.** Custom components become artifacts the user has to maintain. Reach for code-gen only when the template doesn't ship what's needed.
- **Flex over `rect`.** The pre-Yoga authoring surface required hand-computed `rect` on every Box; every positioning bug we hit traced back to that arithmetic. `rect` is now an escape hatch for true one-off overlays.
- **Pick text color per surface, not per slide.** The surface is the nearest ancestor `<Box>` with a `bg-<token>`. A dark card on a light slide needs light text inside the card. This is the single most common contrast bug in real runs.
- **Build for projection.** Body ≥ `text-xl`, titles ≥ `text-4xl`, metric big-numbers ≥ `text-4xl`. `text-xs` / `text-sm` body copy disappears on a projector.
- **Read schemas before guessing.** `slides_list({ detail: "detailed" })` returns both JSON Schemas and brand tokens in one call. `slides_validate` is for complex props (grids, charts), not for every cover slide.

## When to apply

Use this skill when the user asks for a slide deck and any of the following are true:

- The conversation context contains an MCP server with tool names beginning with `slides_`.
- The user references "the template", "our brand template", or a specific template name they've installed.
- The user asks for a `.pptx` / PowerPoint file.

Do **not** invent slide content with `Box`/`Text` primitives directly in arbitrary JSON. Either pick a prebuilt slide type (tier 1) or write a real React component (tier 2). Primitives are not a runtime-callable surface — they're a library you build with.

## Tool surface (8 tools total)

| Tool                    | Tier   | Use it for                                                                                                        |
| ----------------------- | ------ | ----------------------------------------------------------------------------------------------------------------- |
| `slides_list`           | both   | Discover what slide types are available. Pass `detail: "detailed"` to also get JSON Schemas.                      |
| `slides_guidelines`     | both   | Read the template's design guidelines — brand rules, do's/don'ts, visual constraints. Call once at session start. |
| `slides_validate`       | tier 1 | Validate one `{ component, props }` pair against the active schema. Optional but useful.                          |
| `slides_create`         | both   | Render an array of `{ component, props }` to `.pptx`. Returns the absolute file path.                             |
| `slides_create_deck`    | tier 2 | Scaffold a writable deck project. After this, the server's active template is the deck.                           |
| `slides_add_component`  | tier 2 | Write a new TSX slide into the deck. Imports allowlist enforced; typechecked.                                     |
| `slides_edit_component` | tier 2 | Overwrite an existing component (e.g. after a typecheck error).                                                   |
| `slides_build`          | tier 2 | Re-run tsc without writing files.                                                                                 |

## Tier 1 — JSON props

1. **Discover.** Call `slides_list` (concise). Read every `description`.
2. **Read guidelines.** If `slides_list` says guidelines are available, call `slides_guidelines` before composing any slides. Template authors use these to document brand rules, component-selection heuristics, and visual constraints that aren't captured in schemas alone.
3. **Get schemas before composing.** Call `slides_list({ detail: "detailed" })` once before writing slide props. This returns `inputJsonSchema` per slide type — your source of truth for what each slide accepts. Saves you guessing fields and round-tripping through `slides_validate`.
4. **Plan.** Map the user's request to a sequence of slide types. Common shape: `Cover` → 1–3 body slides → `Closing`.
5. **(Optional) Validate.** For complex slides (grids, lists, charts), call `slides_validate({ component, props })` to catch schema errors with field-level paths before paying the cost of a full `slides_create`. Skip if you've already cross-checked against the JSON Schema yourself.
6. **Create.** Call `slides_create({ title, slides: [...] })`. Surface the returned `filePath` verbatim.

## Tier 2 — code-gen

Use this when no prebuilt slide type fits, or when the user explicitly wants something the template doesn't cover.

1. **Scaffold.** `slides_create_deck({ dir: "<path>" })`. The directory must be empty or non-existent. The returned `deckPath` is what every other code-gen tool takes. After this call the active template **inherits the brand template's components** — every prebuilt slide type the server started with is still usable in `slides_create`. The deck itself starts with zero custom components; whatever you add via `slides_add_component` layers on top of (and can shadow) the brand set.
2. **Discover what's there.** Call `slides_list` again. Entries tagged `[deck]` came from your own code-gen calls and can be edited with `slides_edit_component`; everything else is brand-template (read-only). Pass `detail: "detailed"` to see the schemas, plus the brand's available **color tokens** and **spacing tokens** — the building blocks for the className-based layout below.
3. **Write a component.** `slides_add_component({ deckPath, name, source })`. `name` is PascalCase (`RevenueChart`, `TeamGrid`). `source` is full TSX. Layouts use **flex + brand-locked Tailwind classes**, not hand-computed rects. Canonical shape:

   ```tsx
   import type { ReactElement } from 'react';
   import { Slide, Box, Text } from '@sanity-labs/slides';
   import { z } from 'zod';

   export const TractionSchema = z
     .object({
       title: z.string().min(1),
       metrics: z
         .array(z.object({ value: z.string(), label: z.string() }))
         .min(2)
         .max(4),
     })
     .strict();

   export const Traction = ({ title, metrics }: z.infer<typeof TractionSchema>): ReactElement => (
     <Slide className="flex flex-col gap-8 p-12 bg-fg-base">
       <Box className="flex-none text-display text-5xl text-bg-surface">{title}</Box>
       <Box className="flex flex-row flex-1 gap-6">
         {metrics.map((m, i) => (
           <Box
             key={i}
             className="flex-1 flex flex-col gap-2 p-6 bg-surface-elevated justify-center"
           >
             <Box className="text-display text-4xl text-bg-surface">{m.value}</Box>
             <Box className="text-body text-sm text-bg-surface">{m.label}</Box>
           </Box>
         ))}
       </Box>
     </Slide>
   );
   ```

   **Hard rules for component sources:**
   - Export both `<Name>` (the React component) and `<Name>Schema` (the Zod schema). The anchor splicer expects exactly these names.
   - **Imports are restricted to `@sanity-labs/slides`, `react`, and `zod`.** This is enforced server-side — any other import (including Node built-ins like `fs`, external libraries like `lodash`, or relative paths to other files) causes the call to fail before any file is written. Compute everything else inline.
   - The component must return a `<Slide>` element. The canvas is 960pt × 540pt — but you rarely think in absolute numbers; flex handles sizing.
   - PascalCase component names. `RevenueChart`, `TeamGrid`. Not `revenueChart`, not `revenue-chart`.

4. **Handle typecheck errors.** `slides_add_component` always ends with a typecheck. If it fails, the response carries a `summary` with up to 20 file/line/code errors. Read it, call `slides_edit_component({ deckPath, name, source })` with the corrected source, repeat. If the same error survives a couple of fixes, surface it to the user rather than spinning.

5. **Render.** Once `slides_list` shows the components you need, call `slides_create({ title, slides: [...] })`. Mix prebuilt types and your custom ones freely.

The deck project at `deckPath` persists. The user owns it. They can inspect the React code you wrote, edit it, and rerun `slidesctl generate` themselves to regenerate the `.pptx`. Tell them where it lives.

## Brand-locked Tailwind dialect

`@sanity-labs/slides` accepts a curated subset of Tailwind classes — **allowlist, not denylist**. Arbitrary Tailwind classes (`bg-pink-500`, `text-[28px]`, `hover:…`, responsive variants, etc.) are rejected at render time with a suggestion-aware error. This is by design: it prevents drift away from the brand template's fonts, colors, and spacing scale.

### Layout

| Class                                                                 | What it does                                                        |
| --------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `flex`                                                                | Set display to flex (implied by `flex-row` / `flex-col` too)        |
| `flex-row` / `flex-col`                                               | Direction                                                           |
| `flex-1`                                                              | Grow + shrink + 0 basis (fill available space evenly with siblings) |
| `flex-grow` / `flex-shrink-0` / `flex-none` / `flex-auto`             | Fine-grained flex controls                                          |
| `gap-{0..16}`                                                         | Gap between children, 4pt per unit (`gap-4` = 16pt)                 |
| `p-{0..16}` / `px-*` / `py-*` / `pt-*` / `pr-*` / `pb-*` / `pl-*`     | Padding                                                             |
| `m-{0..16}` / `mx-*` / `my-*` / `mt-*` / `mr-*` / `mb-*` / `ml-*`     | Margin                                                              |
| `w-full` / `w-1/2` / `w-1/3` / `w-2/3` / `w-1/4` / `w-3/4` / `w-auto` | Width                                                               |
| `h-full` / `h-1/2` / `h-1/3` / `h-2/3` / `h-auto`                     | Height                                                              |
| `aspect-square` / `aspect-video`                                      | Aspect ratio                                                        |
| `items-{start,center,end,stretch}`                                    | Cross-axis alignment                                                |
| `justify-{start,center,end,between,around,evenly}`                    | Main-axis distribution                                              |

### Typography

| Class                                                           | What it does                                |
| --------------------------------------------------------------- | ------------------------------------------- |
| `text-xs` … `text-9xl`                                          | Font size, on a 13-step scale (8pt to 72pt) |
| `text-display` / `text-body` / `text-mono`                      | Map to the template's three font slots      |
| `font-bold` / `font-normal`                                     | Weight                                      |
| `italic` / `not-italic` / `underline` / `no-underline`          | Style toggles                               |
| `text-left` / `text-center` / `text-right`                      | Paragraph alignment                         |
| `tracking-{tight,normal,wide}` / `leading-{tight,normal,loose}` | Accepted but currently no-op                |

### Brand-token colors

The brand template declares its color palette as `template.colors`. Every key becomes a usable class:

- `bg-<token>` — background fill on a Box.
- `text-<token>` — foreground (text) color on text content.

`border-<token>` is **not** accepted today — the reconciler does not emit borders. If you want a separation between cards, use background contrast or padding, not borders.

Call `slides_list({ detail: "detailed" })` to see the available tokens for the active template.

### Brand-token spacing

`template.spacing` keys can be used wherever a number works on the spacing scale:

- `p-<token>` / `px-<token>` / `gap-<token>` / `m-<token>` / etc.

Bare numbers (`p-4`) resolve on the 4pt scale; named tokens (`p-md`) resolve via `template.spacing`. Both are valid; named tokens are clearer when the template defines them.

### What's rejected

Unknown classes throw with the offending name and the top-3 closest matches. Example error:

```
Unknown class "bg-pink-500". Did you mean: bg-fg-base, bg-surface, bg-accent?
Brand-locked Tailwind dialect — only the allowlist is accepted; arbitrary
Tailwind classes (bg-pink-500, text-[28px], hover:..., etc.) are not.
Template "acme" exposes: colors {accent, bg-surface, fg-base, surface-elevated};
spacing {lg, md, sm}.
```

Read the suggestion, pick the closest brand-token color or use one the template actually exposes, then call `slides_edit_component` with the fix.

## Readability for presentations

These decks render to PowerPoint files that get **projected, screen-shared, or PDF-exported**. "Readable on my laptop" is the wrong target — the right target is **readable from the back of a 30-foot room**. Two rules follow.

### Minimum font sizes

| Role                | Minimum class | Notes                                                              |
| ------------------- | ------------- | ------------------------------------------------------------------ |
| Slide title         | `text-4xl`    | 32pt. `text-5xl` (40pt) or `text-6xl` (48pt) is better for covers. |
| Headline / hero     | `text-5xl`+   | Where the slide has one big idea.                                  |
| Body copy           | `text-xl`     | 16pt. `text-2xl` (20pt) is safer.                                  |
| Metric "big number" | `text-4xl`+   | The number IS the slide's content; size it accordingly.            |
| Metric label        | `text-base`+  | 12pt absolute floor. Smaller is unreadable when projected.         |
| Eyebrow / kicker    | `text-sm`     | 10pt; use sparingly and only in ALL CAPS for emphasis.             |

**Never use `text-xs` (8pt) for content the user needs to read.** It exists in the allowlist for fine-print footnotes and slot tags, not for body copy.

### Contrast

Light-gray-on-white is a web-UI pattern — it implies hierarchy by _de-emphasis_. On a projector it implies _invisibility_. Pick colors with high contrast against the surface they sit on.

**Read `slides_list({ detail: "detailed" })` to see the brand's actual color-token names.** They vary across templates — one brand may ship `fg-base`, `fg-muted`, `bg-surface`, `accent`; another may ship `ink`, `paper`, `subtle`, `brand`. The PATTERN is the same; the names are not. Always discover before composing.

#### The surface = the nearest ancestor `<Box>` with a `bg-<token>` — NOT the slide

This is the single most common contrast bug. Always:

- **Never** use the template's dark text token (e.g. `text-fg-base`) inside a Box with a dark `bg-<token>`. Dark-on-dark renders invisible.
- **Never** use a light text token (e.g. `text-bg-surface`) on a Box without a dark background. Light-on-light renders invisible.
- **Always** decide text colors per Box, based on the nearest ancestor `bg-<token>`, not based on the slide.
- **Always** ask: "what color is the surface I'm sitting on?" before picking a `text-<token>`.

A dark metric card nested on a light slide:

```tsx
// Light slide (no bg) holding a dark card. Text inside the card MUST use
// the light text token, not the slide-level default.
<Slide className="flex flex-col p-12">
  <Box className="flex flex-row gap-6 flex-1">
    <Box className="flex-1 bg-surface-elevated p-6">
      <Box className="text-display text-4xl text-bg-surface">$5M</Box>
      <Box className="text-body text-2xl text-bg-surface">ARR</Box>
    </Box>
  </Box>
</Slide>
```

When you write `bg-<X>` on a Box, immediately pick the text color that contrasts with it for every text descendant. Don't rely on slide-level defaults.

#### Per-surface guidance

- **Light surface** (default slide background, or a `bg-<token>` that resolves to a light hex): primary text uses the template's darkest neutral (e.g. `text-fg-base` / `text-ink`). Body secondary uses a clearly-darker-than-mid-gray (e.g. `text-fg-muted`) — never a soft web-UI gray.
- **Dark surface** (`bg-fg-base`, `bg-surface-elevated`, anything that resolves to dark): primary text uses the template's lightest neutral (e.g. `text-bg-surface` / `text-paper`). Light grays unreadable on white become readable here.
- **Emphasis**: use the brand's accent token (whatever it's named), never a hex literal.
- **When in doubt**: pick the primary text token. Slightly less hierarchy beats invisible text.

## Layout patterns that work well

- **Title-then-body.** `<Slide className="flex flex-col gap-8 p-12">` with two children: the title Box and the body Box.
- **Grid of cards.** Outer column → inner `flex-row` with `flex-1` children. Each card is itself a column with `flex-col gap-2 p-6 bg-<token>`.
- **Two-column comparison.** `<Slide className="flex flex-row p-12 gap-12">` with two `flex-1` children.
- **Hero + caption.** Column with one large `flex-1` Box for the headline and a small `flex-none` Box for the caption underneath.

## Escape hatches

When the Tailwind dialect can't express what you need:

- **`rect={{ x, y, w, h }}` on `<Box>`** — absolute coordinates in points. Skips flex entirely. Useful for one-off pinned overlays.
- **`style={{ flexDirection: 'row', gap: 32 }}` on `<Box>` or `<Slide>`** — raw Yoga-shaped layout style. Same pipeline as className, lower-level. Inline `style` wins over `className` on collision.
- **`textStyle={{ fontFamily: 'display', fontSize: 48 }}` on `<Text>` or `<Box>`** — the original explicit-style API. Wins over className on per-field collision.

Reach for these sparingly. The whole point of the className surface is that the agent doesn't drift on fonts / colors / sizes — escape hatches let you bypass that lock.

## Response shape from `slides_create`

```json
{ "filePath": "/Users/you/Desktop/Q4-Review.pptx", "slideCount": 6 }
```

On error, the server returns a structured error with one of these codes:

| Code                                             | Meaning                                                                       | Recovery                                                                                                                                 |
| ------------------------------------------------ | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `unknown_component`                              | You used a `component` name that isn't in the active template.                | Re-read `slides_list`. Pick a real one, or `slides_add_component` to write a new one.                                                    |
| `validation_error`                               | Zod rejected the props on a slide. Includes `issues[]` with per-field `path`. | Fix only the failing fields and resend `slides_create`. Don't re-emit slides that weren't flagged.                                       |
| `reconciler_error` / `runtime_error`             | Something went wrong below the schema layer.                                  | Read the message — most commonly a className that's not on the allowlist. Fix the offending class via `slides_edit_component`.           |
| `add_component_failed` / `edit_component_failed` | Could not write the component (bad name, duplicate, disallowed import, etc.). | Read the message — most cases are PascalCase violations, duplicates, or disallowed imports. Fix and retry.                               |
| `build_failed`                                   | `tsc` rejected the deck.                                                      | Read the `summary` (capped at 20 diagnostics). Call `slides_edit_component` with a fix. Call `slides_build` to re-check without writing. |

## Worked example (mixed tiers)

User: _"Make a Q4 review with a revenue bar chart, two metric grids, a quote from the CEO, and a thank-you."_

1. `slides_list` — template ships `Cover`, `TitleAndGrid`, `Quote`, `Closing` but no chart slide.
2. `slides_list({ detail: "detailed" })` — grab JSON Schemas + brand tokens (colors and spacing).
3. `slides_create_deck({ dir: "~/slides/q4-review" })` — the deck inherits the four brand slide types.
4. `slides_add_component({ deckPath, name: "RevenueChart", source })` — a flex-layout chart (column outer, row of card columns inner) using brand tokens.
5. On typecheck failure, `slides_edit_component` with a fix. Repeat until clean.
6. `slides_list` confirms `RevenueChart` is now in the active template.
7. One `slides_create` call: `[Cover, RevenueChart, TitleAndGrid × 2, Quote, Closing]` with the user's content as props.
8. Surface the `.pptx` path **and** the deck project path verbatim to the user.

## Before declaring done

Assume there are problems. Your job is to find them before the user does. A `.pptx` file existing on disk isn't "done" — a `.pptx` file with readable, on-brand content is.

Run this checklist before reporting back:

1. **One file, not many.** `producedPptx.length === 1`. If there are multiple, you accidentally called `slides_create` more than once. Tell the user which path is the real one.
2. **The path is absolute and surfaced verbatim.** Don't paraphrase, don't shorten, don't say "saved to your downloads folder" — give them the full path string.
3. **Brand lock held.** No `'#'`-prefixed hex strings in any component source you wrote. If you see one, replace it with the matching brand token via `slides_edit_component`.
4. **Contrast checked per surface.** For every `<Box className="… bg-<X>">` you wrote, the text inside uses a color that contrasts with `<X>`. Dark surface → light text; light surface → dark text. Re-read the [Contrast](#contrast) section if unsure.
5. **Body text size is presentation-grade.** Nothing important uses `text-xs` or `text-sm`. Titles ≥ `text-4xl`. Body ≥ `text-xl`. Metric big-numbers ≥ `text-4xl`.
6. **Slide count matches the brief.** If the user asked for five slides, `slides_create` was called with `slides.length === 5`.
7. **Custom components are reusable.** If you wrote `Problem`, `Solution`, `Traction`, `Ask` for one deck, the next deck about a different startup could call them with different props. Hard-coded copy belongs in the `slides_create` props, not in the component source.

## AI tells to avoid

These patterns scream "a model wrote this deck". Even when they technically work, they erode trust. Steer away:

- **"PROBLEM" / "SOLUTION" / "TRACTION" eyebrows on every slide.** A real deck author varies the framing — "Where we are", "What's changing", "The next $10M", a question, a single word. Generic section labels are a hallmark of LLM authorship.
- **Repeating the same component for every slide.** If the deck is five slides and you wrote five components named `SlideOne`, `SlideTwo`, etc., consolidate into 2–3 reusable types.
- **Mid-slide hex literals like `'#FF5500'` or `'#0b0b0b'`.** A human author working in a brand-locked template would never have a reason to drop a hex into source — they'd reach for the token.
- **`font-bold` everywhere.** Bold on every heading reads as panic about emphasis. Reserve weight for cases where size + color aren't carrying enough hierarchy.
- **Solid color cards stacked without breathing room.** Decks need whitespace. If every Box is `flex-1` with no `p-` padding, the slide feels claustrophobic.
- **Padding via empty Boxes.** Use `justify-center`, `items-center`, `p-<N>` on the parent. Never pad by inserting empty spacer Boxes.
