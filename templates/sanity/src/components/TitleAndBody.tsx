import type { ReactElement } from 'react';
import { z } from 'zod';
import { BrandSlide, BrandText, COLORS, Label, TopLabel } from './brand.js';

export const TitleAndBodySchema = z
  .object({
    title: z.string().min(1).describe('The slide title.'),
    eyebrow: z.string().optional().describe('Optional small label above the title.'),
    bodyEyebrow: z.string().optional().describe('Optional small label above the body.'),
    body: z.string().min(1).describe('The main body text.'),
    footer: z.string().optional().describe('Optional bottom-right footer text.'),
  })
  .strict();

type TitleAndBodyProps = z.infer<typeof TitleAndBodySchema>;

export const TitleAndBody = ({
  title,
  eyebrow = 'EYEBROW',
  bodyEyebrow = 'SUBTITLE',
  body,
  footer,
}: TitleAndBodyProps): ReactElement => (
  <BrandSlide footer={footer}>
    <TopLabel slotId="title-and-body:eyebrow">{eyebrow}</TopLabel>
    <BrandText
      rect={{ x: 24, y: 54, w: 760, h: 74 }}
      size={44}
      color={COLORS.white}
      lineSpacing={1.05}
      slotId="title-and-body:title"
    >
      {title}
    </BrandText>
    <Label rect={{ x: 137, y: 149, w: 285, h: 20 }} slotId="title-and-body:body-eyebrow">
      {bodyEyebrow}
    </Label>
    <BrandText
      rect={{ x: 137, y: 172, w: 330, h: 95 }}
      size={18}
      color={COLORS.white}
      font="body"
      lineSpacing={1.28}
      slotId="title-and-body:body"
    >
      {body}
    </BrandText>
  </BrandSlide>
);
