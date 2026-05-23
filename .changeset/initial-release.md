---
'react-pptx': minor
'react-pptx-mcp': minor
'react-pptx-dev': minor
'create-react-pptx-template': minor
---

Initial public release.

- `react-pptx` — React reconciler + PPTX runtime + `Template` type.
- `react-pptx-mcp` — MCP server + generic `react-pptx-mcp` CLI bin that loads any template by path or package specifier. Bundles `SKILL.md` so Claude can learn the calling convention.
- `react-pptx-dev` — browser dev viewer with hot reload.
- `create-react-pptx-template` — scaffolder. `npm create react-pptx-template@latest my-template`.

End users wire Claude up with a single `npx -y react-pptx-mcp serve --template …` line in their MCP config — no global install, no per-template binary.
