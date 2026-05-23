# react-pptx

**Brand-locked PowerPoint files from an LLM. You write the template in React; Claude writes the deck.**

[![ci](https://github.com/sanity-labs/react-pptx/actions/workflows/ci.yml/badge.svg)](https://github.com/sanity-labs/react-pptx/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/react-pptx-mcp?label=react-pptx-mcp)](https://www.npmjs.com/package/react-pptx-mcp)
[![npm](https://img.shields.io/npm/v/react-pptx?label=react-pptx)](https://www.npmjs.com/package/react-pptx)

A template is a React project. Each slide type is a component + a Zod schema. The package `react-pptx-mcp` reads your template and exposes it to Claude (or any MCP client) as auto-derived tools. The LLM can pick slide types and fill props, but it cannot pick fonts, colors, or layout — those are locked in the template.

---

## Quickstart

### 1. Scaffold a template

```bash
npm create react-pptx-template@latest my-template
cd my-template
pnpm install
pnpm dev    # opens the hot-reloading viewer at http://localhost:5173
```

You get a working template with one starter slide (`Cover`) and a viewer. Edit anything under `src/` and the page updates.

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
    "my-template-slides": {
      "command": "npx",
      "args": [
        "-y",
        "react-pptx-mcp",
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

That's it. Total setup: about two minutes once you have a template.

---

## What you're shipping when you build a template

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
import { Slide, Box, Text } from 'react-pptx';
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

After you wire the MCP server in, Claude has three tools:

| Tool                | Purpose                                                                   |
| ------------------- | ------------------------------------------------------------------------- |
| `slides_list`       | Lists every slide type with its description.                              |
| `slides_add_<type>` | Validates a single slide's props against the Zod schema.                  |
| `slides_create`     | Takes `{ title, slides }`, writes the `.pptx`, returns the absolute path. |

The MCP also ships an LLM skill describing the calling convention. Print it with:

```bash
npx react-pptx-mcp skill
```

Paste it into a Claude project's knowledge sources to teach the model the workflow up front.

---

## The packages

| Package                      | What it is                                                            |
| ---------------------------- | --------------------------------------------------------------------- |
| `react-pptx`                 | The React renderer + PPTX runtime + `Template` type.                  |
| `react-pptx-mcp`             | The MCP server + the generic `react-pptx-mcp` CLI + bundled SKILL.md. |
| `create-react-pptx-template` | The scaffold — `npm create react-pptx-template`.                      |
| `react-pptx-dev`             | The browser dev viewer used by `pnpm dev`.                            |

End users install nothing globally. The Claude config uses `npx -y react-pptx-mcp` so the latest published version is fetched on demand.

Templates **live in user repos**. They are normal npm packages (private or public) that the MCP imports at runtime.

---

## Repo layout

```text
packages/
├── core/              react-pptx
├── mcp/               react-pptx-mcp (the product)
├── preview/           react-pptx-dev
└── init-template/     create-react-pptx-template

templates/
└── sanity/            Reference template used for examples + tests (not published).

docs/                  Architecture & testing strategy.
.changeset/            Changesets config + queued release notes.
.github/workflows/     CI + release pipeline.
```

---

## Contributing

See [`docs/architecture.md`](./docs/architecture.md) for the layer pyramid and [`docs/testing-strategy.md`](./docs/testing-strategy.md) for the testing approach.

Workflow:

```bash
pnpm install
pnpm verify    # typecheck + lint + format + build + test + knip + verify-bins
```

Releases are driven by [Changesets](https://github.com/changesets/changesets):

```bash
pnpm changeset    # describe what changed
git commit -am "feat: …"
# A "Version Packages" PR opens automatically on push to main.
# Merge that PR and the release workflow publishes to npm.
```

`react-pptx`, `react-pptx-mcp`, and `react-pptx-dev` are version-locked (`fixed` in `.changeset/config.json`) so users never have to reason about cross-package compatibility.

## License

MIT
