import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CANVAS_16_9, defineTemplate, defineTemplateComponent } from '@sanity-labs/slides';
import { Cover, CoverSchema } from './components/Cover.js';
import { preview } from './preview.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const skill = readFileSync(resolve(HERE, 'SKILL.md'), 'utf8');

export const __IDENT__ = defineTemplate({
  name: '__NAME__',
  canvas: CANVAS_16_9,
  fonts: {
    display: ['Inter', 'Arial'],
    body: ['Inter', 'Arial'],
    mono: ['IBM Plex Mono', 'Courier New'],
  },
  // Presentation-grade palette — every color stays legible on a projector
  // at back-of-room distance. Avoid soft web-UI grays (#cccccc-ish) for body
  // text — they vanish above ~6m viewing distance.
  colors: {
    'fg-base': '#0b0b0b',
    'fg-muted': '#4a4a4a',
    'bg-surface': '#ffffff',
    'surface-elevated': '#1a1a1a',
    accent: '#ff5500',
  },
  typography: {},
  spacing: { sm: 8, md: 16, lg: 32 },
  components: {
    Cover: defineTemplateComponent({
      component: Cover,
      schema: CoverSchema,
      description: 'Use as the first slide of a deck. Sets the title.',
    }),
  },
  preview,
  skill,
});
