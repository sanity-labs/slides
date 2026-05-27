---
'@sanity-labs/slides': minor
---

Add `@sanity-labs/slides/media` sub-path with a friendly `<Image>` wrapper. Takes a string `src` (no more manual `ArtifactRef` construction), requires `alt` at the type level, and exposes `width` / `height` (intrinsic dims drive `aspectRatio` so flex sizing preserves shape), `fit` (`'contain' | 'cover' | 'fill'`, mapping to pptxgenjs `sizing.type` on export and CSS `object-fit` in the dev viewer), `opacity`, and `rotate`.

Wrapper is a plain React component that renders the primitive `<Image>` underneath, so it composes with the same className/Yoga/typography-role pipeline as every other primitive. The primitive at the root export gains the same `fit` / `opacity` / `rotate` props for low-level use, plumbed through the reconciler, the op-translator, the PPTX runtime, and the fake-runtime / dev viewer.

```tsx
import { Image } from '@sanity-labs/slides/media';

<Image
  src="/images/hero.jpg"
  alt="Team photo at the offsite"
  width={1920}
  height={1080}
  fit="cover"
  className="w-full"
/>;
```

`@sanity-labs/slides/media` is on the agent's base import allowlist so Tier-2 custom components can reach for it without per-template opt-in.
