---
name: sanity-labs-slides
description: How to drive a `@sanity-labs/slides` template MCP server. Use this skill whenever the user asks for a slide deck or `.pptx` file and an MCP server exposing `slides_list`, `slides_add_*`, `slides_create`, `slides_create_deck`, `slides_add_component`, `slides_edit_component`, and `slides_build` is available. The skill teaches the two-tier workflow (fill JSON props for prebuilt slide types, OR write React components for custom slides), the validation contract, and the recovery patterns.
license: MIT
metadata:
  author: sanity-labs
  version: '2.0.0'
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

## Tool surface

| Tool                    | Tier   | Use it for                                                                                               |
| ----------------------- | ------ | -------------------------------------------------------------------------------------------------------- |
| `slides_list`           | both   | Learn what slide types are currently available. Reflects the active deck if one is loaded.               |
| `slides_add_<type>`     | tier 1 | Validate a single prebuilt slide's props against its schema. Returns a `SlideSpec`. Optional but useful. |
| `slides_create`         | both   | Take an array of `SlideSpec`s, render the deck, write the `.pptx`, return the absolute path.             |
| `slides_create_deck`    | tier 2 | Scaffold a writable deck project. From this point on, the server's "active template" is the deck.        |
| `slides_add_component`  | tier 2 | Write a new TSX slide into the deck. The server typechecks it and reloads the template.                  |
| `slides_edit_component` | tier 2 | Overwrite an existing component (e.g. after seeing a typecheck error).                                   |
| `slides_build`          | tier 2 | Re-run typecheck without writing files.                                                                  |

## Tier 1 — JSON props

1. **Discover.** Call `slides_list`. Read every `description` and the schemas attached to each per-type `slides_add_<type>` tool.
2. **Plan.** Map the user's request to a sequence of slide types. Common shape: `Cover` → 1–3 body slides → `Closing`.
3. **Validate (optional).** Call `slides_add_<type>` with your props for any complex slide to catch issues before `slides_create`.
4. **Create.** Call `slides_create` with `{ title, slides: [...] }`. Surface the returned `filePath` verbatim.

## Tier 2 — code-gen

Use this when there is no prebuilt slide type that fits, or when the user explicitly wants something the template doesn't cover.

1. **Scaffold.** `slides_create_deck({ dir: "<path>" })`. The directory must be empty or non-existent. The returned `deckPath` is what every other code-gen tool takes. After this call the active template is the (initially empty) deck — `slides_list` reflects that.
2. **Discover what's there.** `slides_list` again. If the server was started with a brand template the deck inherits from, the brand's components are visible here; otherwise the list is empty until you add components.
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

   Hard rules for component sources:
   - Export both `<Name>` (the React component) and `<Name>Schema` (the Zod schema). The server's anchor splicer expects exactly these names.
   - Only import from `@sanity-labs/slides`, `react`, and `zod`. Importing anything else is off-brand and will fail to load.
   - The component must return a `<Slide>` element. The canvas is 960pt × 540pt.

4. **Handle typecheck errors.** `slides_add_component` always ends with a typecheck. If it fails, the response carries a `summary` with file/line/code for every error. Read it, call `slides_edit_component({ deckPath, name, source })` with the corrected source, repeat. There is no retry cap — but if the same error survives a couple of fixes, surface it to the user rather than spinning.

5. **Render.** Once `slides_list` shows the components you need, call `slides_create({ title, slides: [...] })`. Mix prebuilt types and your custom ones freely — `slides_create` accepts any name registered in the active template.

The deck project at `deckPath` persists. The user owns it. They can inspect the React code you wrote, edit it, and rerun `slidesctl generate` themselves to regenerate the `.pptx`. Tell them where it lives.

## Response shape from `slides_create`

```json
{ "filePath": "/Users/you/Desktop/Q4-Review.pptx", "slideCount": 6 }
```

On error, the server returns a structured error with one of these codes:

