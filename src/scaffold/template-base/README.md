# **NAME**

A `@sanity-labs/slides` template. The brand lives in JSX; an LLM (Claude,
anything that speaks MCP) drives it through the generic `slidesctl` MCP
server without ever touching fonts, colors, or layout.

## Develop

```bash
pnpm install
pnpm dev
```

Opens the hot-reloading viewer at <http://localhost:5173>. Edit anything
under `src/` and the page updates.

## Anatomy

```
src/
├── index.ts             # Template value — tokens, fonts, components map
├── preview.tsx          # Canonical slide order shown in the viewer
└── components/          # Slide components, each one a Zod schema + JSX
```

The Zod schema on every component is what Claude sees as the tool input
schema. Field descriptions become the LLM-facing documentation. Drop a
new component into `src/components/` and `defineTemplateComponent({...})`
in `src/index.ts` — that's the entire authoring loop.

## Generate a deck from the CLI

After editing, build once and then invoke the generic CLI against your
template:

```bash
pnpm build
echo '{
  "title": "Q2 Review",
  "slides": [{ "component": "Cover", "props": { "title": "Q2 Review" } }]
}' | pnpm generate --output ~/Desktop
# /Users/you/Desktop/Q2-Review.pptx
```

`pnpm generate` is a thin wrapper around
`slidesctl generate --template ./dist/index.js`.

## Plug this template into Claude Desktop

No global install. No per-template binary. Use `npx` so Claude pulls the
generic MCP server straight from npm.

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`
(or the equivalent on your OS):

```json
{
  "mcpServers": {
    "__NAME__-slides": {
      "command": "npx",
      "args": [
        "-y",
        "@sanity-labs/slides",
        "serve",
        "--template",
        "/absolute/path/to/__NAME__/dist/index.js",
        "--output",
        "/Users/you/Desktop"
      ]
    }
  }
}
```

Restart Claude. Three tools appear, auto-derived from this template:

| Tool                | Purpose                                                          |
| ------------------- | ---------------------------------------------------------------- |
| `slides_list`       | Lists every slide type, with descriptions.                       |
| `slides_add_<type>` | Validates a single slide's props against the Zod schema.         |
| `slides_create`     | Takes `{ title, slides }`, writes the `.pptx`, returns the path. |

Ask Claude:

> "Make me a 5-slide Q2 review deck with this template."

Whenever you edit the template, run `pnpm build` and Claude will pick up
the changes on its next request.

### Want Claude to know the conventions up front?

Drop the bundled skill into your Claude project. Print it with:

```bash
npx @sanity-labs/slides skill
```

…and paste into your Claude project's knowledge sources.

## API in 30 seconds

```ts
import { defineTemplate, defineTemplateComponent, CANVAS_16_9 } from '@sanity-labs/slides';
import { Cover, CoverSchema } from './components/Cover.js';
import { preview } from './preview.js';

export const __IDENT__ = defineTemplate({
  name: '__NAME__',
  canvas: CANVAS_16_9,
  fonts: { display: ['Inter'], body: ['Inter'], mono: ['IBM Plex Mono'] },
  colors: {},
  typography: {},
  spacing: {},
  components: {
    Cover: defineTemplateComponent({
      component: Cover,
      schema: CoverSchema,
      description: 'Use as the first slide of a deck.',
    }),
  },
  preview,
});
```

Add a new component:

1. Create `src/components/MySlide.tsx` exporting a Zod schema and a React
   component. Keep all styling token-locked through your tokens map.
2. Register it in `src/index.ts` under `components` with a clear
   description (LLMs read it).
3. Add a sample call in `src/preview.tsx` so the viewer shows it.

Run `pnpm build` and the new component appears as `slides_add_my_slide`
the next time Claude talks to your MCP server.
