import type { ReactElement } from 'react';
import { Box } from 'react-pptx';
import { z } from 'zod';
import { BrandSlide, BrandText, COLORS, DotGrid, TopLabel } from './brand.js';

export const DemoSchema = z
  .object({
    eyebrow: z.string().optional().describe('Top-left label.'),
    label: z.string().optional().describe('Centered demo placeholder label.'),
  })
  .strict();

type DemoProps = z.infer<typeof DemoSchema>;

export const Demo = ({ eyebrow = 'EYEBROW', label = '[ DEMO ]' }: DemoProps): ReactElement => (
  <BrandSlide>
    <TopLabel slotId="demo:eyebrow">{eyebrow}</TopLabel>
    <DotGrid rect={{ x: 24, y: 44, w: 900, h: 430 }} />
    <Box rect={{ x: 326, y: 184, w: 340, h: 150 }} fill={{ kind: 'solid', color: COLORS.black }} />
    <BrandText
      rect={{ x: 326, y: 259, w: 340, h: 20 }}
      size={13}
      color={COLORS.gray200}
      font="mono"
      align="CENTER"
      slotId="demo:label"
    >
      {label}
    </BrandText>
  </BrandSlide>
);
