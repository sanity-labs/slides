/**
 * Token-typed prop types for the primitive layer.
 *
 * Every type here is derived statically from the token objects in
 * `tokens-extra.ts` via `keyof typeof`. Tokens added → types update
 * automatically. Tokens removed → callers fail to typecheck.
 *
 * This is the entire point: the LLM tool surface and component prop surface
 * cannot reference a token that doesn't exist.
 */

import type {
  colorTokens,
  positionTokens,
  spacingTokens,
  typographyTokens,
} from './tokens-extra.js';

/** A color token name; literal-string union derived from the color catalog. */
export type ColorToken = keyof typeof colorTokens;

/** A position token name; literal-string union derived from the canvas-rect catalog. */
export type PositionToken = keyof typeof positionTokens;

/** A spacing token name; literal-string union derived from the spacing catalog. */
export type SpacingToken = keyof typeof spacingTokens;

/** A typography token name; literal-string union derived from the typography catalog. */
export type TypographyToken = keyof typeof typographyTokens;
