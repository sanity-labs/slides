# Architecture

> Canonical reference for the react-pptx architecture. If something here
> contradicts a sketch elsewhere, this document is correct — file an issue.

## Goals

1. **Template-locked AI presentation generation** — an LLM cannot produce
   off-brand output because the surface area for off-brand decisions is not
   exposed.
2. **Single source of truth for the template vocabulary** — the same React
   component library is consumed by humans, the LLM, and design tooling.
3. **Forward-only generation** — code → deck artifact; never the reverse.

## The pyramid

```
                    ╔════════════════════════════╗
                    ║   MCP tool surface         ║   ← LLM
                    ║   slides_list              ║
                    ║   slides_add_<type>        ║   one tool per
                    ║   slides_create            ║   slide type
                    ╚════════════════════════════╝
                                │
                                ▼
       ┌─────────────────────────────────────────────┐
       │   Template components (React)               │
       │   <Cover/>  <SectionDivider/>               │   the template's
       │   <OneColumn/>  <TitleAndBody/>             │   slide vocabulary
       │   <TitleAndGrid/>  <Closing/>               │
       └────────────────────┬────────────────────────┘
                            │  composed from
                            ▼
       ┌─────────────────────────────────────────────┐
       │   Template primitives (React)               │
       │   <Title/>  <Eyebrow/>  <Footer/>           │   token-typed
       │   <TokenBox/>  <TokenText/>  <TokenImage/>  │   surface, template-
       │   <Grid/>  <Stack/>  <Field/>               │   defined tokens
       └────────────────────┬────────────────────────┘
                            │  composed from
                            ▼
       ┌─────────────────────────────────────────────┐
       │   Substrate primitives (React)              │
       │   <Slide/>  <Box/>  <BrandText/>            │   what the
       │   <BrandColor/>  <Image/>                   │   reconciler walks
       └────────────────────┬────────────────────────┘
                            │  rendered by
                            ▼
       ┌─────────────────────────────────────────────┐
       │   react-pptx reconciler                     │
       │   (custom React walker, similar in spirit   │
       │    to react-three-fiber / react-pdf)        │
       └────────────────────┬────────────────────────┘
                            │  emits
                            ▼
                  SlideOp[] + GenerationManifest
                            │
                            ▼
       ┌─────────────────────────────────────────────┐
       │   SlidesRuntime backend                     │
       │   PptxSlidesRuntime (default)               │
       │   FakeSlidesRuntime (tests)                 │
       │   (future: Google Slides, Keynote, PDF…)    │
       └─────────────────────────────────────────────┘
```

## Three layers, three audiences

| Layer            | Audience                           | Surface        |
| ---------------- | ---------------------------------- | -------------- |
| Token primitives | Template authors + library authors | The rules      |
| Slide components | Engineers authoring decks          | The vocabulary |
| MCP tools        | LLMs (and via them, end users)     | The verbs      |

Off-brand styling is **not a runtime check**; it is **inexpressible at the type level**.

## Why this is correct

- **The LLM gets a tiny surface (verbs).** It cannot drift on fonts because
  there is no tool input that takes a font as a parameter.
- **Engineers get a medium surface (vocabulary).** They author with React JSX
  using high-level components, which compose template primitives. They cannot
  drift because primitives don't expose color/font as free strings, only
  token enums.
- **Template authors get the full surface (rules).** They define the
  primitives and the token catalog. The template is theirs.

## Render path

```
LLM call          MCP server                    SlidesRuntime backend
───────           ──────────                    ─────────────────────
slides_create("Q2",
  [{ component: "Cover",
     props: { title: "…" } },
   …])
                    │
                    ▼
          Zod validation
          (rejects invalid input;
           re-prompts LLM via tool error)
                    │
                    ▼
          renderToOps(tree, template)
          (custom React walker
           emits SlideOp[] + manifest)
                    │
                    ▼
          [SlideOp[]]
                    │
                    ▼                                   ▼
                                          translateOpsToPptx + pptxgenjs
                                                       │
                                                       ▼
                                                  .pptx file on disk
```

For backends other than PPTX, the only change is the runtime that consumes
`SlideOp[]`. The reconciler stays template-agnostic and backend-agnostic.

## What lives where

| Concern                                  | Location                                                |
| ---------------------------------------- | ------------------------------------------------------- |
| Brand color hex values                   | Template package (e.g. `templates/sanity/src/tokens/`)  |
| Brand fonts                              | Template package's `Template.fonts` font stack          |
| PPTX font substitution per template      | Template package (e.g. `SANITY_PPTX_FONT_SUBSTITUTION`) |
| Slide canvas geometry                    | `react-pptx` (`geometry.ts`)                            |
| Reconciler                               | `react-pptx` (`reconciler.ts`)                          |
| Substrate primitives                     | `react-pptx` (`components.ts`)                          |
| Template token-typed primitives          | Template package (`templates/sanity/src/primitives/`)   |
| Slide components                         | Template package (`templates/sanity/src/components/`)   |
| MCP server framework                     | `react-pptx-mcp`                                        |
| PPTX runtime backend                     | `react-pptx` (`pptx-runtime.ts`)                        |
| Template vocabulary (which slides exist) | Template package's `Template.components` map            |

## Out of scope today

- Bidirectional sync (slide editor → React). Intentional non-goal.
- Manifest persistence into the `.pptx` file itself (in-memory only today).
- Backends other than PPTX and the test fake (substrate supports them, no
  implementation shipped).
- Animations, transitions, video.
- Charts (would require backend-specific data round-trips).
