/**
 * `<TokenBox/>` — token-keyed positioned box.
 *
 * Wraps the substrate `<Box/>` with token-keyed position, background, and
 * (reserved) padding. Misspell a token, get a TS error.
 *
 * - `pos` — named position from `positionTokens`.
 * - `rect` — raw position. When set, overrides `pos`. Used by `<Grid>` via
 *   `cloneElement` to inject computed cell rectangles.
 * - `bg` — background color, token-keyed.
 * - `pad` — padding, token-keyed (reserved; substrate doesn't render this yet).
 *
 * If neither `pos` nor `rect` is provided, the box falls back to a 0-sized
 * rect at the origin (which surfaces as a missing shape — fail visible).
 */

import type { ReactElement, ReactNode } from 'react';
import { Box, type TextStyle, type SlotId } from 'react-pptx';
import { POSITION_MAP, type Rect } from './tokens-extra.js';
import type { ColorToken, PositionToken, SpacingToken } from './types.js';
import { resolveColor } from './resolve.js';

export interface TokenBoxProps {
  /** Token-keyed position. `rect` overrides this when both are present. */
  pos?: PositionToken;
  /** Raw position. Overrides `pos` when present. */
  rect?: Rect;
  /** Background color, token-keyed. */
  bg?: ColorToken;
  /** Padding, token-keyed. Reserved — substrate doesn't render this yet. */
  pad?: SpacingToken;
  /** Optional slot ID, passed through to the substrate `<Box>`. */
  slotId?: SlotId;
  /** Optional inline text style. */
  textStyle?: TextStyle;
  /** Children — typically `<TokenText>` runs or raw strings. */
  children?: ReactNode;
}

const ZERO_RECT: Rect = { x: 0, y: 0, w: 0, h: 0 };

export const TokenBox = ({
  pos,
  rect,
  bg,
  pad: _pad,
  slotId,
  textStyle,
  children,
}: TokenBoxProps): ReactElement => {
  const resolvedRect: Rect =
    rect !== undefined
      ? rect
      : pos !== undefined
        ? (POSITION_MAP.get(pos) ?? ZERO_RECT)
        : ZERO_RECT;

  const fill = bg !== undefined ? { kind: 'solid' as const, color: resolveColor(bg) } : undefined;

  return (
    <Box rect={resolvedRect} fill={fill} slotId={slotId} textStyle={textStyle}>
      {children}
    </Box>
  );
};
