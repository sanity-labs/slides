/**
 * Raster brand marks cropped from the checked-in Sanity reference deck.
 *
 * The image URLs are module-relative so the template works in both the dev
 * preview server and the PPTX runtime without reaching out to hosted assets.
 */

export const MARK_WHITE_ON_BLACK = new URL(
  './assets/sanity-mark-white-on-black.png',
  import.meta.url,
).pathname;

export const LOCKUP_WHITE_ON_BLACK = new URL(
  './assets/sanity-lockup-white-on-black.png',
  import.meta.url,
).pathname;

export const MARK_BLACK_ON_BRAND = new URL(
  './assets/sanity-mark-black-on-brand.png',
  import.meta.url,
).pathname;

export const MARK_BLACK_ON_BLUE = new URL('./assets/sanity-mark-black-on-blue.png', import.meta.url)
  .pathname;

export const LOCKUP_BLACK_ON_BRAND = new URL(
  './assets/sanity-lockup-black-on-brand.png',
  import.meta.url,
).pathname;

export const CLOSING_MARK_BLACK_ON_BRAND = new URL(
  './assets/sanity-closing-mark-panel.png',
  import.meta.url,
).pathname;
