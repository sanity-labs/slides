---
'@sanity-labs/slides': minor
---

Add per-template import-allowlist extension so brand templates can expose chrome helpers to agent-authored Tier-2 components.

`Template.additionalImportAllowlist?: ReadonlyArray<string>` lets a template opt additional package specifiers into the agent's allowlist on top of the base brand-lock (`@sanity-labs/slides`, `react`, `zod`). The MCP server reads it from the active effective template and threads it into every `slides_add_component` / `slides_edit_component` call. `slides_list({ detail: "detailed" })` surfaces it under `additionalImports` so the agent discovers what extras it can reach for.

The primary use case is letting custom slides inherit a template's chrome (e.g. a `<BrandSlide>` wrapper that ships the logo + footer + canonical padding) instead of re-rolling layout from primitives every time. Without this, custom slides visually drift from the template's curated slides.

SKILL.md v3.3.0 adds the rule with explicit guidance: when a template lists extras, prefer the chrome helpers. The typecheck `AGENT_HINT` mentions the mechanism so the agent re-orients after a build failure.

API compatibility: additive. Templates that omit the field continue to ship the base brand-lock unchanged.
