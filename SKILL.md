---
name: sanity-labs-slides
description: How to drive a `@sanity-labs/slides` template MCP server. Use this skill whenever the user asks for a slide deck or `.pptx` file and an MCP server exposing `slides_list`, `slides_validate`, `slides_create`, `slides_create_deck`, `slides_add_component`, `slides_edit_component`, and `slides_build` is available. The skill teaches the two-tier workflow (fill JSON props for prebuilt slide types, OR write React components for custom slides), the validation contract, and the recovery patterns.
license: MIT
metadata:
  author: sanity-labs
  version: '2.1.0'
---

# @sanity-labs/slides MCP

`@sanity-labs/slides` exposes a brand's slide vocabulary as MCP tools. Templates are read-only — the agent never edits them — and there are two ways to drive the server:

1. **JSON props (the quick path).** Pick from the slide types the template already ships, fill props, render. This is the right move when the user's request maps cleanly to the template's existing types.
2. **Code-gen (the power path).** Scaffold an agent-writable **deck project** and add custom React components. Use this when the user asks for something the template author didn't anticipate (a custom chart, a non-standard layout, a slide that needs computation over props).

Most decks mix the two: a few prebuilt slide types for the parts that fit, custom components for the parts that don't.

## When to apply

Use this skill when the user asks for a slide deck and any of the following are true:

- The conversation context contains an MCP server with tool names beginning with `slides_`.
- The user references "the template", "our brand template", or a specific template name they've installed.
- The user asks for a `.pptx` / PowerPoint file.

Do **not** invent slide content with `Box`/`Text` primitives directly in arbitrary JSON. Either pick a prebuilt slide type (tier 1) or write a real React component (tier 2). Primitives are not a runtime-callable surface — they're a library you build with.

## Tool surface (7 tools total)

| Tool                    | Tier   | Use it for                                                                                   |
| ----------------------- | ------ | -------------------------------------------------------------------------------------------- |
| `slides_list`           | both   | Discover what slide types are available. Pass `detail: "detailed"` to also get JSON Schemas. |
| `slides_validate`       | tier 1 | Validate one `{ component, props }` pair against the active schema. Optional but useful.     |
| `slides_create`         | both   | Render an array of `{ component, props }` to `.pptx`. Returns the absolute file path.        |
| `slides_create_deck`    | tier 2 | Scaffold a writable deck project. After this, the server's active template is the deck.      |
| `slides_add_component`  | tier 2 | Write a new TSX slide into the deck. Imports allowlist enforced; typechecked.                |
| `slides_edit_component` | tier 2 | Overwrite an existing component (e.g. after a typecheck error).                              |
| `slides_build`          | tier 2 | Re-run tsc without writing files.                                                            |

## Tier 1 — JSON props

1. **Discover.** Call `slides_list` (concise). Read every `description`.
2. **Get schemas before composing.** Call `slides_list({ detail: "detailed" })` once before writing slide props. This returns `inputJsonSchema` per slide type — your source of truth for what each slide accepts. Saves you guessing fields and round-tripping through `slides_validate`.
3. **Plan.** Map the user's request to a sequence of slide types. Common shape: `Cover` → 1–3 body slides → `Closing`.
4. **(Optional) Validate.** For complex slides (grids, lists, charts), call `slides_validate({ component, props })` to catch schema errors with field-level paths before paying the cost of a full `slides_create`. Skip if you've already cross-checked against the JSON Schema yourself.
5. **Create.** Call `slides_create({ title, slides: [...] })`. Surface the returned `filePath` verbatim.

## Tier 2 — code-gen

Use this when no prebuilt slide type fits, or when the user explicitly wants something the template doesn't cover.

