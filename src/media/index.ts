/**
 * `@sanity-labs/slides/media` — friendly wrappers around the primitive
 * media surface.
 *
 * The root export of `@sanity-labs/slides` ships intentionally minimal
 * primitives (`Slide` / `Box` / `Text` / `Image`). This sub-path layers
 * ergonomic wrappers on top \u2014 modeled on `next/image` \u2014 that take a
 * plain string `src`, require `alt`, and expose `fit` / `opacity` /
 * `rotate` props that map to pptxgenjs `sizing` / `transparency` / `rotate`
 * on PPTX export and CSS `object-fit` / `opacity` / `transform` in the
 * dev viewer.
 *
 * Wrappers are pure React components. They produce primitive elements; the
 * Yoga layout pass, the Tailwind className resolver, and the reconciler
 * never see them. That means the same className grammar, the same
 * brand-token gates, and the same per-template typography roles apply
 * unchanged.
 *
 * ```tsx
 * import { Image } from '@sanity-labs/slides/media';
 *
 * <Image
 *   src="/images/hero.jpg"
 *   alt="Team photo at the offsite"
 *   width={1920}
 *   height={1080}
 *   fit="cover"
 *   className="w-full"
 * />
 * ```
 */

export { Image, type ImageProps } from './image.js';
