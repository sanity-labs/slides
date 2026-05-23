/**
 * `<Eyebrow/>` — small label rendered above a title or content block.
 *
 * Mono-family per the upstream brand (IBM Plex Mono); reference template
 * uppercases by convention. Token `'text-label-sm'` matches the 9pt
 * extracted size from the templates. Accepts an optional `rect` for
 * non-standard positions.
 */

import type { ReactElement, ReactNode } from 'react';
import { TokenBox } from './box.js';
import { TokenText } from './text.js';
import type { Rect } from './tokens-extra.js';
import type { ColorToken, PositionToken, TypographyToken } from './types.js';

export interface EyebrowProps {
  pos?: PositionToken;
  rect?: Rect;
  size?: TypographyToken;
  color?: ColorToken;
  slotId?: `${string}:${string}`;
  children?: ReactNode;
}

export const Eyebrow = ({
  pos,
  rect,
  size = 'text-label-sm',
  color = 'gray-100',
  slotId,
  children,
}: EyebrowProps): ReactElement => {
  const resolvedPos = rect === undefined ? (pos ?? 'eyebrow-default') : undefined;
  return (
    <TokenBox pos={resolvedPos} rect={rect} slotId={slotId}>
      <TokenText size={size} color={color}>
        {children}
      </TokenText>
    </TokenBox>
  );
};
