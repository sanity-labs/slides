import type { ReactElement } from 'react';
import { Image } from 'react-pptx';
import { z } from 'zod';
import { BRAND_IMAGES, BrandSlide, BrandText, COLORS, TopLabel } from './brand.js';

export const ClosingSchema = z
  .object({
    slideNumber: z
      .string()
      .optional()
      .describe('Optional slide number / sequence label in the lower-right.'),
    title: z.string().optional().describe('Closing title. Defaults to QnA.'),
    eyebrow: z.string().optional().describe('Top-left closing label. Defaults to THANK YOU.'),
  })
  .strict();

type ClosingProps = z.infer<typeof ClosingSchema>;

export const Closing = ({
  slideNumber,
  title = 'QnA',
  eyebrow = 'THANK YOU',
}: ClosingProps): ReactElement => (
  <BrandSlide tone="brand" lockup footer={null}>
    <Image
      rect={{ x: 240, y: 0, w: 720, h: 540 }}
      image={BRAND_IMAGES.closingMark}
      altText="Sanity mark"
    />
    <TopLabel tone="brand" slotId="closing:eyebrow">
      {eyebrow}
    </TopLabel>
    <BrandText
      rect={{ x: 24, y: 205, w: 300, h: 90 }}
      size={66}
      color={COLORS.black}
      slotId="closing:title"
    >
      {title}
    </BrandText>
    {slideNumber === undefined ? null : (
      <BrandText
        rect={{ x: 826, y: 497, w: 110, h: 16 }}
        size={10}
        color={COLORS.black}
        font="mono"
        align="END"
        slotId="closing:slide-number"
      >
        {slideNumber}
      </BrandText>
    )}
  </BrandSlide>
);
