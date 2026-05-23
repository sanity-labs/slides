/**
 * `<Field/>` — eyebrow+body unit, the repeating cell in TitleAndGrid.
 *
 * Renders an eyebrow above a body paragraph. When inside a `<Grid>` the
 * cell rect is injected via cloneElement (Grid sets `rect` on this
 * component). Outside a grid, callers pass `rect` directly.
 */

import type { ReactElement } from 'react';
import { Box, Text } from 'react-pptx';
import { resolveColor, resolveTypography } from './resolve.js';
import type { Rect } from './tokens-extra.js';
import type { ColorToken, TypographyToken } from './types.js';

export interface FieldProps {
  /** Eyebrow text — small label above the body. */
  eyebrow?: string;
  /** Body text — the main content. */
  body: string;
  /** Cell rect — supplied by `<Grid>` via cloneElement, or directly by caller. */
  rect?: Rect;
  /** Eyebrow typography token. Defaults to `'text-label-sm'`. */
  eyebrowSize?: TypographyToken;
  /** Body typography token. Defaults to `'text-body-sm'`. */
  bodySize?: TypographyToken;
  /** Eyebrow color. Defaults to `'gray-100'` per the reference template. */
  eyebrowColor?: ColorToken;
  /** Body color. Defaults to `'black'`. */
  bodyColor?: ColorToken;
  /** Slot prefix — emits `<prefix>:eyebrow` and `<prefix>:body`. */
  slotPrefix?: string;
  /** Eyebrow row height inside the cell. Defaults to 21.86 (matches reference). */
  eyebrowHeight?: number;
}

const ZERO_RECT: Rect = { x: 0, y: 0, w: 0, h: 0 };
const DEFAULT_EYEBROW_HEIGHT = 21.86;

export const Field = ({
  eyebrow,
  body,
  rect,
  eyebrowSize = 'text-label-sm',
  bodySize = 'text-body-sm',
  eyebrowColor = 'gray-100',
  bodyColor = 'black',
  slotPrefix,
  eyebrowHeight = DEFAULT_EYEBROW_HEIGHT,
}: FieldProps): ReactElement => {
  const cellRect: Rect = rect ?? ZERO_RECT;

  const eyebrowRect: Rect = {
    x: cellRect.x,
    y: cellRect.y,
    w: cellRect.w,
    h: eyebrowHeight,
  };
  const bodyRect: Rect = {
    x: cellRect.x,
    y: cellRect.y + eyebrowHeight,
    w: cellRect.w,
    h: Math.max(0, cellRect.h - eyebrowHeight),
  };

  const eyebrowStyle = {
    ...resolveTypography(eyebrowSize),
    foregroundColor: resolveColor(eyebrowColor),
  };
  const bodyStyle = {
    ...resolveTypography(bodySize),
    foregroundColor: resolveColor(bodyColor),
  };

  return (
    <>
      {eyebrow === undefined ? null : (
        <Box
          rect={eyebrowRect}
          slotId={
            slotPrefix === undefined
              ? undefined
              : (`${slotPrefix}:eyebrow` as `${string}:${string}`)
          }
          textStyle={eyebrowStyle}
        >
          <Text>{eyebrow}</Text>
        </Box>
      )}
      <Box
        rect={bodyRect}
        slotId={
          slotPrefix === undefined ? undefined : (`${slotPrefix}:body` as `${string}:${string}`)
        }
        textStyle={bodyStyle}
      >
        <Text>{body}</Text>
      </Box>
    </>
  );
};
