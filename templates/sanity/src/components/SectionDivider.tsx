import type { ReactElement } from 'react';
import { type SlotId } from 'react-pptx';
import { z } from 'zod';
import { BrandSlide, BrandText, COLORS, DotGrid, TopLabel } from './brand.js';

export const SectionDividerSchema = z
  .object({
    variant: z
      .enum(['orange-red', 'blue', 'dot-grid'])
      .describe('Visual variant. Picks the divider style.'),
    title: z.string().min(1).describe('The section title.'),
    eyebrow: z.string().optional().describe('Optional small label above the title.'),
    slotPrefix: z
      .string()
      .optional()
      .describe(
        'Optional slot prefix for re-fill workflows. Omit unless the caller plans to address this slide by slot later; deck-wide slot IDs must be unique, and omitting this skips slot tracking entirely.',
      ),
  })
  .strict();

type SectionDividerProps = z.infer<typeof SectionDividerSchema>;

const toneForVariant = (variant: SectionDividerProps['variant']): 'brand' | 'blue' | 'dark' => {
  if (variant === 'orange-red') return 'brand';
  if (variant === 'blue') return 'blue';
  return 'dark';
};

export const SectionDivider = ({
  variant,
  title,
  eyebrow,
  slotPrefix,
}: SectionDividerProps): ReactElement => {
  const tone = toneForVariant(variant);
  const foreground = tone === 'dark' ? COLORS.white : COLORS.black;
  const slot = (name: string): SlotId | undefined =>
    slotPrefix === undefined ? undefined : (`${slotPrefix}:${name}` as SlotId);

  return (
    <BrandSlide tone={tone}>
      {variant === 'dot-grid' ? <DotGrid rect={{ x: 24, y: 44, w: 900, h: 390 }} /> : null}
      {eyebrow === undefined ? null : (
        <TopLabel tone={tone} slotId={slot('eyebrow')}>
          {eyebrow}
        </TopLabel>
      )}
      <BrandText
        rect={{ x: 24, y: 58, w: 780, h: 150 }}
        size={60}
        color={foreground}
        lineSpacing={1.05}
        slotId={slot('title')}
      >
        {title}
      </BrandText>
    </BrandSlide>
  );
};
