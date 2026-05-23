/**
 * `<TokenText/>` — token-keyed styled text run.
 *
 * Wraps the substrate `<Text/>` with token-keyed typography size + color.
 * Always renders inside a `<Box>` (parent boundary handles position/slot);
 * this primitive only carries text style.
 */

import type { ReactElement, ReactNode } from 'react';
import { Text } from 'react-pptx';
import { resolveColor, resolveTypography } from './resolve.js';
import type { ColorToken, TypographyToken } from './types.js';

export interface TokenTextProps {
  /** Typography token name. */
  size: TypographyToken;
  /** Optional foreground color, token-keyed. */
  color?: ColorToken;
  /** Text content. */
  children?: ReactNode;
}

export const TokenText = ({ size, color, children }: TokenTextProps): ReactElement => {
  const baseStyle = resolveTypography(size);
  const style =
    color !== undefined ? { ...baseStyle, foregroundColor: resolveColor(color) } : baseStyle;
  return <Text textStyle={style}>{children}</Text>;
};
