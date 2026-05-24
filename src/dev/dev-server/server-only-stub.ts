const browserOnly = (name: string): never => {
  throw new Error(`${name} is not available in the slides-dev browser viewer.`);
};
export class PptxSlidesRuntime {
  constructor() {
    browserOnly('PptxSlidesRuntime');
  }
}
export const DEFAULT_PPTX_FONT_SUBSTITUTION: Readonly<Record<string, string>> = Object.freeze({});

export const translateOpsToPptx = (): never => browserOnly('translateOpsToPptx');
export const hexToPptxColor = (): never => browserOnly('hexToPptxColor');
