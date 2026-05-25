# **NAME**

An agent-authored deck project. Custom slide components live under
`src/components/`; the deck-wide `defineTemplate` value is in `src/index.ts`.

The MCP server's code-gen tools (`slides_add_component`,
`slides_edit_component`, `slides_build`) write components into this
directory. Do not hand-edit the lines between the `<generated-imports>` and
`<generated-components>` markers in `src/index.ts` — the tools own those
sections.

## Local dev

```bash
pnpm install
pnpm dev          # opens the hot-reloading viewer at http://localhost:5173
pnpm typecheck    # runs tsc --noEmit -p tsconfig.json
```

## Generate a deck

The MCP server loads `src/index.ts` directly via `tsx` — there is no
build/dist step. To render outside the agent loop:

```bash
echo '{ "title": "Test", "slides": [{ "component": "MySlide", "props": {} }] }' \
  | npx @sanity-labs/slides generate --template ./src/index.ts --output .
```

## Layout

```
src/
├── index.ts             # Template value — fonts, components map, anchors
└── components/          # One file per slide type (added by the agent)
```
