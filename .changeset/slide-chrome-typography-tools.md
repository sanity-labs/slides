---
'@sanity-labs/slides': minor
---

Framework-level improvements driven by real agent runs.

**`Template.layout` — Next.js-style automatic chrome.** Templates declare a layout component once; the framework wraps every `<Slide>`'s children with it. Curated and agent-authored slides share the same chrome (background, logo, footer, safe-zone padding) without any template-specific imports in custom components. Per-slide variation via `<Slide layoutProps={{ ... }}>`; opt-out via `<Slide noLayout>`. New `defineLayout<P>()` helper gives template authors typed `layoutProps`.

**Presentation-scale typography.** `text-*` classes now resolve to projection-readable sizes by default (`text-xs` = 12pt, `text-base` = 20pt, `text-4xl` = 48pt, `text-9xl` = 96pt). The old web scale (8–72pt) was invisible when projected. Also adds `text-role-<name>` classes that resolve via `template.typography` so agents can pick a role (`text-role-title`) instead of a size — guaranteeing typographic consistency across a deck.

**New `slides_preview` MCP tool.** Renders slide specs to PNG images via SVG + resvg and returns them inline as MCP image content blocks. The agent can visually review its own output and self-correct layout issues. Optional `slideIndices` parameter to preview only specific slides.

**New `slides_patch_component` MCP tool.** Search/replace patches instead of full-file rewrites — saves hundreds of tokens per edit cycle when fixing a className or tweaking a prop. Falls back to `slides_edit_component` for major rewrites.

**`additionalImportAllowlist` packages now get linked** into the deck's `node_modules` automatically. Templates that opt in extras packages (chrome helpers, etc.) are now actually importable from custom components.

**Module cache fix.** `loadDeckTemplate` now cache-busts component imports, not just `index.ts` — `slides_edit_component` changes take effect immediately instead of getting masked by stale ESM cache.

Plus minor: `slides_list` hints when `Template.skill` is set; harness agent loop passes image content blocks through so vision works on `slides_preview` output.