1. **Scaffold.** `slides_create_deck({ dir: "<path>" })`. The directory must be empty or non-existent. The returned `deckPath` is what every other code-gen tool takes. After this call the active template is the (initially empty) deck — `slides_list` reflects that.
2. **Discover what's there.** `slides_list` again. The deck starts empty until you add components.
3. **Write a component.** `slides_add_component({ deckPath, name, source })`. `name` is PascalCase (`RevenueChart`, `TeamGrid`). `source` is full TSX. Canonical shape:

   ```tsx
   import type { ReactElement } from 'react';
   import { Slide, Box, Text } from '@sanity-labs/slides';
   import { z } from 'zod';

   export const RevenueChartSchema = z
     .object({
       title: z.string().min(1),
       quarters: z.array(z.object({ label: z.string(), revenue: z.number() })).min(1),
     })
     .strict();

   export const RevenueChart = ({
     title,
     quarters,
   }: z.infer<typeof RevenueChartSchema>): ReactElement => {
     const max = Math.max(...quarters.map((q) => q.revenue));
     return (
       <Slide>
         <Box rect={{ x: 0, y: 0, w: 960, h: 540 }} fill={{ kind: 'solid', color: '#0b0b0b' }} />
         <Box rect={{ x: 40, y: 40, w: 880, h: 60 }}>
           <Text textStyle={{ fontFamily: 'display', fontSize: 44, foregroundColor: '#ffffff' }}>
             {title}
           </Text>
         </Box>
         {quarters.map((q, i) => {
           const barW = 800 / quarters.length - 16;
           const barH = (q.revenue / max) * 300;
           return (
             <Box
               key={i}
               rect={{ x: 80 + i * (barW + 16), y: 480 - barH, w: barW, h: barH }}
               fill={{ kind: 'solid', color: '#ff5500' }}
             />
           );
         })}
       </Slide>
     );
   };
   ```

   **Hard rules for component sources:**
   - Export both `<Name>` (the React component) and `<Name>Schema` (the Zod schema). The anchor splicer expects exactly these names.
   - **Imports are restricted to `@sanity-labs/slides`, `react`, and `zod`.** This is enforced server-side — any other import (including Node built-ins like `fs`, external libraries like `lodash`, or relative paths to other files) causes the call to fail before any file is written. Compute everything else inline.
   - The component must return a `<Slide>` element. The canvas is 960pt × 540pt.

4. **Handle typecheck errors.** `slides_add_component` always ends with a typecheck. If it fails, the response carries a `summary` with up to 20 file/line/code errors (cascades are truncated with a hint to fix the listed ones first). Read it, call `slides_edit_component({ deckPath, name, source })` with the corrected source, repeat. If the same error survives a couple of fixes, surface it to the user rather than spinning.

5. **Render.** Once `slides_list` shows the components you need, call `slides_create({ title, slides: [...] })`. Mix prebuilt types and your custom ones freely.

The deck project at `deckPath` persists. The user owns it. They can inspect the React code you wrote, edit it, and rerun `slidesctl generate` themselves to regenerate the `.pptx`. Tell them where it lives.

## Response shape from `slides_create`

```json
{ "filePath": "/Users/you/Desktop/Q4-Review.pptx", "slideCount": 6 }
```

On error, the server returns a structured error with one of these codes:

| Code                                             | Meaning                                                                       | Recovery                                                                                                                                 |
| ------------------------------------------------ | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `unknown_component`                              | You used a `component` name that isn't in the active template.                | Re-read `slides_list`. Pick a real one, or `slides_add_component` to write a new one.                                                    |
| `validation_error`                               | Zod rejected the props on a slide. Includes `issues[]` with per-field `path`. | Fix only the failing fields and resend `slides_create`. Don't re-emit slides that weren't flagged.                                       |
| `reconciler_error` / `runtime_error`             | Something went wrong below the schema layer.                                  | Report verbatim to the user. Suggest they file an issue against the template; this is rarely an LLM-side problem.                        |
| `add_component_failed` / `edit_component_failed` | Could not write the component (bad name, duplicate, disallowed import, etc.). | Read the message — most cases are PascalCase violations, duplicates, or disallowed imports. Fix and retry.                               |
| `build_failed`                                   | `tsc` rejected the deck.                                                      | Read the `summary` (capped at 20 diagnostics). Call `slides_edit_component` with a fix. Call `slides_build` to re-check without writing. |

