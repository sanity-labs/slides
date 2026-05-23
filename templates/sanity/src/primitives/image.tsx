/**
 * `<TokenImage/>` — token-keyed positioned image.
 *
 * Wraps the substrate `<Image/>` with a token-keyed position. The brand
 * artifact reference is passed through verbatim.
 */

import type { ReactElement } from 'react';
import { Image, type ImageRef, type SlotId } from 'react-pptx';
import { POSITION_MAP, type Rect } from './tokens-extra.js';
import type { PositionToken } from './types.js';

export interface TokenImageProps {
  pos?: PositionToken;
  rect?: Rect;
  artifact: ImageRef;
  slotId?: SlotId;
  altText?: string;
}

const ZERO_RECT: Rect = { x: 0, y: 0, w: 0, h: 0 };

export const TokenImage = ({
  pos,
  rect,
  artifact,
  slotId,
  altText,
}: TokenImageProps): ReactElement => {
  const resolvedRect: Rect =
    rect !== undefined
      ? rect
      : pos !== undefined
        ? (POSITION_MAP.get(pos) ?? ZERO_RECT)
        : ZERO_RECT;
  return <Image rect={resolvedRect} image={artifact} slotId={slotId} altText={altText} />;
};
