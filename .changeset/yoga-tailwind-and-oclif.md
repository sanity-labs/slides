---
'@sanity-labs/slides': minor
---

Add flex layout and a brand-locked Tailwind class dialect; migrate both CLI surfaces to oclif.

**Layout: flex via Yoga.** `<Slide>` / `<Box>` / `<Text>` now accept `className` (brand-locked Tailwind subset) and `style` (raw Yoga). Layouts compose with `flex flex-row gap-6 p-12` etc. instead of hand-computed rects. `<Box rect={{x,y,w,h}}>` stays as an escape hatch for hand-tuned positioning. Box-inside-Box is now legal — nested flex containers are the primary layout pattern.

**Brand-locked Tailwind dialect.** Allowlist-driven resolver: layout primitives (`flex`, `gap-N`, `p-N`, `items-*`, `justify-*`), typography on a fixed scale (`text-xs` … `text-9xl`, role tokens `text-display` / `text-body` / `text-mono`), brand-token colors (`bg-<token>`, `text-<token>` for tokens in `template.colors`), brand-token spacing (`p-<token>` for tokens in `template.spacing`). Unknown classes throw `UnknownClassError` with suggestion-aware messages.

**Slide-level fill.** `<Slide className="bg-<token>">` now emits a full-canvas backing shape behind children; pre-Yoga, brand authors did this by hand with a sentinel `<Box rect={{0,0,w,h}}>` sibling.

**Image accepts `className` / `style`.** Lets agents size images via `aspect-square` / `flex-1` instead of pinning every Image with rect.

**`border-<token>` is rejected.** The reconciler doesn't emit border ops yet; rejecting via the standard allowlist error surfaces the limitation instead of silently no-op-ing.

**CLI: oclif.** Both `slidesctl` (publishable bin) and `pnpm harness` (dev-only) migrated from hand-rolled `node:util` parseArgs to `@oclif/core`. Family-standard, declarative flag definitions, per-command `--help`. Adds `@oclif/core ^4.0.0` and `yoga-layout ^3.2.1` as runtime dependencies.

**SKILL.md v3.2.0.** Rewritten to teach the className API end-to-end. New sections: Brand-locked Tailwind dialect, Readability for presentations, AI tells to avoid, Before declaring done. Cross-referenced against Anthropic's PPTX skill, skill-creator meta-skill, and engineering blog on Agent Skills.

**Test fixture + scaffold token alignment.** Both fixture and `template-base` scaffold now ship matching brand tokens (`fg-base`, `fg-muted`, `bg-surface`, `surface-elevated`, `accent`) so the SKILL's canonical Traction example renders cleanly out of the box.

API compatibility: additive. Existing rect-based components keep rendering; the rect path is exercised end-to-end by `verify-bins.sh`. The `<Box>` and `<Image>` `rect` field is now optional (was required for `<Box>`, still required-or-className for `<Image>`).
