# @sanity-labs/slides

## 0.2.0

### Minor Changes

- [#7](https://github.com/sanity-labs/slides/pull/7) [`b945ee3`](https://github.com/sanity-labs/slides/commit/b945ee30c09d2f02f214e8f3d4f925957e2f89a0) Thanks [@RostiMelk](https://github.com/RostiMelk)! - Add per-template import-allowlist extension so brand templates can expose chrome helpers to agent-authored Tier-2 components.

  `Template.additionalImportAllowlist?: ReadonlyArray<string>` lets a template opt additional package specifiers into the agent's allowlist on top of the base brand-lock (`@sanity-labs/slides`, `react`, `zod`). The MCP server reads it from the active effective template and threads it into every `slides_add_component` / `slides_edit_component` call. `slides_list({ detail: "detailed" })` surfaces it under `additionalImports` so the agent discovers what extras it can reach for.

  The primary use case is letting custom slides inherit a template's chrome (e.g. a `<BrandSlide>` wrapper that ships the logo + footer + canonical padding) instead of re-rolling layout from primitives every time. Without this, custom slides visually drift from the template's curated slides.

  SKILL.md v3.3.0 adds the rule with explicit guidance: when a template lists extras, prefer the chrome helpers. The typecheck `AGENT_HINT` mentions the mechanism so the agent re-orients after a build failure.

  API compatibility: additive. Templates that omit the field continue to ship the base brand-lock unchanged.

- [#4](https://github.com/sanity-labs/slides/pull/4) [`7bcd41e`](https://github.com/sanity-labs/slides/commit/7bcd41ede566c00330b0586b51e3515fad32d196) Thanks [@RostiMelk](https://github.com/RostiMelk)! - Add flex layout and a brand-locked Tailwind class dialect; migrate both CLI surfaces to oclif.

  **Layout: flex via Yoga.** `<Slide>` / `<Box>` / `<Text>` now accept `className` (brand-locked Tailwind subset) and `style` (raw Yoga). Layouts compose with `flex flex-row gap-6 p-12` etc. instead of hand-computed rects. `<Box rect={{x,y,w,h}}>` stays as an escape hatch for hand-tuned positioning. Box-inside-Box is now legal — nested flex containers are the primary layout pattern.

  **Brand-locked Tailwind dialect.** Allowlist-driven resolver: layout primitives (`flex`, `gap-N`, `p-N`, `items-*`, `justify-*`), typography on a fixed scale (`text-xs` … `text-9xl`, role tokens `text-display` / `text-body` / `text-mono`), brand-token colors (`bg-<token>`, `text-<token>` for tokens in `template.colors`), brand-token spacing (`p-<token>` for tokens in `template.spacing`). Unknown classes throw `UnknownClassError` with suggestion-aware messages.

  **Slide-level fill.** `<Slide className="bg-<token>">` now emits a full-canvas backing shape behind children; pre-Yoga, brand authors did this by hand with a sentinel `<Box rect={{0,0,w,h}}>` sibling.

  **Image accepts `className` / `style`.** Lets agents size images via `aspect-square` / `flex-1` instead of pinning every Image with rect.

  **`border-<token>` is rejected.** The reconciler doesn't emit border ops yet; rejecting via the standard allowlist error surfaces the limitation instead of silently no-op-ing.

  **CLI: oclif.** Both `slidesctl` (publishable bin) and `pnpm harness` (dev-only) migrated from hand-rolled `node:util` parseArgs to `@oclif/core`. Family-standard, declarative flag definitions, per-command `--help`. Adds `@oclif/core ^4.0.0` and `yoga-layout ^3.2.1` as runtime dependencies.

  **SKILL.md v3.2.0.** Rewritten to teach the className API end-to-end. New sections: Brand-locked Tailwind dialect, Readability for presentations, AI tells to avoid, Before declaring done. Cross-referenced against Anthropic's PPTX skill, skill-creator meta-skill, and engineering blog on Agent Skills.

  **Test fixture + scaffold token alignment.** Both fixture and `template-base` scaffold now ship matching brand tokens (`fg-base`, `fg-muted`, `bg-surface`, `surface-elevated`, `accent`) so the SKILL's canonical Traction example renders cleanly out of the box.

  API compatibility: additive. Existing rect-based components keep rendering; the rect path is exercised end-to-end by `verify-bins.sh`. The `<Box>` and `<Image>` `rect` field is now optional (was required for `<Box>`, still required-or-className for `<Image>`).

## 0.1.0

### Minor Changes

- [`b18e581`](https://github.com/sanity-labs/slides/commit/b18e581300b8865dfe0f8cb5bfb0234648be3fb7) Thanks [@RostiMelk](https://github.com/RostiMelk)! - Initial public release of `@sanity-labs/slides`.

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
