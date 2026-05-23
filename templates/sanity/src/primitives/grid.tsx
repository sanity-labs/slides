/**
 * `<Grid/>` — deterministic row-major child positioner.
 *
 * Divides a bounding rectangle (token-keyed via `pos`) into a regular grid
 * of `cols` × `rows` cells, with token-keyed gaps between them. Children
 * are placed in row-major order (left→right, top→bottom).
 *
 * # Cell injection
 *
 * The Grid clones each child with a `rect` prop holding the cell's
 * computed rectangle. This is a pure-React, no-context approach: the
 * reconciler walks function components synchronously without React's
 * dispatcher, so `useContext` is unavailable at the substrate layer.
 * `cloneElement` works because the resulting React tree is just
 * data — the cloned element carries the injected prop verbatim into the
 * reconciler's walk.
 *
 * # Forced vs default positioning
 *
 * Children that explicitly pass a `pos` keep that — the cloned `rect`
 * always wins over the Grid-injected one *only* if the child uses `rect`
 * directly. `<TokenBox pos="...">` overrides because `rect` is undefined on
 * the call site; the cloned `rect` is then applied. This was a deliberate
 * design choice: callers who want to escape the Grid pass an explicit
 * `rect` (which short-circuits the position-token lookup) and that
 * `rect` is overridden by the Grid's clone. If a future use-case needs
 * "this one cell escapes the grid completely," wrap it in a `<Slide>`-level
 * sibling instead.
 *
 * # Cell math
 *
 *   cellW = (boundsW - (cols - 1) * gap) / cols
 *   cellH = (boundsH - (rows - 1) * gap) / rows
 *   cell[i].x = boundsX + col * (cellW + gap)
 *   cell[i].y = boundsY + row * (cellH + gap)
 *
 * If `rows` is unspecified, it grows to fit children: `ceil(N / cols)`.
 */

import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { POSITION_MAP, SPACING_MAP, type Rect } from './tokens-extra.js';
import type { PositionToken, SpacingToken } from './types.js';

export interface GridProps {
  cols: 1 | 2 | 3 | 4;
  rows?: 1 | 2 | 3;
  gap: SpacingToken;
  pos: PositionToken;
  children: ReactNode;
}

const ZERO_RECT: Rect = { x: 0, y: 0, w: 0, h: 0 };

/**
 * Compute the per-cell rectangle for index `i` in a row-major grid.
 *
 * Exported for unit-test usage; the tests assert positions match the
 * extracted reference template.
 */
export const cellRect = (
  bounds: Rect,
  cols: number,
  rows: number,
  gap: number,
  i: number,
): Rect => {
  const col = i % cols;
  const row = Math.floor(i / cols);
  const cellW = cols <= 0 ? 0 : (bounds.w - (cols - 1) * gap) / cols;
  const cellH = rows <= 0 ? 0 : (bounds.h - (rows - 1) * gap) / rows;
  return {
    x: bounds.x + col * (cellW + gap),
    y: bounds.y + row * (cellH + gap),
    w: cellW,
    h: cellH,
  };
};

export const Grid = ({ cols, rows, gap, pos, children }: GridProps): ReactElement => {
  const bounds = POSITION_MAP.get(pos) ?? ZERO_RECT;
  const gapPt = SPACING_MAP.get(gap) ?? 0;
  const childArray = Children.toArray(children);
  const inferredRows = rows ?? (Math.max(1, Math.ceil(childArray.length / cols)) as 1 | 2 | 3);

  return (
    <>
      {childArray.map((child, i) => {
        const rect = cellRect(bounds, cols, inferredRows, gapPt, i);
        if (!isValidElement(child)) return child;
        // Inject the computed cell rect as a `rect` prop. `<TokenBox>`,
        // `<Field>`, `<TokenImage>` all accept `rect` as their explicit
        // position; the cloned prop displaces any token-derived default.
        return cloneElement(child as ReactElement<{ rect?: Rect }>, { rect, key: i });
      })}
    </>
  );
};
