/**
 * `@sanity-labs/slides/primitives` — token-typed primitive layer.
 *
 * Public barrel for external consumers. Inside this package, prefer direct
 * file imports (`./primitives/box.js`) for tree-shakability per
 * `docs/engineering-standards.md`.
 */

export { TokenBox, type TokenBoxProps } from './box.js';
export { TokenText, type TokenTextProps } from './text.js';
export { TokenImage, type TokenImageProps } from './image.js';
export { Title, type TitleProps } from './title.js';
export { Eyebrow, type EyebrowProps } from './eyebrow.js';
export { Footer, type FooterProps } from './footer.js';
export { Field, type FieldProps } from './field.js';
export { Grid, type GridProps, cellRect } from './grid.js';
export { Stack, type StackProps } from './stack.js';
export type { ColorToken, PositionToken, SpacingToken, TypographyToken } from './types.js';
export {
  colorTokens,
  positionTokens,
  spacingTokens,
  typographyTokens,
  POSITION_MAP,
  SPACING_MAP,
  type Rect,
} from './tokens-extra.js';
