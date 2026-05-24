import type { ReactElement } from 'react';
import { z } from 'zod';
import { BrandSlide, BrandText, COLORS, DotGrid, Label, TopLabel } from './brand.js';

export const OneColumnSchema = z
  .object({
    title: z.string().min(1).describe('The slide title.'),
    eyebrow: z.string().optional().describe('Optional small label above the title.'),
    bodyEyebrow: z.string().optional().describe('Optional small label above the body.'),
    body: z.string().min(1).describe('The main body text.'),
    footer: z.string().optional().describe('Optional bottom-right footer text.'),
  })
  .strict();

type OneColumnProps = z.infer<typeof OneColumnSchema>;

export const OneColumn = ({
  title,
  eyebrow = 'EYEBROW',
  bodyEyebrow = 'SUBTITLE',
  body,
  footer,
}: OneColumnProps): ReactElement => (
  <BrandSlide footer={footer}>
    <TopLabel slotId="one-column:eyebrow">{eyebrow}</TopLabel>
    <BrandText
      rect={{ x: 24, y: 54, w: 760, h: 74 }}
      size={44}
      color={COLORS.white}
      lineSpacing={1.05}
      slotId="one-column:title"
    >
      {title}
    </BrandText>
    <Label rect={{ x: 106, y: 134, w: 330, h: 20 }} slotId="one-column:body-eyebrow">
      {bodyEyebrow}
    </Label>
    <BrandText
      rect={{ x: 106, y: 155, w: 330, h: 66 }}
      size={16}
      color={COLORS.white}
      font="body"
      lineSpacing={1.28}
      slotId="one-column:body"
    >
      {body}
    </BrandText>
    <DotGrid rect={{ x: 106, y: 218, w: 330, h: 235 }} />
  </BrandSlide>
);
