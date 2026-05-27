# @sanity-labs/slides

## 0.6.0

### Minor Changes

- [#22](https://github.com/sanity-labs/slides/pull/22) [`8b5833f`](https://github.com/sanity-labs/slides/commit/8b5833f30ec54047282773051acd20edeaa83e4d) Thanks [@RostiMelk](https://github.com/RostiMelk)! - Add `@sanity-labs/slides/media` sub-path with a friendly `<Image>` wrapper. Takes a string `src` (no more manual `ArtifactRef` construction), requires `alt` at the type level, and exposes `width` / `height` (intrinsic pixel dims used by the PPTX runtime for aspect-correct sizing), `fit` (`'contain' | 'cover' | 'fill'`), `opacity`, and `rotate`.

  ```tsx
  import { Image } from '@sanity-labs/slides/media';

  <Image
    src="/images/hero.jpg"
    alt="Team photo at the offsite"
    width={1920}
    height={1080}
    fit="contain"
    className="w-full aspect-video"
  />;
  ```

  Wrapper is a plain React component that renders the primitive `<Image>` underneath, so it composes with the same className / Yoga / typography-role pipeline as every other primitive.

  **Runtime behavior:**
  - `fit: 'contain'` + `width` / `height`: PPTX runtime computes an aspect-correct inscribed rect inside the laid-out box (no use of pptxgenjs's buggy `sizing` API). Dev viewer uses CSS `object-fit: contain`.
  - `fit: 'fill'` (default): stretches to fit on both runtimes.
  - `fit: 'cover'`: works in the dev viewer (CSS `object-fit: cover`); **degrades to `'fill'` on PPTX export with a console warning** until raw OOXML `srcRect` emission is added. Verified by opening exported decks in Keynote: pptxgenjs's `sizing.type='cover'` produces images that overflow their cells in PowerPoint and Keynote alike.
  - `opacity`: PPTX `transparency` (inverted) + CSS `opacity`.
  - `rotate`: PPTX `rotate` + CSS `transform: rotate(...)`. Verified end-to-end in Keynote.

  The primitive at the root export gains the same `fit` / `intrinsicWidth` / `intrinsicHeight` / `opacity` / `rotate` props for low-level use, plumbed through the reconciler, the op-translator, the PPTX runtime, and the fake-runtime / dev viewer.

  `@sanity-labs/slides/media` is on the agent's base import allowlist (`code-gen/imports-allowlist.ts`) so Tier-2 custom components can reach for it without per-template opt-in.

## 0.5.4

### Patch Changes

- [#20](https://github.com/sanity-labs/slides/pull/20) [`5c28ce2`](https://github.com/sanity-labs/slides/commit/5c28ce2d777c747169f4f0c2dcf982acdd8282fc) Thanks [@RostiMelk](https://github.com/RostiMelk)! - Fix `<Box rect={...} className="flex flex-row gap-4">` silently dropping the className for layout. `flex-row`, `gap-*`, `pt-*`, `items-*`, `justify-*`, and other layout classes were ignored on rect-positioned boxes, even though the `layout.ts` comment promised "a rect-positioned card can use flex internally." Position and size still come from the rect; everything else now flows from className/style so a rect-positioned card lays its children out the way the agent asked.

## 0.5.3

### Patch Changes

- [#18](https://github.com/sanity-labs/slides/pull/18) [`c1a5a6e`](https://github.com/sanity-labs/slides/commit/c1a5a6e7552fa82753bf829870c4116ab1f3da7f) Thanks [@RostiMelk](https://github.com/RostiMelk)! - Fix `slides-dev` crashing on `Cannot find module 'slides-dev.ts'` when run from a published install.

  The shim used tsx to load `slides-dev.ts` at runtime, which works in this repo's source tree but fails for consumers — published packages ship only `dist/`, not `src/`. The shim now prefers the compiled `dist/dev/bin/slides-dev.js` when present (the published case) and falls back to the `.ts` source via tsx only when running from a dev checkout.

## 0.5.2

### Patch Changes

- [#16](https://github.com/sanity-labs/slides/pull/16) [`4e99602`](https://github.com/sanity-labs/slides/commit/4e99602c2b7026bcaa9c0e7f847e10be70dc721c) Thanks [@RostiMelk](https://github.com/RostiMelk)! - `slidesctl init` now writes the absolute path to the current Node binary into the MCP client config instead of bare `node`.

  GUI apps like Claude Desktop don't inherit the user's shell PATH, so `command: "node"` could resolve to whichever `node` happens to be first in the GUI's PATH — often an ancient system Node that pre-dates top-level `await` and crashes the slidesctl server immediately with `SyntaxError: Unexpected reserved word`. Now we use `process.execPath`, which is the absolute path to the current Node binary (the one running `slidesctl init`). This guarantees the same Node version that successfully ran the wizard also runs the server.

  Existing broken entries can be fixed by re-running `slidesctl use <name>`, or manually replacing `"command": "node"` with the absolute path in the MCP client config.

- [#16](https://github.com/sanity-labs/slides/pull/16) [`4e99602`](https://github.com/sanity-labs/slides/commit/4e99602c2b7026bcaa9c0e7f847e10be70dc721c) Thanks [@RostiMelk](https://github.com/RostiMelk)! - `slidesctl init` and friends — friendlier copy throughout.

  The first version of the wizard leaked protocol jargon ("server name", "MCP client", "Pass --client claude-desktop explicitly") that meant nothing to a designer or PM setting up the tool for the first time. This rewrites every prompt, description, and success message in plain language.

  The "server name" prompt is gone entirely on the happy path — the wizard derives a sensible label from the source and only asks the user to pick a different one when they're installing a second template that would collide. Most users will now see three questions: which template, where to save decks, and which app(s) to set it up for.

  Also adds a friendly intro on first run and a "what to do next" block in the success message:

  ```
  Let's set up a slide template so Claude can make decks in your brand.

  ? Which template? (paste a GitHub link, URL, or folder path)
  ? Where should Claude save the decks it makes? ~/Desktop/slides-template-decks
  ? Set up for Claude Desktop? Yes

  ✓ Done. "slides-template" is set up.

  What to do next:
    1. Quit Claude Desktop completely (Cmd+Q) and reopen it.
    2. Ask Claude to make you a deck — e.g. "make a 5-slide pitch for Acme Corp".
    3. Generated files will appear in: ~/Desktop/slides-template-decks
  ```

  Also adds `slidesctl update` (and surfaces it in `status` and the post-install message) so users know how to pull template changes over time.

## 0.5.1

### Patch Changes

- [#14](https://github.com/sanity-labs/slides/pull/14) [`3bc7351`](https://github.com/sanity-labs/slides/commit/3bc7351dde742cf83a5fdc05c890b8dbd494e701) Thanks [@RostiMelk](https://github.com/RostiMelk)! - `slidesctl init` and friends — friendlier copy throughout.

  The first version of the wizard leaked protocol jargon ("server name", "MCP client", "Pass --client claude-desktop explicitly") that meant nothing to a designer or PM setting up the tool for the first time. This rewrites every prompt, description, and success message in plain language.

  The "server name" prompt is gone entirely on the happy path — the wizard derives a sensible label from the source and only asks the user to pick a different one when they're installing a second template that would collide. Most users will now see three questions: which template, where to save decks, and which app(s) to set it up for.

  Also adds a friendly intro on first run and a "what to do next" block in the success message:

  ```
  Let's set up a slide template so Claude can make decks in your brand.

  ? Which template? (paste a GitHub link, URL, or folder path)
  ? Where should Claude save the decks it makes? ~/Desktop/slides-template-decks
  ? Set up for Claude Desktop? Yes

  ✓ Done. "slides-template" is set up.

  What to do next:
    1. Quit Claude Desktop completely (Cmd+Q) and reopen it.
    2. Ask Claude to make you a deck — e.g. "make a 5-slide pitch for Acme Corp".
    3. Generated files will appear in: ~/Desktop/slides-template-decks
  ```

  Also adds `slidesctl update` (and surfaces it in `status` and the post-install message) so users know how to pull template changes over time.

## 0.5.0

### Minor Changes

- [#12](https://github.com/sanity-labs/slides/pull/12) [`4d49f4b`](https://github.com/sanity-labs/slides/commit/4d49f4b39dd17e7e9de4e2138f63a2955a9e7ef1) Thanks [@RostiMelk](https://github.com/RostiMelk)! - `slidesctl init` and friends — first-class multi-template setup.

  Four new commands transform first-time-user setup from "manually edit JSON config" into a guided wizard:
  - **`slidesctl init`** — interactive wizard. Pick a template (GitHub repo or local directory), choose a server name, pick an output dir, pick which MCP clients to install into. The framework clones, builds, and writes the config. Pass `--yes` plus flags for non-interactive use.
  - **`slidesctl status`** — show installed servers, where their templates live on disk, and which MCP clients have them wired up.
  - **`slidesctl use <name>`** — refresh a server's template to the latest commit, swap to a different source, or change its output dir. Re-uses the existing install for the same server name.
  - **`slidesctl remove <name>`** — clean uninstall from every MCP client config. Pass `--purge` to also delete the cached template.

  GitHub sources are cloned to `~/.local/share/slidesctl/templates/<name>/`, dependency-installed (pnpm if `pnpm-lock.yaml` is present, npm otherwise), and built. State lives at `~/.config/slidesctl/state.json` so the same template can be re-used across reinstalls.

  Multi-template Claude setups now work cleanly — every server is its own MCP entry with its own output dir, so running both `sanity-slides` and `acme-slides` side-by-side just works.

## 0.4.0

### Minor Changes

- [#10](https://github.com/sanity-labs/slides/pull/10) [`f425776`](https://github.com/sanity-labs/slides/commit/f4257768363c425c1ebdbfdc940a66c0421b285a) Thanks [@RostiMelk](https://github.com/RostiMelk)! - Framework-level improvements driven by real agent runs.

  **`Template.layout` — Next.js-style automatic chrome.** Templates declare a layout component once; the framework wraps every `<Slide>`'s children with it. Curated and agent-authored slides share the same chrome (background, logo, footer, safe-zone padding) without any template-specific imports in custom components. Per-slide variation via `<Slide layoutProps={{ ... }}>`; opt-out via `<Slide noLayout>`. New `defineLayout<P>()` helper gives template authors typed `layoutProps`.

  **Presentation-scale typography.** `text-*` classes now resolve to projection-readable sizes by default (`text-xs` = 12pt, `text-base` = 20pt, `text-4xl` = 48pt, `text-9xl` = 96pt). The old web scale (8–72pt) was invisible when projected. Also adds `text-role-<name>` classes that resolve via `template.typography` so agents can pick a role (`text-role-title`) instead of a size — guaranteeing typographic consistency across a deck.

  **New `slides_preview` MCP tool.** Renders slide specs to PNG images via SVG + resvg and returns them inline as MCP image content blocks. The agent can visually review its own output and self-correct layout issues. Optional `slideIndices` parameter to preview only specific slides.

  **New `slides_patch_component` MCP tool.** Search/replace patches instead of full-file rewrites — saves hundreds of tokens per edit cycle when fixing a className or tweaking a prop. Falls back to `slides_edit_component` for major rewrites.

  **`additionalImportAllowlist` packages now get linked** into the deck's `node_modules` automatically. Templates that opt in extras packages (chrome helpers, etc.) are now actually importable from custom components.

  **Module cache fix.** `loadDeckTemplate` now cache-busts component imports, not just `index.ts` — `slides_edit_component` changes take effect immediately instead of getting masked by stale ESM cache.

  Plus minor: `slides_list` hints when `Template.skill` is set; harness agent loop passes image content blocks through so vision works on `slides_preview` output.

## 0.3.0

### Minor Changes

- [#8](https://github.com/sanity-labs/slides/pull/8) [`5241b2b`](https://github.com/sanity-labs/slides/commit/5241b2b8cb2e093772b87641759dec4e8cb10783) Thanks [@RostiMelk](https://github.com/RostiMelk)! - Add `Template.skill` field and `slides_guidelines` MCP tool so templates can expose design guidelines to the agent.

  `Template.skill?: string` lets template authors bundle a markdown document with brand rules, component-selection heuristics, and visual constraints. The new `slides_guidelines` tool returns it to the agent at session start. `slides_list` hints when guidelines are available so the agent knows to read them.

  SKILL.md updated to document the new tool (8 tools total, up from 7) and adds a "Read guidelines" step to the Tier 1 workflow. The scaffold template-base ships a placeholder SKILL.md that gets stamped into new templates.

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
