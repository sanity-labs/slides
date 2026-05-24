import type { ReactElement } from 'react';
import { z } from 'zod';
import { BrandSlide, BrandText, COLORS, TopLabel } from './brand.js';

export const CoverSchema = z
  .object({
    title: z.string().min(1).describe('The deck title. Big, prominent.'),
    subtitle: z.string().optional().describe('Optional subtitle / tagline below title.'),
    eyebrow: z
      .string()
      .optional()
      .describe('Optional small label above the title. Defaults to EYEBROW.'),
  })
  .strict();

type CoverProps = z.infer<typeof CoverSchema>;

export const Cover = ({ title, subtitle, eyebrow = 'EYEBROW' }: CoverProps): ReactElement => (
  <BrandSlide lockup>
    <TopLabel slotId="cover:eyebrow">{eyebrow}</TopLabel>
    <BrandText
      rect={{ x: 24, y: 56, w: 700, h: 146 }}
      size={66}
      color={COLORS.white}
      lineSpacing={1.05}
      slotId="cover:title"
    >
      {title}
    </BrandText>
    {subtitle === undefined ? null : (
      <BrandText
        rect={{ x: 64, y: 226, w: 430, h: 96 }}
        size={24}
        color={COLORS.white}
        font="body"
        lineSpacing={1.24}
        slotId="cover:subtitle"
      >
        {subtitle}
      </BrandText>
    )}
  </BrandSlide>
);
