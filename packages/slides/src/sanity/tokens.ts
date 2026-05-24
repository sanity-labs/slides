/**
 * GENERATED FILE — do not edit by hand.
 *
 * Source: `@sanity/sanity-id` snapshot at `vendor/sanity-id/`.
 * Regenerate with `pnpm extract` after bumping the snapshot.
 *
 * Drift entries: 4. See `drift-report.md` for resolutions.
 */

import type {
  BrandTokens,
  PrimitiveColor,
  RadiusToken,
  SemanticColor,
  SpacingToken,
  TextureToken,
  TypographyStyle,
} from './tokens/types.js';

export const primitiveColors: ReadonlyArray<PrimitiveColor> = [
  {
    name: 'black',
    hex: '#0b0b0b',
  },
  {
    name: 'white',
    hex: '#ffffff',
  },
  {
    name: 'brand',
    hex: '#ff5500',
    p3: 'color(display-p3 1 0.3333 0)',
  },
  {
    name: 'gray-100',
    hex: '#ededed',
  },
  {
    name: 'gray-200',
    hex: '#d6d6d6',
  },
  {
    name: 'gray-300',
    hex: '#b9b9b9',
  },
  {
    name: 'gray-500',
    hex: '#797979',
  },
  {
    name: 'gray-700',
    hex: '#4a4a4a',
  },
  {
    name: 'gray-800',
    hex: '#353535',
  },
  {
    name: 'gray-900',
    hex: '#212121',
  },
  {
    name: 'blue-100',
    hex: '#afe3ff',
  },
  {
    name: 'blue-300',
    hex: '#55beff',
  },
  {
    name: 'blue-500',
    hex: '#027fff',
    p3: 'color(display-p3 0.007843 0.498039 1 / 1)',
  },
  {
    name: 'blue-700',
    hex: '#0052ef',
  },
  {
    name: 'green-100',
    hex: '#96ff6f',
  },
  {
    name: 'green-300',
    hex: '#45ff00',
  },
  {
    name: 'green-500',
    hex: '#3fea00',
    p3: 'color(display-p3 0.270588 1 0 / 1)',
  },
  {
    name: 'green-700',
    hex: '#19d600',
  },
  {
    name: 'magenta-100',
    hex: '#fcb9ff',
  },
  {
    name: 'magenta-300',
    hex: '#fa84ff',
  },
  {
    name: 'magenta-500',
    hex: '#f84eff',
    p3: 'color(display-p3 0.960784 0 1 / 1)',
  },
  {
    name: 'magenta-700',
    hex: '#f500ff',
  },
  {
    name: 'yellow-100',
    hex: '#fcffd6',
  },
  {
    name: 'yellow-300',
    hex: '#ffff9f',
  },
  {
    name: 'yellow-500',
    hex: '#ffff00',
    p3: 'color(display-p3 1 1 0 / 1)',
  },
  {
    name: 'yellow-700',
    hex: '#fff500',
  },
];

