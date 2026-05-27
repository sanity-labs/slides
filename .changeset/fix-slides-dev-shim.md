---
'@sanity-labs/slides': patch
---

Fix `slides-dev` crashing on `Cannot find module 'slides-dev.ts'` when run from a published install.

The shim used tsx to load `slides-dev.ts` at runtime, which works in this repo's source tree but fails for consumers — published packages ship only `dist/`, not `src/`. The shim now prefers the compiled `dist/dev/bin/slides-dev.js` when present (the published case) and falls back to the `.ts` source via tsx only when running from a dev checkout.
