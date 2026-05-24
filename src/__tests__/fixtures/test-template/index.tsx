/**
 * Minimal brand-free template fixture, used by the framework's own
 * end-to-end tests (smoke, MCP, preview, verify-bins). One slide type
 * (`Cover`), plain colors, no chrome, no embedded raster assets.
 *
 * The richer Sanity-branded template lives in its own repo
 * (`sanity-labs/slides-template`) and consumes `@sanity-labs/slides` as a
 * regular external user — so the framework gets a clean canary AND the
 * brand experience proves the public API end-to-end.
 */

import type { ReactElement } from 'react';
import { z } from 'zod';
import {
  Box,
  CANVAS_16_9,
  defineTemplate,
  defineTemplateComponent,
  Slide,
  Text,
  type Template,
} from '../../../index.js';

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
    <Box rect={{ x: 40, y: 60, w: 880, h: 100 }}>
      <Text textStyle={{ fontFamily: 'display', fontSize: 48, foregroundColor: '#ffffff' }}>
        {title}
      </Text>
    </Box>
    {subtitle ? (
      <Box rect={{ x: 40, y: 180, w: 880, h: 40 }}>
        <Text textStyle={{ fontFamily: 'body', fontSize: 20, foregroundColor: '#cccccc' }}>
          {subtitle}
        </Text>
      </Box>
    ) : null}
  </Slide>
);

export const preview = (): ReactElement => (
  <>
    <Cover title="Test deck" subtitle="Fixture used by the framework's own tests." />
    <Cover title="Second slide" />
  </>
);

export const testTemplate: Template = defineTemplate({
  name: 'test-template',
  canvas: CANVAS_16_9,
  fonts: {
    display: ['Arial', 'Helvetica'],
    body: ['Arial', 'Helvetica'],
    mono: ['Courier New'],
  },
  colors: {},
  typography: {},
  spacing: {},
  components: {
    Cover: defineTemplateComponent({
      component: Cover,
      schema: CoverSchema,
      description: 'Use as the first slide of a deck. Plain title + optional subtitle.',
    }),
  },
  preview,
});
