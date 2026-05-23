# @sanity-labs/slides

Sanity's slide template for [react-pptx](../../packages/core/README.md). Components, brand tokens, and a CLI binary that wires the template into [react-pptx-mcp](../../packages/mcp/README.md).

## Usage

Run the MCP server over stdio (default file output in `cwd`):

```bash
sanity-slides serve --output ~/Desktop
```

Or generate a single deck from JSON on stdin:

```bash
echo '{"title":"Q2 Review","slides":[{"component":"Cover","props":{"title":"Q2 Review"}}]}' \
  | sanity-slides generate --output ~/Desktop
# /Users/you/Desktop/Q2-Review.pptx
```

## Programmatic API

```ts
import { sanity, SANITY_PPTX_FONT_SUBSTITUTION } from '@sanity-labs/slides';
import { PptxSlidesRuntime } from 'react-pptx';
import { createSlideServer } from 'react-pptx-mcp';

const runtime = new PptxSlidesRuntime({
  outputDir: '/tmp/decks',
  fontSubstitution: SANITY_PPTX_FONT_SUBSTITUTION,
});
const server = createSlideServer({ template: sanity, runtime });
await server.start({ transport: 'stdio' });
```

## Authoring new slide types

The brand layer exports composable primitives so new slide types do not need to re-derive the deck chrome or color palette:

```tsx
import { BrandSlide, BrandText, COLORS, DotGrid, TopLabel } from '@sanity-labs/slides';

export const Quote = ({ quote, attribution }: { quote: string; attribution?: string }) => (
  <BrandSlide tone="brand">
    <TopLabel tone="brand">QUOTE</TopLabel>
    <BrandText rect={{ x: 24, y: 80, w: 720, h: 360 }} size={48} color={COLORS.black}>
      “{quote}”
    </BrandText>
    {attribution ? (
      <BrandText rect={{ x: 24, y: 460, w: 720, h: 32 }} size={14} color={COLORS.black} font="mono">
        {attribution}
      </BrandText>
    ) : null}
  </BrandSlide>
);
```

`BrandSlide` renders the full-bleed background, default footer (`SANITY INC - 2026`), and the bottom-left mark or lockup. Pass `tone="brand" | "blue" | "dark"`, `lockup` to swap the mark for the wordmark, and `footer={null}` to hide the chrome footer. `BrandText`, `TopLabel`, `Label`, `DotGrid`, and `DottedRule` share the same tone and color tokens.

To register your custom slide as an MCP tool, drop it into the `components` map of a `defineTemplate` call exactly like the ones in `src/index.ts` and ship a Zod schema describing its props.

## What ships

Eight slide components, all brand-locked to the reference deck:

- `Cover`
- `Agenda` (variants: `simple`, `detailed`)
- `SectionDivider` (variants: `orange-red`, `blue`, `dot-grid`)
- `OneColumn`
- `TitleAndBody`
- `TitleAndGrid`
- `Demo`
- `Closing`

## Font note

PPTX cannot embed fonts. The template uses Arial first for display/body so browser preview and exported PPTX resolve to the same installed metrics. Mono labels use IBM Plex Mono first, with Courier New as the fallback. The `SANITY_PPTX_FONT_SUBSTITUTION` map identity-passes Geist + IBM Plex Mono for environments that have the Sanity brand fonts installed, remaps legacy Waldenburg → Geist, and identity-passes system-safe fallbacks.

## Layout

```
src/
├── index.ts                Template value (sanity) + SANITY_PPTX_FONT_SUBSTITUTION.
├── cli.ts                  The `sanity-slides` bin.
├── flatten-for-brand.ts    Adapter: nested BrandTokens → flat Template slots.
├── tokens.ts               Frozen Sanity-DS token catalog.
├── tokens/types.ts         Token shape types.
├── brand-assets.ts         Embedded Sanity marks cropped from the reference deck.
├── primitives/             Token-typed primitive layer (TokenBox, Title, Grid, …).
└── components/             High-level slide components (Cover, Agenda, Demo, …).
```