export const semanticColors: ReadonlyArray<SemanticColor> = [
  {
    name: 'fg-base',
    light: '#0b0b0b',
    dark: '#ffffff',
  },
  {
    name: 'fg-dim',
    light: '#4a4a4a',
    dark: '#b9b9b9',
  },
  {
    name: 'fg-faint',
    light: '#797979',
    dark: '#797979',
  },
  {
    name: 'fg-inverse-base',
    light: '#ffffff',
    dark: '#0b0b0b',
  },
  {
    name: 'fg-inverse-dim',
    light: '#b9b9b9',
    dark: '#4a4a4a',
  },
  {
    name: 'fg-inverse-faint',
    light: '#797979',
    dark: '#797979',
  },
  {
    name: 'fg-accent-blue',
    light: '#027fff',
    dark: '#027fff',
  },
  {
    name: 'fg-accent-green',
    light: '#3fea00',
    dark: '#3fea00',
  },
  {
    name: 'fg-accent-magenta',
    light: '#f84eff',
    dark: '#f84eff',
  },
  {
    name: 'fg-accent-yellow',
    light: '#ffff00',
    dark: '#ffff00',
  },
  {
    name: 'bg-base',
    light: '#ffffff',
    dark: '#0b0b0b',
  },
  {
    name: 'bg-dim',
    light: '#ededed',
    dark: '#212121',
  },
  {
    name: 'bg-inverse-base',
    light: '#0b0b0b',
    dark: '#ffffff',
  },
  {
    name: 'bg-inverse-dim',
    light: '#212121',
    dark: '#ededed',
  },
  {
    name: 'bg-accent-blue-base',
    light: '#027fff',
    dark: '#027fff',
  },
  {
    name: 'bg-accent-blue-dim',
    light: '#afe3ff',
    dark: '#0052ef',
  },
  {
    name: 'bg-accent-green-base',
    light: '#3fea00',
    dark: '#3fea00',
  },
  {
    name: 'bg-accent-green-dim',
    light: '#96ff6f',
    dark: '#19d600',
  },
  {
    name: 'bg-accent-magenta-base',
    light: '#f84eff',
    dark: '#f84eff',
  },
  {
    name: 'bg-accent-magenta-dim',
    light: '#fcb9ff',
    dark: '#f500ff',
  },
  {
    name: 'bg-accent-yellow-base',
    light: '#ffff00',
    dark: '#ffff00',
  },
  {
    name: 'bg-accent-yellow-dim',
    light: '#fcffd6',
    dark: '#fff500',
  },
  {
    name: 'border-base',
    light: '#0b0b0b',
    dark: '#ffffff',
  },
  {
    name: 'border-dim',
    light: '#d6d6d6',
    dark: '#353535',
  },
  {
    name: 'border-faint',
    light: '#ededed',
    dark: '#212121',
  },
  {
    name: 'border-inverse-base',
    light: '#ffffff',
    dark: '#0b0b0b',
  },
  {
    name: 'border-accent-blue',
    light: '#0052ef',
    dark: '#027fff',
  },
  {
    name: 'border-accent-green',
    light: '#19d600',
    dark: '#3fea00',
  },
  {
    name: 'border-accent-magenta',
    light: '#f500ff',
    dark: '#f84eff',
  },
  {
    name: 'border-accent-yellow',
    light: '#fff500',
    dark: '#ffff00',
  },
  {
    name: 'focus-ring',
    light: '#0b0b0b',
    dark: '#ffffff',
  },
  {
    name: 'fg-error',
    light: '#dd0000',
    dark: '#ff2222',
  },
];

export const spacing: ReadonlyArray<SpacingToken> = [
  {
    name: 'spacing-icon-lg',
    raw: 'calc((25 / 16) * 1rem)',
    rem: 1.5625,
    px: 25,
  },
  {
    name: 'spacing-icon-md',
    raw: 'calc((21 / 16) * 1rem)',
    rem: 1.3125,
    px: 21,
  },
  {
    name: 'spacing-icon-sm',
    raw: 'calc((19 / 16) * 1rem)',
    rem: 1.1875,
    px: 19,
  },
  {
    name: 'spacing-widget-xs',
    raw: 'calc((19 / 16) * 1rem)',
    rem: 1.1875,
    px: 19,
  },
  {
    name: 'spacing-widget-sm',
    raw: 'calc((25 / 16) * 1rem)',
    rem: 1.5625,
    px: 25,
  },
  {
    name: 'spacing-widget-md',
    raw: 'calc((35 / 16) * 1rem)',
    rem: 2.1875,
    px: 35,
  },
  {
    name: 'spacing-widget-lg',
    raw: 'calc((45 / 16) * 1rem)',
    rem: 2.8125,
    px: 45,
  },
  {
    name: 'spacing-widget-xl',
    raw: 'calc((73 / 16) * 1rem)',
    rem: 4.5625,
    px: 73,
  },
  {
    name: 'spacing-0',
    raw: '0rem',
    rem: 0,
    px: 0,
  },
  {
    name: 'spacing-2',
    raw: '0.125rem',
    rem: 0.125,
    px: 2,
  },
  {
    name: 'spacing-4',
    raw: '0.25rem',
    rem: 0.25,
    px: 4,
  },
  {
    name: 'spacing-6',
    raw: '0.375rem',
    rem: 0.375,
    px: 6,
  },
  {
    name: 'spacing-8',
    raw: '0.5rem',
    rem: 0.5,
    px: 8,
  },
  {
    name: 'spacing-12',
    raw: '0.75rem',
    rem: 0.75,
    px: 12,
  },
  {
    name: 'spacing-16',
    raw: '1rem',
    rem: 1,
    px: 16,
  },
  {
    name: 'spacing-20',
    raw: '1.125rem',
    rem: 1.125,
    px: 18,
  },
  {
    name: 'spacing-24',
    raw: '1.51rem',
    rem: 1.51,
    px: 24.16,
  },
  {
    name: 'spacing-32',
    raw: '2rem',
    rem: 2,
    px: 32,
  },
  {
    name: 'spacing-40',
    raw: '2.5rem',
    rem: 2.5,
    px: 40,
  },
  {
    name: 'spacing-48',
    raw: '3rem',
    rem: 3,
    px: 48,
  },
  {
    name: 'spacing-64',
    raw: '4rem',
    rem: 4,
    px: 64,
  },
  {
    name: 'spacing-80',
    raw: '5rem',
    rem: 5,
    px: 80,
  },
  {
    name: 'spacing-96',
    raw: '6rem',
    rem: 6,
    px: 96,
  },
  {
    name: 'spacing-128',
    raw: '8rem',
    rem: 8,
    px: 128,
  },
];

