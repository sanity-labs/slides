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
  <Slide className="flex flex-col justify-center gap-4 p-12 bg-fg-base">
    <Box className="flex-none text-display text-6xl text-bg-surface">{title}</Box>
    {subtitle ? (
      <Box className="flex-none text-body text-2xl text-bg-surface">{subtitle}</Box>
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
  // Presentation-grade palette — every color readable from the back of a
  // room on a projector. Token names match `scaffold/template-base` so the
  // canonical SKILL example uses the same vocabulary an agent will see when
  // a real user scaffolds their own template.
  colors: {
    'fg-base': '#0b0b0b',
    'fg-muted': '#4a4a4a',
    'bg-surface': '#ffffff',
    'surface-elevated': '#1a1a1a',
    accent: '#ff5500',
  },
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
