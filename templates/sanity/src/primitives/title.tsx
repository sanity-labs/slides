/**
 * `<Title/>` — composed page title primitive.
 *
 * Renders a `<TokenBox>` containing a `<TokenText>`. Defaults to the
 * extracted "title-default" position and `text-page-heading-md`. Accepts an
 * explicit `rect` for one-off positions (e.g., the cover slide's larger
 * title block).
 */

import type { ReactElement, ReactNode } from 'react';
import { TokenBox } from './box.js';
import { TokenText } from './text.js';
import type { Rect } from './tokens-extra.js';
import type { ColorToken, PositionToken, TypographyToken } from './types.js';

export interface TitleProps {
  pos?: PositionToken;
  rect?: Rect;
  size?: TypographyToken;
  color?: ColorToken;
  slotId?: `${string}:${string}`;
  children?: ReactNode;
}

export const Title = ({
  pos,
  rect,
  size = 'text-page-heading-md',
  color = 'black',
  slotId,
  children,
}: TitleProps): ReactElement => {
  const resolvedPos = rect === undefined ? (pos ?? 'title-default') : undefined;
  return (
    <TokenBox pos={resolvedPos} rect={rect} slotId={slotId}>
      <TokenText size={size} color={color}>
        {children}
      </TokenText>
    </TokenBox>
  );
};
