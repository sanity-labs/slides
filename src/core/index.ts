/**
 * Public surface of `react-pptx`. The high-frequency symbols a template
 * author or MCP framework needs.
 *
 * Specialized internals (PPTX op-translator, fake-runtime model types, etc.)
 * live behind sub-path imports (`react-pptx/op-translator-pptx`,
 * `react-pptx/fake-runtime`, …) so tree-shaking stays clean.
 */

// Canvas + units
export {
  CANVAS_16_9,
  CANVAS_4_3,
  type Canvas,
  type Emu,
  type Pt,
  type Rect,
  ptToEmu,
  inToEmu,
} from './geometry.js';

// Template contract
export type { Template, TypographyToken } from './template.js';
export { defineTemplate, defineTemplateComponent, type TemplateComponent } from './template.js';
export { type FontStack } from './font-resolver.js';

// Runtime op types
export type {
  ApplyOpsResult,
  EmuRect,
  HexColor,
  ShapeKind,
  ShapeProperties,
  SlideOp,
  SlidesRuntime,
  TextRange,
  TextStyle,
  ParagraphStyle,
} from './runtime.js';

// JSX primitives a template's components build on
export {
  Slide,
  Box,
  Text,
  Color,
  Image,
  type SlideProps,
  type BoxProps,
  type BoxFill,
  type TextProps,
  type ColorProps,
  type ImageProps,
  type ImageRef,
} from './components.js';

// Reconciler entry point
export { renderToOps, ReconcilerError, type RenderToOpsInput } from './reconciler.js';

// Manifest types
export type { ArtifactRef, GenerationManifest, ReconcileResult, SlotId } from './manifest.js';

// Runtimes
export { FakeSlidesRuntime, type FakeDeck } from './fake-runtime.js';
export {
  PptxSlidesRuntime,
  DEFAULT_PPTX_FONT_SUBSTITUTION,
  type PptxSlidesRuntimeOptions,
} from './pptx-runtime.js';
