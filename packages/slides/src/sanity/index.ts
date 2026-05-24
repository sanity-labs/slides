/**
 * @sanity-labs/slides — Sanity's brand-locked slide component library.
 *
 * Implements the `Template` interface from `react-pptx`. Provides
 * components, brand tokens (extracted from `@sanity/sanity-id`), texture
 * references, and master template IDs.
 *
 * **Token surface.** Tokens are extracted from `@sanity/sanity-id` at this
 * package's publish time and frozen into `tokens.ts`. The frozen snapshot
 * makes consumers deterministic.
 *
 * **Status:** Eight components ship with the reference-deck visual system:
 * `<Cover/>`, `<Agenda/>`, `<SectionDivider/>`, `<OneColumn/>`,
 * `<TitleAndBody/>`, `<TitleAndGrid/>`, `<Demo/>`, `<Closing/>`.
 * They compose from the token-typed primitive layer and the reference-deck
 * chrome helpers.
 *
 * **Import surface:**
 *   - `@sanity-labs/slides/sanity` — everything in this file (Template, helpers, brand-asset refs)
 */

import { CANVAS_16_9, defineTemplate, defineTemplateComponent } from '../core/index.js';
import { Agenda, AgendaSchema } from './components/Agenda.js';
import { Cover, CoverSchema } from './components/Cover.js';
import { SectionDivider, SectionDividerSchema } from './components/SectionDivider.js';
import { OneColumn, OneColumnSchema } from './components/OneColumn.js';
import { TitleAndBody, TitleAndBodySchema } from './components/TitleAndBody.js';
import { TitleAndGrid, TitleAndGridSchema } from './components/TitleAndGrid.js';
import { Demo, DemoSchema } from './components/Demo.js';
import { Closing, ClosingSchema } from './components/Closing.js';
import { flattenForBrand } from './flatten-for-brand.js';
import { preview } from './preview.js';
import { sanityBrandTokens } from './tokens.js';

/**
 * PPTX font substitution map for the Sanity brand.
 *
 * Pass into `new PptxSlidesRuntime({ fontSubstitution: SANITY_PPTX_FONT_SUBSTITUTION })`.
 * Keys are the literal family names the reconciler emits after role
 * resolution; values are the family names written into the .pptx file. PPTX
 * cannot embed fonts, so viewers without these installed will see their
 * PowerPoint/Slides fallback.
 *
 * Entries:
 *   - Arial/Helvetica (primary exported deck metrics) — identity pass
 *   - Geist (brand primary when installed) — identity pass
 *   - Waldenburg (pre-Geist legacy snapshot) — remap forward to Geist
 *   - IBM Plex Mono (brand mono) — identity pass
 *   - Courier New, Inter, Roboto — system fallbacks, identity pass
 */
export const SANITY_PPTX_FONT_SUBSTITUTION: Readonly<Record<string, string>> = Object.freeze({
  Geist: 'Geist',
  Waldenburg: 'Geist',
  Inter: 'Inter',
  'IBM Plex Mono': 'IBM Plex Mono',
  Arial: 'Arial',
  Helvetica: 'Helvetica',
  'Courier New': 'Courier New',
  Roboto: 'Roboto',
});

export const sanity = defineTemplate({
  name: 'sanity',
  canvas: CANVAS_16_9,
  fonts: {
    // Use an installed system family first so browser preview and exported
    // PPTX resolve to the same metrics. PPTX cannot embed Geist, so keeping
    // it first caused renderer-specific fallbacks and different text wraps.
    display: ['Arial', 'Helvetica', 'Geist', 'Inter'],
    body: ['Arial', 'Helvetica', 'Geist', 'Inter'],
    mono: ['IBM Plex Mono', 'Courier New'],
  },
  ...flattenForBrand(sanityBrandTokens),
  components: {
    Cover: defineTemplateComponent({
      component: Cover,
      schema: CoverSchema,
      description:
        'Use as the first slide. Full-bleed black with large white title, optional subtitle, Sanity lockup, and fixed deck footer chrome.',
    }),
    Agenda: defineTemplateComponent({
      component: Agenda,
      schema: AgendaSchema,
      description:
        'Use for agenda slides. Simple mode is a dense numbered list; detailed mode adds mono bullet notes under each section.',
    }),
    SectionDivider: defineTemplateComponent({
      component: SectionDivider,
      schema: SectionDividerSchema,
      description:
        'Use to mark a major section break in a deck. Orange-red and blue match the reference section slides; dot-grid keeps a quieter black texture variant.',
    }),
    OneColumn: defineTemplateComponent({
      component: OneColumn,
      schema: OneColumnSchema,
      description:
        'Use for a focused single-column body slide with dark canvas, white title, mono body eyebrow, dot-grid texture, and Sanity chrome.',
    }),
    TitleAndBody: defineTemplateComponent({
      component: TitleAndBody,
      schema: TitleAndBodySchema,
      description:
        'Use when a single body paragraph deserves the whole canvas. Dark canvas, large white title, mono body eyebrow, and Sanity chrome.',
    }),
    TitleAndGrid: defineTemplateComponent({
      component: TitleAndGrid,
      schema: TitleAndGridSchema,
      description:
        'Use to compare parallel ideas. Dark canvas with dotted separators, mono labels, white body copy, optional dot-grid texture for 3-column feature slides, and row mode when cols=1.',
    }),
    Demo: defineTemplateComponent({
      component: Demo,
      schema: DemoSchema,
      description:
        'Use as a live demo placeholder: full dark dot-grid field with a centered [ DEMO ] label and Sanity chrome.',
    }),
    Closing: defineTemplateComponent({
      component: Closing,
      schema: ClosingSchema,
      description:
        'Use as the LAST slide of a deck. Full-bleed Sanity OrangeRed canvas, oversized black Sanity mark, QnA title, thank-you label, and black lockup.',
    }),
  },
  preview,
});

// Brand chrome helpers — callers can compose new slide types without
// re-deriving the canvas constants, tone palette, or footer chrome.
export {
  BRAND_IMAGES,
  Background,
  BrandSlide,
  BrandText,
  CANVAS,
  COLORS,
  Chrome,
  DotGrid,
  DottedRule,
  Label,
  TopLabel,
  type BrandSlideProps,
  type BrandTextProps,
  type BrandTone,
  type ChromeProps,
  type Rect,
} from './components/brand.js';

// Slide components are exported individually so consumers can compose them
// inside their own tree (e.g. a custom preview, a programmatic deck).
export {
  Agenda,
  AgendaSchema,
  Closing,
  ClosingSchema,
  Cover,
  CoverSchema,
  Demo,
  DemoSchema,
  OneColumn,
  OneColumnSchema,
  SectionDivider,
  SectionDividerSchema,
  TitleAndBody,
  TitleAndBodySchema,
  TitleAndGrid,
  TitleAndGridSchema,
};
