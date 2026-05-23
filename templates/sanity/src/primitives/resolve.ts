/**
 * Token resolvers — module-level lookups used by every primitive.
 *
 * Hoisted here so each primitive doesn't import the entire token catalog;
 * the helpers also share a fail-loud error path so a missing token surfaces
 * the same way regardless of which primitive triggered the lookup.
 */

import type { HexColor, TextStyle } from 'react-pptx';
import { typographyByName } from '../tokens.js';
import { inferFontRole } from '../flatten-for-brand.js';
import { colorTokens } from './tokens-extra.js';
import type { ColorToken, TypographyToken } from './types.js';

/**
 * Resolve a color token to its hex value.
 *
 * Reads from the parallel `as const` map (the type-derived source of truth),
 * not from the `Record<string, HexColor>` runtime map; this keeps callers
 * locked to declared tokens at the type level *and* the runtime level.
 */
export const resolveColor = (token: ColorToken): HexColor => colorTokens[token] as HexColor;

/**
 * Resolve a typography token to a substrate `TextStyle`.
 *
 * Mirrors `shared.styleFromToken` but keyed by token name (rather than the
 * raw `TypographyStyle` shape). The font family is inferred from the token
 * name prefix — same logic the Template-flattener uses, so display/body/mono
 * roles match end-to-end.
 *
 * Throws at module load if the underlying token is missing — the brand-
 * refresh fail-loud contract.
 */
export const resolveTypography = (token: TypographyToken): TextStyle => {
  const tk = typographyByName[token];
  if (!tk) {
    throw new Error(
      `@sanity-labs/slides/primitives: missing typography token "${token}". Re-run \`pnpm extract\`.`,
    );
  }
  const out: TextStyle = { fontFamily: inferFontRole(tk.name) };
  if (tk.fontSizePx !== null && tk.fontSizePx !== undefined) {
    out.fontSize = tk.fontSizePx;
  }
  if (tk.fontWeight !== undefined && tk.fontWeight >= 600) {
    out.bold = true;
  }
  return out;
};
