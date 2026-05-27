/**
 * `<Image>` — the friendly wrapper around the `<Image>` primitive.
 *
 * Imported from `@sanity-labs/slides/media`. The primitive at the root export
 * (`@sanity-labs/slides`) stays available for low-level use; this wrapper is
 * the recommended surface for templates and Tier-2 custom components.
 *
 * What it does on top of the primitive:
 *
 *   1. Accepts `src` as a string URL or local path. The wrapper synthesizes
 *      the `ArtifactRef` automatically. No more manual `{ url, artifact:
 *      { type, identifier, resolvedUrl, resolvedAt } }` boilerplate.
 *   2. Requires `alt` at the type level. The primitive's `altText` is
 *      optional; the wrapper closes that accessibility hole.
 *   3. Optional `width` + `height` set the intrinsic aspect ratio via inline
 *      `style.aspectRatio`. Yoga picks it up and the image keeps its shape
 *      when sized with `className="w-1/2"` and friends.
 *   4. Passes `fit` / `opacity` / `rotate` through to the primitive, which
 *      forwards them to the runtime as pptxgenjs `sizing` / `transparency` /
 *      `rotate` on PPTX export and CSS `object-fit` / `opacity` / `transform`
 *      in the dev viewer.
 *
 * Same className/style + Yoga path as every other primitive, so layout-wise
 * it behaves like a plain `<Box>`. The wrapper never touches the layout
 * pipeline directly \u2014 it just produces an `<Image>` element with the right
 * props.
 *
 * ```tsx
 * import { Image } from '@sanity-labs/slides/media';
 *
 * <Image
 *   src="/images/team-photo.jpg"
 *   alt="The team at the offsite"
 *   width={1600}
 *   height={900}
 *   fit="cover"
 *   className="w-full"
 * />
 * ```
 */

import type { ReactElement } from 'react';
import {
  Image as ImagePrimitive,
  type ImageProps as PrimitiveImageProps,
  type ImageRef,
} from '../core/components.js';
import type { ArtifactRef } from '../core/manifest.js';
import type { YogaStyle } from '../core/tailwind-resolver.js';

/** What the wrapper accepts. */
export type ImageProps = {
  /**
   * URL or local path of the image, **or** a fully-resolved `ImageRef` if
   * the caller has its own provenance pipeline (a brand resolver, a Sanity
   * asset, etc.).
   *
   * String form is the common case: the wrapper synthesizes a minimal
   * `ArtifactRef` so the manifest still records what was rendered. Pass an
   * explicit `ImageRef` when you need to override the artifact type or
   * carry a `contentHash`.
   */
  readonly src: string | ImageRef;

  /**
   * Accessibility description \u2014 **required**. Empty string is allowed but
   * must be set explicitly to opt out, mirroring `next/image`'s contract.
   * Surfaces on the PPTX shape's alt-text and the dev viewer's `<img alt>`.
   */
  readonly alt: string;

  /**
   * Intrinsic pixel width. When both `width` and `height` are provided the
   * wrapper sets `style.aspectRatio = width / height` so flex sizing with
   * `className="w-1/2"` (or `style={{ width: ... }}`) preserves the image's
   * shape \u2014 same trick `next/image` uses to prevent layout shift.
   */
  readonly width?: number;

  /** Intrinsic pixel height. See {@link width}. */
  readonly height?: number;

  /**
   * How to fit the image inside its computed rect when the rect's aspect
   * ratio doesn't match the image's. CSS `object-fit` semantics:
   *
   *   - `'contain'` (recommended for photos): scale to fit, letterboxed.
   *   - `'cover'` (recommended for hero / full-bleed): scale to fill, cropped.
   *   - `'fill'` (default): stretch, may distort.
   */
  readonly fit?: 'contain' | 'cover' | 'fill';

  /** Opacity 0\u20131. Defaults to fully opaque. */
  readonly opacity?: number;

  /** Rotation in degrees clockwise. */
  readonly rotate?: number;

  /** Brand-locked Tailwind classes. Layout flows through Yoga as usual. */
  readonly className?: string;

  /** Inline Yoga-shaped style. Lower-level escape hatch. */
  readonly style?: YogaStyle;

  /** Optional slot ID for re-fill workflows. */
  readonly slotId?: PrimitiveImageProps['slotId'];
};

const RESOLVED_AT = (): string => new Date().toISOString();

const hashIdentifier = (input: string): string => {
  // FNV-1a 32-bit \u2014 small, dependency-free, good enough to make wrapper-
  // synthesized identifiers stable for a given source string. Manifest
  // consumers that need cryptographic guarantees should pass an explicit
  // `ImageRef` with their own `contentHash`.
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};

const synthesizeArtifact = (url: string): ArtifactRef => ({
  type: 'image',
  identifier: `media-image-${hashIdentifier(url)}`,
  resolvedUrl: url,
  resolvedAt: RESOLVED_AT(),
});

const toImageRef = (src: string | ImageRef): ImageRef =>
  typeof src === 'string' ? { url: src, artifact: synthesizeArtifact(src) } : src;

const aspectRatioStyle = (
  width: number | undefined,
  height: number | undefined,
): YogaStyle | undefined => {
  if (width === undefined || height === undefined) return undefined;
  if (width <= 0 || height <= 0) return undefined;
  return { aspectRatio: width / height };
};

/**
 * The friendly `<Image>` component. See module docs above for the why and
 * the surface; see `ImageProps` for per-prop semantics.
 */
export const Image = ({
  src,
  alt,
  width,
  height,
  fit,
  opacity,
  rotate,
  className,
  style,
  slotId,
}: ImageProps): ReactElement => {
  const image = toImageRef(src);
  const aspect = aspectRatioStyle(width, height);
  const mergedStyle: YogaStyle | undefined = aspect === undefined ? style : { ...aspect, ...style };

  return (
    <ImagePrimitive
      image={image}
      altText={alt}
      {...(className !== undefined ? { className } : {})}
      {...(mergedStyle !== undefined ? { style: mergedStyle } : {})}
      {...(fit !== undefined ? { fit } : {})}
      {...(opacity !== undefined ? { opacity } : {})}
      {...(rotate !== undefined ? { rotate } : {})}
      {...(slotId !== undefined ? { slotId } : {})}
    />
  );
};