| Code                                 | Meaning                                                                 | Recovery                                                                                                          |
| ------------------------------------ | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `unknown_component`                  | You used a `component` name that isn't in the active template.          | Re-read `slides_list`. Pick a real one, or `slides_add_component` to write a new one.                             |
| `validation_error`                   | Zod rejected the props on a slide. The error includes `path` per issue. | Fix only the failing fields and resend the full `slides_create` call. Don't re-emit slides that weren't flagged.  |
| `reconciler_error` / `runtime_error` | Something went wrong below the schema layer.                            | Report verbatim to the user. Suggest they file an issue against the template; this is rarely an LLM-side problem. |
| `add_component_failed`               | Could not write the component (bad name, duplicate, etc.).              | Read the message — most cases are PascalCase violations or duplicate names. Fix and retry.                        |
| `build_failed` (typecheck)           | `tsc` rejected the deck.                                                | Read the `summary`. Call `slides_edit_component` with a fix. Call `slides_build` to re-check without writing.     |

## Conventions

- **Prefer tier 1 when the template fits.** Writing a custom component is a real artifact — the user inherits the code. Don't reach for code-gen when the template already has what you need.
- **Prefer one `slides_create` call, not many.** The tool atomically writes one file from the full slide list. Calling it per slide produces N files, not one deck.
- **Don't ask the user for fonts, colors, or sizes.** They're inexpressible through the tool surface for a reason. The template owns them — and even custom components built on `Box`/`Text`/`Slide` only get to spend the template's tokens, not invent new ones.
- **Read schema descriptions before guessing.** Every Zod field carries a `.describe(...)` that tells you what content goes there.
- **PascalCase component names.** `RevenueChart`, `TeamGrid`. Not `revenueChart`, not `revenue-chart`.
- **Surface the file path.** After `slides_create` succeeds, tell the user the path verbatim — don't paraphrase or shorten. After `slides_create_deck`, also tell them where the deck project lives.

## Worked example (mixed tiers)

User: _"Make a Q4 review with a revenue bar chart, two metric grids, a quote from the CEO, and a thank-you."_

1. `slides_list` shows `Cover`, `TitleAndGrid`, `Quote`, `Closing` — but no chart slide.
2. `slides_create_deck({ dir: "~/slides/q4-review" })`. The active template swaps to the (initially empty) deck. If the server was started with the brand template, the deck inherits those components automatically.
3. `slides_add_component({ deckPath, name: "RevenueChart", source: ... })` with the canonical chart shape above.
4. If typecheck fails, `slides_edit_component` with a fix. Repeat until ok.
5. `slides_list` confirms `RevenueChart` is in the active template.
6. `slides_create` with the full sequence:

   ```json
   {
     "title": "Q4 Review",
     "slides": [
       { "component": "Cover", "props": { "title": "Q4 Review" } },
       { "component": "RevenueChart", "props": { "title": "Revenue by quarter", "quarters": [...] } },
       { "component": "TitleAndGrid", "props": { "title": "Logos", "cols": 3, "rows": 1, "cells": [...] } },
       { "component": "TitleAndGrid", "props": { "title": "Org", "cols": 2, "rows": 1, "cells": [...] } },
       { "component": "Quote", "props": { "quote": "Structure powers intelligence.", "attribution": "Lars Bakker, CEO" } },
       { "component": "Closing", "props": {} }
     ]
   }
   ```

7. Report both the `.pptx` path and the deck project path to the user.

## Anti-patterns

- ❌ Asking the user "what color should the title be?" — the template decides.
- ❌ Calling `slides_create` multiple times to "build the deck up" — it isn't incremental, one call writes the final file.
- ❌ Inventing component names that don't exist — only what `slides_list` returned will be accepted. To add one, use `slides_add_component`.
- ❌ Reaching for `slides_add_component` before checking what the template ships. Tier 1 first.
- ❌ Importing anything in a custom component besides `@sanity-labs/slides`, `react`, and `zod`.
- ❌ Hand-editing the deck's `src/index.ts` between the `<generated-imports>` / `<generated-components>` anchors — the code-gen tools own those sections.
- ❌ Hiding the file path from the user once you have it. Always print the absolute path verbatim.
