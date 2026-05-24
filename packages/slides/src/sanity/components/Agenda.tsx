import type { ReactElement } from 'react';
import { type SlotId } from '../../core/index.js';
import { z } from 'zod';
import { BrandSlide, BrandText, COLORS, DottedRule, TopLabel, type Rect } from './brand.js';

const slotIdOrUndefined = (slotPrefix: string | undefined, name: string): SlotId | undefined =>
  slotPrefix === undefined ? undefined : (`${slotPrefix}:${name}` as SlotId);

const AgendaItemSchema = z.object({
  number: z.string().describe('Two-digit agenda number.'),
  title: z.string().min(1).describe('Agenda item title.'),
  bullets: z.array(z.string()).optional().describe('Optional detail bullets.'),
});

export const AgendaSchema = z
  .object({
    variant: z.enum(['simple', 'detailed']).optional().describe('Agenda layout density.'),
    eyebrow: z.string().optional().describe('Top-left label.'),
    slotPrefix: z
      .string()
      .optional()
      .describe(
        'Optional slot prefix for re-fill workflows. Omit unless the caller plans to address this slide by slot later.',
      ),
    items: z.array(AgendaItemSchema).min(1).describe('Agenda rows.'),
  })
  .strict();

type AgendaProps = z.infer<typeof AgendaSchema>;
type AgendaItem = AgendaProps['items'][number];

const detailRowRect = (index: number): Rect => ({ x: 120, y: 94 + index * 124, w: 720, h: 112 });
const simpleRowRect = (index: number): Rect => ({ x: 120, y: 86 + index * 52, w: 720, h: 52 });

const bulletText = (bullets: readonly string[] | undefined): string =>
  (bullets ?? []).map((bullet) => `- ${bullet.toUpperCase()}`).join('\n');

const DetailRow = ({
  item,
  index,
  slotPrefix,
}: {
  readonly item: AgendaItem;
  readonly index: number;
  readonly slotPrefix: string | undefined;
}): ReactElement => {
  const rect = detailRowRect(index);

  return (
    <>
      <DottedRule rect={{ x: rect.x, y: rect.y, w: rect.w, h: 12 }} />
      <BrandText
        rect={{ x: rect.x + 5, y: rect.y + 19, w: 70, h: 50 }}
        size={38}
        color={COLORS.white}
        slotId={slotIdOrUndefined(slotPrefix, `item-${index}-number`)}
      >
        {item.number}
      </BrandText>
      <BrandText
        rect={{ x: rect.x + 122, y: rect.y + 21, w: 570, h: 46 }}
        size={38}
        color={COLORS.white}
        slotId={slotIdOrUndefined(slotPrefix, `item-${index}-title`)}
      >
        {item.title}
      </BrandText>
      <BrandText
        rect={{ x: rect.x + 127, y: rect.y + 73, w: 560, h: 42 }}
        size={11}
        color={COLORS.gray200}
        font="mono"
        slotId={slotIdOrUndefined(slotPrefix, `item-${index}-bullets`)}
      >
        {bulletText(item.bullets)}
      </BrandText>
    </>
  );
};

const SimpleRow = ({
  item,
  index,
  slotPrefix,
}: {
  readonly item: AgendaItem;
  readonly index: number;
  readonly slotPrefix: string | undefined;
}): ReactElement => {
  const rect = simpleRowRect(index);

  return (
    <>
      <DottedRule rect={{ x: rect.x, y: rect.y, w: rect.w, h: 12 }} />
      <BrandText
        rect={{ x: rect.x, y: rect.y + 11, w: 50, h: 22 }}
        size={11}
        color={COLORS.gray200}
        font="mono"
        slotId={slotIdOrUndefined(slotPrefix, `item-${index}-number`)}
      >
        {item.number}
      </BrandText>
      <BrandText
        rect={{ x: rect.x + 122, y: rect.y + 7, w: 560, h: 42 }}
        size={34}
        color={COLORS.white}
        slotId={slotIdOrUndefined(slotPrefix, `item-${index}-title`)}
      >
        {item.title}
      </BrandText>
    </>
  );
};

export const Agenda = ({
  variant = 'simple',
  eyebrow,
  slotPrefix,
  items,
}: AgendaProps): ReactElement => {
  const label = eyebrow ?? (variant === 'detailed' ? 'AGENDA DETAILED' : 'AGENDA');

  return (
    <BrandSlide>
      <TopLabel slotId={slotIdOrUndefined(slotPrefix, 'eyebrow')}>{label}</TopLabel>
      {items.map((item, index) =>
        variant === 'detailed' ? (
          <DetailRow key={index} item={item} index={index} slotPrefix={slotPrefix} />
        ) : (
          <SimpleRow key={index} item={item} index={index} slotPrefix={slotPrefix} />
        ),
      )}
    </BrandSlide>
  );
};
