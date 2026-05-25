import type { ReactElement } from 'react';
import { Slide, Box } from '@sanity-labs/slides';
import { z } from 'zod';

export const CoverSchema = z
  .object({
    title: z.string().min(1).describe('The deck title.'),
    subtitle: z.string().optional().describe('Optional subtitle.'),
  })
  .strict();

type CoverProps = z.infer<typeof CoverSchema>;

export const Cover = ({ title, subtitle }: CoverProps): ReactElement => (
  <Slide className="flex flex-col justify-center gap-4 p-md bg-fg-base">
    <Box className="flex-none text-display text-6xl text-bg-surface">{title}</Box>
    {subtitle ? (
      <Box className="flex-none text-body text-2xl text-bg-surface">{subtitle}</Box>
    ) : null}
  </Slide>
);
