import { CANVAS_16_9, defineTemplate, defineTemplateComponent } from '@sanity-labs/slides';
import { Cover, CoverSchema } from './components/Cover.js';
import { preview } from './preview.js';

export const __IDENT__ = defineTemplate({
  name: '__NAME__',
  canvas: CANVAS_16_9,
  fonts: {
    display: ['Inter', 'Arial'],
    body: ['Inter', 'Arial'],
    mono: ['IBM Plex Mono', 'Courier New'],
  },
  colors: {
    'fg.base': '#0b0b0b',
    'bg.surface': '#ffffff',
  },
  typography: {},
  spacing: { md: 12, lg: 24 },
  components: {
    Cover: defineTemplateComponent({
      component: Cover,
      schema: CoverSchema,
      description: 'Use as the first slide of a deck. Sets the title.',
    }),
  },
  preview,
});
