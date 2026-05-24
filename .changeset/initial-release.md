---
'@sanity-labs/slides': minor
---

Initial public release of `@sanity-labs/slides`.

A brand-locked PowerPoint generator for LLMs. You author your slide template in React; Claude (or any MCP client) writes the deck through the bundled MCP server without drifting on fonts, colors, or layout.

**What ships**

- Root export — the React renderer + PPTX runtime + `Template` type + primitives. What template authors `import` to write components.
- `/mcp` — `createSlideServer`, `renderSlides` for programmatic use.
- `/dev` — browser dev viewer.
- `/sanity` — the Sanity reference template.
- `/scaffold` — programmatic scaffolder.
- `slidesctl` bin — `serve | generate | list | scaffold | skill`.
- `slides-dev` bin — Vite-backed dev viewer for templates.
- Bundled `SKILL.md` — teaches Claude the conventions; print with `npx @sanity-labs/slides skill`.

End users wire Claude with a single `npx -y @sanity-labs/slides serve --template <path>` line in their MCP config. No global install required.