export const radii: ReadonlyArray<RadiusToken> = [
  {
    name: 'radius-none',
    raw: '0',
  },
  {
    name: 'radius-full',
    raw: '99999px',
  },
];

export const textures: ReadonlyArray<TextureToken> = [
  {
    pattern: 'lines-horizontal',
    size: 'small',
    theme: 'light',
    url: 'https://www.sanity.io/sanity-id/textures/lines-horizontal-small-light.svg',
  },
  {
    pattern: 'lines-horizontal',
    size: 'small',
    theme: 'dark',
    url: 'https://www.sanity.io/sanity-id/textures/lines-horizontal-small-dark.svg',
  },
  {
    pattern: 'lines-horizontal',
    size: 'medium',
    theme: 'light',
    url: 'https://www.sanity.io/sanity-id/textures/lines-horizontal-medium-light.svg',
  },
  {
    pattern: 'lines-horizontal',
    size: 'medium',
    theme: 'dark',
    url: 'https://www.sanity.io/sanity-id/textures/lines-horizontal-medium-dark.svg',
  },
  {
    pattern: 'lines-horizontal',
    size: 'large',
    theme: 'light',
    url: 'https://www.sanity.io/sanity-id/textures/lines-horizontal-large-light.svg',
  },
  {
    pattern: 'lines-horizontal',
    size: 'large',
    theme: 'dark',
    url: 'https://www.sanity.io/sanity-id/textures/lines-horizontal-large-dark.svg',
  },
  {
    pattern: 'lines-grid',
    size: 'small',
    theme: 'light',
    url: 'https://www.sanity.io/sanity-id/textures/lines-grid-small-light.svg',
  },
  {
    pattern: 'lines-grid',
    size: 'small',
    theme: 'dark',
    url: 'https://www.sanity.io/sanity-id/textures/lines-grid-small-dark.svg',
  },
  {
    pattern: 'lines-grid',
    size: 'medium',
    theme: 'light',
    url: 'https://www.sanity.io/sanity-id/textures/lines-grid-medium-light.svg',
  },
  {
    pattern: 'lines-grid',
    size: 'medium',
    theme: 'dark',
    url: 'https://www.sanity.io/sanity-id/textures/lines-grid-medium-dark.svg',
  },
  {
    pattern: 'lines-grid',
    size: 'large',
    theme: 'light',
    url: 'https://www.sanity.io/sanity-id/textures/lines-grid-large-light.svg',
  },
  {
    pattern: 'lines-grid',
    size: 'large',
    theme: 'dark',
    url: 'https://www.sanity.io/sanity-id/textures/lines-grid-large-dark.svg',
  },
  {
    pattern: 'dots-hex',
    density: 'spread',
    size: 'small',
    theme: 'light',
    url: 'https://www.sanity.io/sanity-id/textures/dots-hex-spread-small-light.svg',
  },
  {
    pattern: 'dots-hex',
    density: 'spread',
    size: 'small',
    theme: 'dark',
    url: 'https://www.sanity.io/sanity-id/textures/dots-hex-spread-small-dark.svg',
  },
  {
    pattern: 'dots-hex',
    density: 'spread',
    size: 'medium',
    theme: 'light',
    url: 'https://www.sanity.io/sanity-id/textures/dots-hex-spread-medium-light.svg',
  },
  {
    pattern: 'dots-hex',
    density: 'spread',
    size: 'medium',
    theme: 'dark',
    url: 'https://www.sanity.io/sanity-id/textures/dots-hex-spread-medium-dark.svg',
  },
  {
    pattern: 'dots-hex',
    density: 'spread',
    size: 'large',
    theme: 'light',
    url: 'https://www.sanity.io/sanity-id/textures/dots-hex-spread-large-light.svg',
  },
  {
    pattern: 'dots-hex',
    density: 'spread',
    size: 'large',
    theme: 'dark',
    url: 'https://www.sanity.io/sanity-id/textures/dots-hex-spread-large-dark.svg',
  },
  {
    pattern: 'dots-hex',
    density: 'dense',
    size: 'small',
    theme: 'light',
    url: 'https://www.sanity.io/sanity-id/textures/dots-hex-dense-small-light.svg',
  },
  {
    pattern: 'dots-hex',
    density: 'dense',
    size: 'small',
    theme: 'dark',
    url: 'https://www.sanity.io/sanity-id/textures/dots-hex-dense-small-dark.svg',
  },
  {
    pattern: 'dots-hex',
    density: 'dense',
    size: 'medium',
    theme: 'light',
    url: 'https://www.sanity.io/sanity-id/textures/dots-hex-dense-medium-light.svg',
  },
  {
    pattern: 'dots-hex',
    density: 'dense',
    size: 'medium',
    theme: 'dark',
    url: 'https://www.sanity.io/sanity-id/textures/dots-hex-dense-medium-dark.svg',
  },
  {
    pattern: 'dots-hex',
    density: 'dense',
    size: 'large',
    theme: 'light',
    url: 'https://www.sanity.io/sanity-id/textures/dots-hex-dense-large-light.svg',
  },
  {
    pattern: 'dots-hex',
    density: 'dense',
    size: 'large',
    theme: 'dark',
    url: 'https://www.sanity.io/sanity-id/textures/dots-hex-dense-large-dark.svg',
  },
  {
    pattern: 'dots-hex',
    density: 'base',
    size: 'small',
    theme: 'light',
    url: 'https://www.sanity.io/sanity-id/textures/dots-hex-base-small-light.svg',
  },
  {
    pattern: 'dots-hex',
    density: 'base',
    size: 'small',
    theme: 'dark',
    url: 'https://www.sanity.io/sanity-id/textures/dots-hex-base-small-dark.svg',
  },
  {
    pattern: 'dots-hex',
    density: 'base',
    size: 'medium',
    theme: 'light',
    url: 'https://www.sanity.io/sanity-id/textures/dots-hex-base-medium-light.svg',
  },
  {
    pattern: 'dots-hex',
    density: 'base',
    size: 'medium',
    theme: 'dark',
    url: 'https://www.sanity.io/sanity-id/textures/dots-hex-base-medium-dark.svg',
  },
  {
    pattern: 'dots-hex',
    density: 'base',
    size: 'large',
    theme: 'light',
    url: 'https://www.sanity.io/sanity-id/textures/dots-hex-base-large-light.svg',
  },
  {
    pattern: 'dots-hex',
    density: 'base',
    size: 'large',
    theme: 'dark',
    url: 'https://www.sanity.io/sanity-id/textures/dots-hex-base-large-dark.svg',
  },
  {
    pattern: 'dots-grid',
    density: 'spread',
    size: 'small',
    theme: 'light',
    url: 'https://www.sanity.io/sanity-id/textures/dots-grid-spread-small-light.svg',
  },
  {
    pattern: 'dots-grid',
    density: 'spread',
    size: 'small',
    theme: 'dark',
    url: 'https://www.sanity.io/sanity-id/textures/dots-grid-spread-small-dark.svg',
  },
  {
    pattern: 'dots-grid',
    density: 'spread',
    size: 'medium',
    theme: 'light',
    url: 'https://www.sanity.io/sanity-id/textures/dots-grid-spread-medium-light.svg',
  },
  {
    pattern: 'dots-grid',
    density: 'spread',
    size: 'medium',
    theme: 'dark',
    url: 'https://www.sanity.io/sanity-id/textures/dots-grid-spread-medium-dark.svg',
  },
  {
    pattern: 'dots-grid',
    density: 'spread',
    size: 'large',
    theme: 'light',
    url: 'https://www.sanity.io/sanity-id/textures/dots-grid-spread-large-light.svg',
  },
  {
    pattern: 'dots-grid',
    density: 'spread',
    size: 'large',
    theme: 'dark',
    url: 'https://www.sanity.io/sanity-id/textures/dots-grid-spread-large-dark.svg',
  },
  {
    pattern: 'dots-grid',
    density: 'dense',
    size: 'small',
    theme: 'light',
    url: 'https://www.sanity.io/sanity-id/textures/dots-grid-dense-small-light.svg',
  },
  {
    pattern: 'dots-grid',
    density: 'dense',
    size: 'small',
    theme: 'dark',
    url: 'https://www.sanity.io/sanity-id/textures/dots-grid-dense-small-dark.svg',
  },
  {
    pattern: 'dots-grid',
    density: 'dense',
    size: 'medium',
    theme: 'light',
    url: 'https://www.sanity.io/sanity-id/textures/dots-grid-dense-medium-light.svg',
  },
  {
    pattern: 'dots-grid',
    density: 'dense',
    size: 'medium',
    theme: 'dark',
    url: 'https://www.sanity.io/sanity-id/textures/dots-grid-dense-medium-dark.svg',
  },
  {
    pattern: 'dots-grid',
    density: 'dense',
    size: 'large',
    theme: 'light',
    url: 'https://www.sanity.io/sanity-id/textures/dots-grid-dense-large-light.svg',
  },
  {
    pattern: 'dots-grid',
    density: 'dense',
    size: 'large',
    theme: 'dark',
    url: 'https://www.sanity.io/sanity-id/textures/dots-grid-dense-large-dark.svg',
  },
  {
    pattern: 'dots-grid',
    density: 'base',
    size: 'small',
    theme: 'light',
    url: 'https://www.sanity.io/sanity-id/textures/dots-grid-base-small-light.svg',
  },
  {
    pattern: 'dots-grid',
    density: 'base',
    size: 'small',
    theme: 'dark',
    url: 'https://www.sanity.io/sanity-id/textures/dots-grid-base-small-dark.svg',
  },
  {
    pattern: 'dots-grid',
    density: 'base',
    size: 'medium',
    theme: 'light',
    url: 'https://www.sanity.io/sanity-id/textures/dots-grid-base-medium-light.svg',
  },
  {
    pattern: 'dots-grid',
    density: 'base',
    size: 'medium',
    theme: 'dark',
    url: 'https://www.sanity.io/sanity-id/textures/dots-grid-base-medium-dark.svg',
  },
  {
    pattern: 'dots-grid',
    density: 'base',
    size: 'large',
    theme: 'light',
    url: 'https://www.sanity.io/sanity-id/textures/dots-grid-base-large-light.svg',
  },
  {
    pattern: 'dots-grid',
    density: 'base',
    size: 'large',
    theme: 'dark',
    url: 'https://www.sanity.io/sanity-id/textures/dots-grid-base-large-dark.svg',
  },
];

