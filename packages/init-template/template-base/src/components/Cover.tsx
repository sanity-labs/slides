import type { ReactElement } from 'react';
import { Slide, Box, Text } from 'react-pptx';
import { z } from 'zod';

export const CoverSchema = z
  .object({
    title: z.string().min(1).describe('The deck title.'),
    subtitle: z.string().optional().describe('Optional subtitle.'),
  })
  .strict();

type CoverProps = z.infer<typeof CoverSchema>;

export const Cover = ({ title, subtitle }: CoverProps): ReactElement => (
  <Slide>
    <Box rect={{ x: 0, y: 0, w: 960, h: 540 }} fill={{ kind: 'solid', color: '#0b0b0b' }} />
    <Box rect={{ x: 60, y: 200, w: 800, h: 120 }}>
      <Text textStyle={{ fontFamily: 'display', fontSize: 64, foregroundColor: '#ffffff' }}>
        {title}
      </Text>
    </Box>
    {subtitle ? (
      <Box rect={{ x: 60, y: 320, w: 800, h: 40 }}>
        <Text textStyle={{ fontFamily: 'body', fontSize: 20, foregroundColor: '#cccccc' }}>
          {subtitle}
        </Text>
      </Box>
    ) : null}
  </Slide>
);
