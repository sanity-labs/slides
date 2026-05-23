---
name: react-pptx-slides
description: How to drive a `react-pptx` template MCP server. Use this skill whenever the user asks for a slide deck or `.pptx` file and an MCP server exposing the `slides_list`, `slides_add_*`, and `slides_create` tools is available. The skill teaches the calling convention, the validation contract, and the recovery patterns for the three error codes the server returns.
license: MIT
metadata:
  author: react-pptx
  version: '1.0.0'
---

# react-pptx slide-deck MCP

`react-pptx` template servers expose a brand's slide vocabulary as MCP tools. Every template has its own server binary (`<template>-slides`) that publishes the same three tools, derived from the template's component schemas at startup.

## When to apply

Use this skill when the user asks for a slide deck and any of the following are true:

- The conversation context contains a `react-pptx`-derived MCP server (tool names beginning with `slides_`).
- The user references "the template", "our brand template", or a specific template name they've installed.
- The user asks for a `.pptx` / PowerPoint file.

Do **not** invent slide content with `Box`/`Text` primitives directly. The template's components are the only legal vocabulary; anything else is off-brand and will be rejected.

## Tool surface

| Tool                | Direction         | Use it for                                                                                      |
| ------------------- | ----------------- | ----------------------------------------------------------------------------------------------- |
| `slides_list`       | discovery         | Learn what slide types this template supports and what each is for.                             |
| `slides_add_<type>` | per-slide preview | Validate a single slide's props against the schema. Returns a `SlideSpec`. Optional but useful. |
| `slides_create`     | final write       | Take an array of `SlideSpec`s, render the deck, write the `.pptx`, return the absolute path.    |

## The standard flow

1. **Discover.** Call `slides_list` once. It returns `{ template, slides: [{ name, toolName, description, inputJsonSchema }] }`. Read every `description` and `inputJsonSchema` so you know which component to pick for each beat in the user's outline.
2. **Plan.** Map the user's request to a sequence of slide types. The first slide is usually the template's `Cover`; the last is usually a closing slide (`Closing`, `ThankYou`, or similar — read the descriptions). In between, choose from the available types based on what the user is communicating.
3. **Validate (optional).** If you're unsure about a slide's props, call `slides_add_<type>` with them. The server returns either a clean `SlideSpec` or a validation error with field-level paths. Use this when you've drafted a complex slide (grids, lists) and want a sanity check before paying the cost of a full render.
4. **Create.** Call `slides_create` with `{ title, slides: [...] }`. On success it returns `{ filePath, slideCount }`. Surface the absolute `filePath` to the user.

## Response shape from `slides_create`

```json
{ "filePath": "/Users/you/Desktop/Q4-Review.pptx", "slideCount": 6 }
```

On error, the server returns a structured error with one of three codes:

| Code                                 | Meaning                                                                 | Recovery                                                                                                                      |
| ------------------------------------ | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `unknown_component`                  | You used a `component` name that isn't in the template.                 | Re-read `slides_list` (the server lists known types in the error message). Pick a real one.                                   |
| `validation_error`                   | Zod rejected the props on a slide. The error includes `path` per issue. | Fix only the failing fields and resend the full `slides_create` call. Don't re-emit slides that weren't flagged.              |
| `reconciler_error` / `runtime_error` | Something went wrong below the schema layer.                            | Report the message to the user verbatim. Suggest they file an issue against the template; this is rarely an LLM-side problem. |

## Conventions

- **Prefer one `slides_create` call, not many.** The tool atomically writes one file from the full slide list. Calling it per slide produces N files, not one deck.
- **Don't ask the user for fonts, colors, or sizes.** They're inexpressible through the tool surface for a reason. The template owns them.
- **Read schema descriptions before guessing.** Every Zod field carries a `.describe(...)` that tells you what content goes there. The default in `inputJsonSchema.properties.<field>.description` is authoritative.
- **Default to the template's `preview` order when unsure of structure.** A common shape is: `Cover` → 1–3 body slides (`OneColumn`, `TitleAndBody`, `TitleAndGrid`) → optional `SectionDivider`s → 1–2 more body slides → `Closing`. Templates that diverge from this carry it in their descriptions.
- **Respect array minimums.** `cells` in a grid, `items` in an agenda, `bullets` in a detail row — the schema specifies the minimum count. Padding is not allowed; pick a different component if the user has fewer items than the schema demands.
- **Surface the file path.** After `slides_create` succeeds, tell the user the path verbatim — don't paraphrase or shorten.

## Worked example

User: _"Make me a five-slide Q4 review. Cover, two metric grids, one quote from the CEO, and a thank-you."_

1. Call `slides_list`. Suppose the template returns `Cover`, `TitleAndGrid`, `Quote`, `Closing`.
2. Compose:

```json
{
  "title": "Q4 Review",
  "slides": [
    { "component": "Cover", "props": { "title": "Q4 Review", "subtitle": "Year in numbers" } },
    {
      "component": "TitleAndGrid",
      "props": {
        "title": "Revenue lines",
        "cols": 3,
        "rows": 1,
        "cells": [
          { "eyebrow": "ARR", "body": "$54M, +18% YoY" },
          { "eyebrow": "NDR", "body": "121%" },
          { "eyebrow": "Logos", "body": "+47 enterprise" }
        ]
      }
    },
    {
      "component": "TitleAndGrid",
      "props": {
        "title": "Org",
        "cols": 2,
        "rows": 1,
        "cells": [
          { "eyebrow": "Headcount", "body": "180" },
          { "eyebrow": "Hiring", "body": "12 open roles" }
        ]
      }
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

3. Call `slides_create` with that payload. Report the returned `filePath` to the user.

## Anti-patterns

- ❌ Asking the user "what color should the title be?" — the template decides.
- ❌ Calling `slides_create` multiple times to "build the deck up" — it isn't incremental, one call writes the final file.
- ❌ Inventing component names — only what `slides_list` returned will be accepted.
- ❌ Stuffing prose into a `Cover.title` — keep titles short, put paragraphs in `OneColumn` or `TitleAndBody`.
- ❌ Hiding the file path from the user once you have it. Always print the absolute path verbatim.
