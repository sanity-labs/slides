/**
 * Vite swaps this module in for server-only imports the dev viewer cannot
 * load in the browser:
 *
 *   - `@sanity-labs/slides/dist/core/pptx-runtime.js` (re-exports PptxSlidesRuntime)
 *   - `@sanity-labs/slides/dist/core/op-translator-pptx.js`
 *   - `@resvg/resvg-js` (native `.node` binary)
 *   - `pptxgenjs` (Node-only crypto + fs deps)
 *
 * Each of those has its own export surface, and esbuild's static analysis
 * during dep pre-bundling complains if a name isn't found. So we declare
 * every named export the dev viewer's transitive imports could ask for.
 * Calling any of them at runtime throws — the dev viewer renders via the
 * in-memory `FakeSlidesRuntime`, never PPTX or PNG output.
 */

const browserOnly = (name: string): never => {
  throw new Error(`${name} is not available in the slides-dev browser viewer.`);
};

// --- @sanity-labs/slides/core/pptx-runtime exports ---
export class PptxSlidesRuntime {
  constructor() {
    browserOnly('PptxSlidesRuntime');
  }
}
export const DEFAULT_PPTX_FONT_SUBSTITUTION: Readonly<Record<string, string>> = Object.freeze({});

// --- @sanity-labs/slides/core/op-translator-pptx exports ---
export const translateOpsToPptx = (): never => browserOnly('translateOpsToPptx');
export const hexToPptxColor = (): never => browserOnly('hexToPptxColor');

// --- @resvg/resvg-js exports ---
export class Resvg {
  constructor() {
    browserOnly('Resvg');
  }
}

// --- pptxgenjs exports ---
class PptxGenJSStub {
  constructor() {
    browserOnly('PptxGenJS');
  }
}
export default PptxGenJSStub;
