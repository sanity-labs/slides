/**
 * `<Footer/>` — small bottom-right metadata text.
 *
 * Used for page numbers, copyright, presenter — anything in the lower-right
 * safe area. Accepts an optional `rect` for non-standard positions
 * (e.g., presenter-name field offset from the date field on cover slides).
 */

import type { ReactElement, ReactNode } from 'react';
import { TokenBox } from './box.js';
import { TokenText } from './text.js';
import type { Rect } from './tokens-extra.js';
import type { ColorToken, PositionToken, TypographyToken } from './types.js';

export interface FooterProps {
  pos?: PositionToken;
  rect?: Rect;
  size?: TypographyToken;
  color?: ColorToken;
  slotId?: `${string}:${string}`;
  children?: ReactNode;
}

export const Footer = ({
  pos,
  rect,
  size = 'text-label-sm',
  color = 'gray-300',
  slotId,
  children,
}: FooterProps): ReactElement => {
  const resolvedPos = rect === undefined ? (pos ?? 'footer-default') : undefined;
  return (
    <TokenBox pos={resolvedPos} rect={rect} slotId={slotId}>
      <TokenText size={size} color={color}>
        {children}
      </TokenText>
    </TokenBox>
  );
};