## Conventions

- **Prefer tier 1 when the template fits.** Writing a custom component is a real artifact — the user inherits the code. Don't reach for code-gen when the template already has what you need.
- **Use `slides_list({ detail: "detailed" })` instead of guessing schemas.** This is the equivalent of "read the docs once" — one call gets you every JSON Schema, no per-slide round-trip needed.
- **Prefer one `slides_create` call, not many.** The tool atomically writes one file from the full slide list. Calling it per slide produces N files, not one deck.
- **Don't ask the user for fonts, colors, or sizes.** They're inexpressible through the tool surface for a reason. The template owns them.
- **Read schema descriptions before guessing.** Every Zod field carries a `.describe(...)` that tells you what content goes there.
- **PascalCase component names.** `RevenueChart`, `TeamGrid`. Not `revenueChart`, not `revenue-chart`.
- **Surface the file path.** After `slides_create` succeeds, tell the user the path verbatim — don't paraphrase or shorten. After `slides_create_deck`, also tell them where the deck project lives.

## Worked example (mixed tiers)

User: _"Make a Q4 review with a revenue bar chart, two metric grids, a quote from the CEO, and a thank-you."_

1. `slides_list` — template has `Cover`, `TitleAndGrid`, `Quote`, `Closing` — but no chart slide.
2. `slides_list({ detail: "detailed" })` — get JSON Schemas for `Cover`, `TitleAndGrid`, `Quote`, `Closing`.
3. `slides_create_deck({ dir: "~/slides/q4-review" })`. The active template swaps to the (initially empty) deck.
4. `slides_add_component({ deckPath, name: "RevenueChart", source: ... })` with the canonical chart shape above.
5. If typecheck fails, `slides_edit_component` with a fix. Repeat until ok.
6. `slides_list` confirms `RevenueChart` is in the active template.
7. `slides_create` with the full sequence:

   ```json
   {
     "title": "Q4 Review",
     "slides": [
       { "component": "Cover", "props": { "title": "Q4 Review" } },
       {
         "component": "RevenueChart",
         "props": { "title": "Revenue by quarter", "quarters": [...] }
       },
       {
         "component": "TitleAndGrid",
         "props": { "title": "Logos", "cols": 3, "rows": 1, "cells": [...] }
       },
       {
         "component": "TitleAndGrid",
         "props": { "title": "Org", "cols": 2, "rows": 1, "cells": [...] }
       },
       {
         "component": "Quote",
         "props": {
           "quote": "Structure powers intelligence.",
           "attribution": "Lars Bakker, CEO"
         }
       },
       { "component": "Closing", "props": {} }
     ]
   }
   ```

8. Report both the `.pptx` path and the deck project path to the user.

## Anti-patterns

- ❌ Asking the user "what color should the title be?" — the template decides.
- ❌ Calling `slides_create` multiple times to "build the deck up" — it isn't incremental, one call writes the final file.
- ❌ Inventing component names that don't exist — only what `slides_list` returned will be accepted. To add one, use `slides_add_component`.
- ❌ Reaching for `slides_add_component` before checking what the template ships. Tier 1 first.
- ❌ Calling `slides_validate` for every prebuilt slide. If you've read the JSON Schema from `slides_list({ detail: "detailed" })`, you've already done the work.
- ❌ Importing anything in a custom component besides `@sanity-labs/slides`, `react`, and `zod`. The server rejects this before any file is written.
- ❌ Hand-editing the deck's `src/index.ts` between the `<generated-imports>` / `<generated-components>` anchors — the code-gen tools own those sections.
- ❌ Hiding the file path from the user once you have it. Always print the absolute path verbatim.