export const typography: ReadonlyArray<TypographyStyle> = [
  {
    name: 'text-page-heading-xl',
    fontSizeRem: 4.5,
    fontSizePx: 72,
    fontFamily: 'var(--font-sans)',
    fontFeatureSettings: 'var(--sanity-id-heading-font-features)',
    fontWeight: 400,
    letterSpacing: '-0.04em',
    lineHeight: '1.05',
    variants: {
      'screen-md': {
        fontSizeRem: 3.75,
        fontSizePx: 60,
      },
      'screen-lg': {
        fontSizeRem: 4.5,
        fontSizePx: 72,
      },
    },
  },
  {
    name: 'text-page-heading-lg',
    fontSizeRem: 3.75,
    fontSizePx: 60,
    fontFamily: 'var(--font-sans)',
    fontFeatureSettings: 'var(--sanity-id-heading-font-features)',
    fontWeight: 400,
    letterSpacing: '-0.04em',
    lineHeight: '1.05',
    variants: {
      'screen-md': {
        fontSizeRem: 3.75,
        fontSizePx: 60,
      },
    },
  },
  {
    name: 'text-page-heading-md',
    fontSizeRem: 3,
    fontSizePx: 48,
    fontFamily: 'var(--font-sans)',
    fontFeatureSettings: 'var(--sanity-id-heading-font-features)',
    fontWeight: 400,
    letterSpacing: '-0.035em',
    lineHeight: '1.08',
    variants: {
      'screen-md': {
        fontSizeRem: 3,
        fontSizePx: 48,
      },
    },
  },
  {
    name: 'text-page-heading-sm',
    fontSizeRem: 2.375,
    fontSizePx: 38,
    fontFamily: 'var(--font-sans)',
    fontFeatureSettings: 'var(--sanity-id-heading-font-features)',
    fontWeight: 400,
    letterSpacing: '-0.03em',
    lineHeight: '1.1',
  },
  {
    name: 'text-component-heading-lg',
    fontSizeRem: 1.875,
    fontSizePx: 30,
    fontFamily: 'var(--font-sans)',
    fontFeatureSettings: 'var(--sanity-id-heading-font-features)',
    fontWeight: 400,
    letterSpacing: '-0.02em',
    lineHeight: '1.1',
  },
  {
    name: 'text-component-heading-md',
    fontSizeRem: 1.5,
    fontSizePx: 24,
    fontFamily: 'var(--font-sans)',
    fontFeatureSettings: 'var(--sanity-id-heading-font-features)',
    fontWeight: 400,
    letterSpacing: '-0.01em',
    lineHeight: '1.1',
  },
  {
    name: 'text-component-heading-sm',
    fontSizeRem: 1.25,
    fontSizePx: 20,
    fontFamily: 'var(--font-sans)',
    fontFeatureSettings: 'var(--sanity-id-heading-font-features)',
    fontWeight: 400,
    letterSpacing: '-0.01em',
    lineHeight: '1.1',
  },
  {
    name: 'text-body-xl',
    fontSizeRem: 2,
    fontSizePx: 32,
    fontFamily: 'var(--font-sans)',
    fontWeight: 425,
    letterSpacing: '-0.01em',
    lineHeight: '1.24',
    variants: {
      'screen-md': {
        fontSizeRem: 1.75,
        fontSizePx: 28,
      },
      'screen-lg': {
        fontSizeRem: 2,
        fontSizePx: 32,
      },
    },
  },
  {
    name: 'text-body-lg',
    fontSizeRem: 1.5,
    fontSizePx: 24,
    fontFamily: 'var(--font-sans)',
    fontWeight: 425,
    letterSpacing: '-0.01em',
    lineHeight: '1.24',
  },
  {
    name: 'text-body-md',
    fontSizeRem: 1.125,
    fontSizePx: 18,
    fontFamily: 'var(--font-sans)',
    fontWeight: 400,
    letterSpacing: '-0.01em',
    lineHeight: '1.5',
  },
  {
    name: 'text-body-sm',
    fontSizeRem: 0.9375,
    fontSizePx: 15,
    fontFamily: 'var(--font-sans)',
    fontWeight: 400,
    letterSpacing: '-0.01em',
    lineHeight: '1.5',
  },
  {
    name: 'text-body-xs',
    fontSizeRem: 0.8125,
    fontSizePx: 13,
    fontFamily: 'var(--font-sans)',
    fontWeight: 400,
    letterSpacing: '-0.01em',
    lineHeight: '1.3',
  },
  {
    name: 'text-label-lg',
    fontSizeRem: 0.9375,
    fontSizePx: 15,
    fontFamily: 'var(--font-mono)',
    fontWeight: 400,
    letterSpacing: '0',
    lineHeight: '1.3',
  },
  {
    name: 'text-label-md',
    fontSizeRem: 0.8125,
    fontSizePx: 13,
    fontFamily: 'var(--font-mono)',
    fontWeight: 400,
    letterSpacing: '0',
    lineHeight: '1.3',
  },
  {
    name: 'text-label-sm',
    fontSizeRem: 0.625,
    fontSizePx: 10,
    fontFamily: 'var(--font-mono)',
    fontWeight: 400,
    letterSpacing: '0',
    lineHeight: '1.3',
  },
  {
    name: 'text-detail-md',
    fontSizeRem: 0.8125,
    fontSizePx: 13,
    fontFamily: 'var(--font-mono)',
    fontWeight: 400,
    letterSpacing: '0',
    lineHeight: '1.5',
  },
  {
    name: 'text-detail-sm',
    fontSizeRem: 0.75,
    fontSizePx: 12,
    fontFamily: 'var(--font-mono)',
    fontWeight: 400,
    letterSpacing: '0',
    lineHeight: '1.5',
  },
  {
    name: 'text-quote-lg',
    fontSizeRem: 2.375,
    fontSizePx: 38,
    fontFamily: 'var(--font-sans)',
    fontWeight: 400,
    letterSpacing: '-0.025',
    lineHeight: '1.1',
  },
  {
    name: 'text-quote-md',
    fontSizeRem: 1.75,
    fontSizePx: 28,
    fontFamily: 'var(--font-sans)',
    fontWeight: 400,
    letterSpacing: '-0.01',
    lineHeight: '1.35',
  },
  {
    name: 'text-quote-sm',
    fontSizeRem: 1.125,
    fontSizePx: 18,
    fontFamily: 'var(--font-sans)',
    fontWeight: 400,
    letterSpacing: '-0.01',
    lineHeight: '1.5',
  },
  {
    name: 'text-code-lg',
    fontSizeRem: 0.9375,
    fontSizePx: 15,
    fontFamily: 'var(--font-mono)',
    fontWeight: 400,
    letterSpacing: '0',
    lineHeight: '1.5',
  },
  {
    name: 'text-code-md',
    fontSizeRem: 0.8125,
    fontSizePx: 13,
    fontFamily: 'var(--font-mono)',
    fontWeight: 400,
    letterSpacing: '0',
    lineHeight: '1.5',
  },
  {
    name: 'text-code-sm',
    fontSizeRem: 0.75,
    fontSizePx: 12,
    fontFamily: 'var(--font-mono)',
    fontWeight: 400,
    letterSpacing: '0',
    lineHeight: '1.5',
  },
  {
    name: 'text-inline-link',
    fontSizeRem: null,
    fontSizePx: null,
  },
  {
    name: 'text-inline-control',
    fontSizeRem: null,
    fontSizePx: null,
  },
  {
    name: 'text-inline-code',
    fontSizeRem: null,
    fontSizePx: null,
  },
  {
    name: 'text-trim',
    fontSizeRem: null,
    fontSizePx: null,
  },
];

/** Indexed lookup for hot-path reads. */
export const primitiveColorByName: Readonly<Record<string, PrimitiveColor>> = Object.freeze(
  Object.fromEntries(primitiveColors.map((c) => [c.name, c])),
);

/** Indexed lookup for hot-path reads. */
export const semanticColorByName: Readonly<Record<string, SemanticColor>> = Object.freeze(
  Object.fromEntries(semanticColors.map((c) => [c.name, c])),
);

/** Indexed lookup for hot-path reads. */
export const spacingByName: Readonly<Record<string, SpacingToken>> = Object.freeze(
  Object.fromEntries(spacing.map((s) => [s.name, s])),
);

/** Indexed lookup for hot-path reads. */
export const typographyByName: Readonly<Record<string, TypographyStyle>> = Object.freeze(
  Object.fromEntries(typography.map((t) => [t.name, t])),
);

/** Frozen aggregate consumed by `flatten-for-brand`. */
export const sanityBrandTokens: BrandTokens = Object.freeze({
  primitiveColors,
  semanticColors,
  spacing,
  radii,
  textures,
  typography,
});
