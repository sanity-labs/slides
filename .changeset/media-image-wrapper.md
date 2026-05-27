---
'@sanity-labs/slides': minor
---

Add `@sanity-labs/slides/media` sub-path with a friendly `<Image>` wrapper. Takes a string `src` (no more manual `ArtifactRef` construction), requires `alt` at the type level, and exposes `width` / `height` (intrinsic pixel dims used by the PPTX runtime for aspect-correct sizing), `fit` (`'contain' | 'cover' | 'fill'`), `opacity`, and `rotate`.

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
