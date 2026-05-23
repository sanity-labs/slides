/**
 * `<Stack/>` — vertical or horizontal stack with token-keyed gap.
 *
 * Implemented as a `<Grid>` with `cols=1` (vertical) or `rows=1`
 * (horizontal). Same cell-injection mechanic: each child is cloned with a
 * computed `rect` prop.
 */

import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { cellRect } from './grid.js';
import { POSITION_MAP, SPACING_MAP, type Rect } from './tokens-extra.js';
import type { PositionToken, SpacingToken } from './types.js';

export interface StackProps {
  direction: 'vertical' | 'horizontal';
  gap: SpacingToken;
  pos: PositionToken;
  children: ReactNode;
}

const ZERO_RECT: Rect = { x: 0, y: 0, w: 0, h: 0 };

export const Stack = ({ direction, gap, pos, children }: StackProps): ReactElement => {
  const bounds = POSITION_MAP.get(pos) ?? ZERO_RECT;
  const gapPt = SPACING_MAP.get(gap) ?? 0;
  const childArray = Children.toArray(children);
  const n = childArray.length;
  const cols = direction === 'horizontal' ? Math.max(1, n) : 1;
  const rows = direction === 'horizontal' ? 1 : Math.max(1, n);

  return (
    <>
      {childArray.map((child, i) => {
        const rect = cellRect(bounds, cols, rows, gapPt, i);
        if (!isValidElement(child)) return child;
        return cloneElement(child as ReactElement<{ rect?: Rect }>, { rect, key: i });
      })}
    </>
  );
};
