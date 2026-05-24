# @sanity-labs/slides

**Brand-locked PowerPoint generation for LLMs. Write your slide template in React; Claude writes the deck.**

[![ci](https://github.com/sanity-labs/slides/actions/workflows/ci.yml/badge.svg)](https://github.com/sanity-labs/slides/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@sanity-labs/slides)](https://www.npmjs.com/package/@sanity-labs/slides)

A template is a React project. Each slide type is a component + a Zod schema. The bundled MCP server reads your template and exposes it to Claude (or any MCP client) as auto-derived tools. The LLM can pick slide types and fill props, but it cannot pick fonts, colors, or layout — those are locked in the template.

One package on npm. Four subpath exports. One CLI bin.

---

## Quickstart

### 1. Scaffold a template

```bash
npx @sanity-labs/slides scaffold my-template
cd my-template
pnpm install
pnpm dev    # opens the hot-reloading viewer at http://localhost:5173
```

You get a working template with one starter slide (`Cover`) and a Vite-backed dev viewer. Edit anything under `src/` and the page updates.

### 2. Build it

```bash
pnpm build
```

That emits `dist/index.js` — the file the MCP server will import.

### 3. Wire it into Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (or the equivalent on your OS):

```json
{
  "mcpServers": {
    "slides": {
      "command": "npx",
      "args": [
        "-y",
        "@sanity-labs/slides",
        "serve",
        "--template",
        "/absolute/path/to/my-template/dist/index.js",
        "--output",
        "/Users/you/Desktop"
      ]
    }
  }
}
```

Restart Claude.

### 4. Ask

> "Make me a 5-slide Q4 review deck with my template."

Claude calls `slides_list` to learn what slide types exist, fills props from the conversation, calls `slides_create`, and hands you back the absolute path to the `.pptx`.

Total setup time once you have a template: about two minutes.

---

## What you ship when you build a template

```
my-template/
├── package.json
├── src/
│   ├── index.ts          # the Template value — tokens, fonts, components map
│   ├── preview.tsx       # canonical slide order shown in the viewer
│   └── components/
│       └── Cover.tsx     # one component = one slide type = one MCP tool
└── dist/                 # `pnpm build` output — what the MCP server imports
```

A slide type is a React component with a Zod schema next to it:

```tsx
// src/components/Quote.tsx
import { Slide, Box, Text } from '@sanity-labs/slides';
import { z } from 'zod';

export const QuoteSchema = z
  .object({
    quote: z.string().min(1).describe('The pull quote. Plain text.'),
    attribution: z.string().optional().describe('Optional speaker.'),
  })
  .strict();

export const Quote = ({ quote, attribution }: z.infer<typeof QuoteSchema>) => (
  <Slide>
    <Box rect={{ x: 0, y: 0, w: 960, h: 540 }} fill={{ kind: 'solid', color: '#ff5500' }} />
    <Box rect={{ x: 60, y: 200, w: 840, h: 160 }}>
      <Text textStyle={{ fontFamily: 'display', fontSize: 48, foregroundColor: '#0b0b0b' }}>
        “{quote}”
      </Text>
    </Box>
    {attribution ? (
      <Box rect={{ x: 60, y: 380, w: 840, h: 32 }}>
        <Text textStyle={{ fontFamily: 'mono', fontSize: 14, foregroundColor: '#0b0b0b' }}>
          — {attribution}
        </Text>
      </Box>
    ) : null}
  </Slide>
);
```

Register it in `src/index.ts`:

```ts
components: {
  Quote: defineTemplateComponent({
    component: Quote,
    schema: QuoteSchema,
    description: 'Pull-quote slide. Use sparingly between sections.',
  }),
}
```

`pnpm build` and Claude will see a new `slides_add_quote` tool on its next request.

The Zod schema field `.describe(...)` text becomes the LLM-facing documentation. The `description` on the template entry tells Claude when to pick the type.

---

## What Claude sees

After you wire the MCP server in, Claude has three tools, auto-derived from your template:

| Tool                | Purpose                                                                   |
| ------------------- | ------------------------------------------------------------------------- |
| `slides_list`       | Lists every slide type with its description.                              |
| `slides_add_<type>` | Validates a single slide's props against the Zod schema.                  |
| `slides_create`     | Takes `{ title, slides }`, writes the `.pptx`, returns the absolute path. |

The package also ships an LLM skill describing the calling convention. Print it with:

```bash
npx @sanity-labs/slides skill
```

Paste it into a Claude project's knowledge sources to teach the model the workflow up front.

---

## Subpath layout

One npm package, four import surfaces:

| Subpath                        | Contents                                                                |
| ------------------------------ | ----------------------------------------------------------------------- |
| `@sanity-labs/slides`          | Renderer + `Template` type + `Slide`/`Box`/`Text` primitives + runtime. |
| `@sanity-labs/slides/mcp`      | `createSlideServer`, `renderSlides` — programmatic MCP API.             |
| `@sanity-labs/slides/dev`      | Dev-viewer building blocks (`composeDeck`, `DeckViewer`).               |
| `@sanity-labs/slides/scaffold` | `scaffoldTemplate({ target, name })` — programmatic scaffold API.       |
| `@sanity-labs/slides/skill`    | The bundled `SKILL.md` Markdown file.                                   |

Vite, tailwind, react-dom, lucide-react and friends are listed as **optional peer dependencies**, only required when you import `/dev`. Users wiring the MCP into Claude pay for none of that install weight.

### Bins

| Bin          | Purpose                                                                                        |
| ------------ | ---------------------------------------------------------------------------------------------- |
| `slidesctl`  | The CLI the MCP server runs on. Subcommands: `serve`, `generate`, `list`, `scaffold`, `skill`. |
| `slides-dev` | The Vite-backed dev viewer used by template authors' `pnpm dev`.                               |

`npx @sanity-labs/slides …` resolves to the `slidesctl` bin (matches the package's short name).

---

## Reference template

The Sanity-branded reference template lives in its own repo at [`sanity-labs/slides-template`](https://github.com/sanity-labs/slides-template). It's the most thorough authoring example — eight slide types, brand chrome helpers, embedded raster assets, and SVG textures — and it dogfoods this package by consuming `@sanity-labs/slides` exactly the way an external user would.

To use it:

```bash
git clone git@github.com:sanity-labs/slides-template.git
cd slides-template
pnpm install
pnpm build
```

Then point Claude at it the same way as any other template:

```json
"args": ["-y", "@sanity-labs/slides", "serve", "--template", "/abs/path/to/slides-template/dist/index.js"]
```

---

## Repo layout

```text
packages/
└── slides/                       # the single published package
    ├── package.json              # single source of truth (exports, bin, deps)
    ├── README.md
    ├── SKILL.md                  # shipped — served by `slidesctl skill`
    ├── src/
    │   ├── index.ts              # root: renderer + Template + primitives
    │   ├── cli.ts                # `slidesctl` bin
    │   ├── core/                 # renderer + PPTX runtime
    │   ├── mcp/                  # MCP server framework
    │   ├── dev/                  # browser dev viewer (incl. slides-dev bin)
    │   ├── scaffold/             # scaffold logic + template-base/
    │   └── __tests__/            # framework smoke tests + synthetic fixture template
    └── scripts/
        └── copy-static-assets.mjs

docs/                             architecture, testing strategy
.changeset/                       changesets config + queued release notes
.github/workflows/                CI + release pipeline
```

---

## Contributing

See [`docs/architecture.md`](./docs/architecture.md) for the layer pyramid.

```bash
pnpm install
pnpm verify    # typecheck + lint + format + build + test + knip + verify-bins
```

Releases use [Changesets](https://github.com/changesets/changesets):

```bash
pnpm changeset    # describe what changed (single package — just pick patch/minor/major)
git commit -am "feat: …"
# A "Version Packages" PR opens automatically on push to main.
# Merge that PR and the release workflow publishes @sanity-labs/slides to npm.
```

## License

MIT
