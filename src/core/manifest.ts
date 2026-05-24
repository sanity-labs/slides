/**
 * The generation manifest — what the reconciler emits *alongside* the SlideOps.
 *
 * The manifest captures everything needed to:
 *
 * 1. Re-fill the deck later (`replaceAllText` against named slots, preserving
 *    manual polish on the rest of the deck).
 * 2. Audit which decks were AI-generated and from which template version.
 * 3. Detect drift between resolved-at-generation-time brand artifacts
 *    (textures, logos, master templates) and their current upstream state.
 *
 * Template-agnostic: any brand package reads it the same way; the substrate
 * doesn't encode brand-specific slot keys.
 */

import type { SlideOp } from './runtime.js';

/**
 * A stable identity for a slot in a generated deck.
 *
 * Slot IDs are encoded into the Slides shape's *alt text* at generation time —
 * the alt-text-as-ID pattern documented in `generation-model.md`. This is what
 * makes in-place re-fill robust: when re-running with new data, we look up
 * shapes by the alt-text token rather than by index/position (which can drift
 * if the marketer moved or duplicated a shape).
 *
 * Format: `<componentName>:<slotName>` (colon-separated, both segments are
 * `[a-z0-9-]+`). E.g., `cover:title`, `two-column:left-body`.
 *
 * Restricting the character set keeps the alt-text round-trippable across
 * backends, some of which are picky about non-ASCII content.
 */
export type SlotId = `${string}:${string}`;

/** The token we wrap a SlotId in when storing it as alt-text on a Slides shape. */
const ALT_TEXT_PREFIX = 'rgs-slot:';

/**
 * Encode a SlotId into the alt-text representation written on a Slides shape.
 *
 * The wrapper prefix `rgs-slot:` is what `decodeAltText` keys off when reading
 * an existing deck back. Anything else in the alt-text field — a marketer's
 * accessibility caption, an empty string — is treated as "not a managed slot."
 */
export const encodeAltText = (slotId: SlotId): string => `${ALT_TEXT_PREFIX}${slotId}`;

/**
 * Decode a Slides shape's alt-text field back into a SlotId, or return
 * `undefined` if the alt-text isn't a managed slot tag.
 *
 * Mirror of `encodeAltText`. Used at re-fill time to identify which shapes
 * the system owns.
 */
export const decodeAltText = (altText: string | undefined | null): SlotId | undefined => {
  if (typeof altText !== 'string') return undefined;
  if (!altText.startsWith(ALT_TEXT_PREFIX)) return undefined;
  const candidate = altText.slice(ALT_TEXT_PREFIX.length);
  // Must look like `a:b` with both halves non-empty and matching the safe charset.
  if (!/^[a-z0-9-]+:[a-z0-9-]+$/.test(candidate)) return undefined;
  return candidate as SlotId;
};

/**
 * The reconciler's record of where each slot landed in the emitted ops.
 *
 * Keys are SlotIds. Values reference the Slides object IDs (`shapeId` /
 * `imageId`) the reconciler assigned at op-emission time. Re-fill resolves a
 * SlotId → object ID via this map, then issues a `replaceAllText` op against
 * that object.
 */
export type SlotRegistry = Readonly<Record<SlotId, string>>;

/**
 * A reference to a brand artifact (texture, logo, font, master template, image)
 * the deck depends on at generation time.
 *
 * Recorded in the manifest so re-fill can detect 404s and (optionally)
 * verify content integrity via `contentHash`. The substrate type doesn't
 * fetch or validate — it just records what the brand resolver produced.
 */
export interface ArtifactRef {
  /** What kind of artifact this is. Drives any artifact-type-specific re-fill behavior. */
  readonly type: 'texture' | 'logo' | 'font' | 'master-template' | 'image';

  /**
   * Template-meaningful identifier, e.g., `"dots-grid-base-medium-dark"`. Stable
   * across generations; the brand's resolver maps this to a current URL.
   */
  readonly identifier: string;

  /** The URL the resolver produced for this artifact at generation time. */
  readonly resolvedUrl: string;

  /** ISO-8601 timestamp the resolution occurred. */
  readonly resolvedAt: string;

  /**
   * Optional SHA-256 (or other) of the artifact bytes, hex-encoded.
   *
   * The reconciler does not compute or verify this; it's a forward-compat
   * slot brands can populate when they want stricter integrity checks at
   * re-fill time.
   */
  readonly contentHash?: string;
}

/**
 * The full record the reconciler emits alongside its SlideOp stream.
 *
 * Persisted somewhere accessible at re-fill time. The persistence strategy
 * is a runtime concern (each backend picks its own — file metadata, a
 * sidecar JSON, embedded XML, etc.); this type just defines the shape.
 */
export interface GenerationManifest {
  /** Schema version of the manifest itself. Bump on breaking changes to this shape. */
  readonly manifestVersion: '1';

  /** The substrate that produced this manifest. Locked literal for forward compat. */
  readonly generatedBy: 'react-pptx';

  /** ISO-8601 timestamp of generation. */
  readonly generatedAt: string;

  /** Name of the template whose components produced this deck (`template.name`). */
  readonly templateName: string;

  /** ID of the deck this manifest applies to. `null` if the deck wasn't created yet. */
  readonly deckId: string | null;

  /** Map of SlotId → Slides object ID, for re-fill lookups. */
  readonly slots: SlotRegistry;

  /** Template artifacts the deck depends on. See `ArtifactRef`. */
  readonly artifacts: readonly ArtifactRef[];
}

/**
 * The full output of a single `renderToOps` call.
 *
 * Carries both the op stream (what to send to the runtime) and the manifest
 * (what to persist). They're emitted together because they're computed
 * together — the slot map can't exist without the ops that created the
 * shapes it points at.
 */
export interface ReconcileResult {
  /** The op stream, in the order the reconciler emitted them. */
  readonly ops: readonly SlideOp[];
  /** The generation manifest. */
  readonly manifest: GenerationManifest;
}
