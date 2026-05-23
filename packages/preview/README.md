# react-pptx-dev

Browser dev server for `react-pptx` templates. The `sanity dev` of slide templates.

You write template components in JSX. `slides-dev` boots a Vite server with a
Google-Slides-style viewer — thumbnail rail on the left, zoomable canvas in
the middle, URL-driven state for deep linking. Editing a component
hot-reloads the preview.

## How it works

```
JSX  ─▶  renderToOps()  ─▶  FakeSlidesRuntime  ─▶  FakeDeck  ─▶  React DOM
```

Same op stream the PPTX runtime consumes, so what you see in the browser is
what the `.pptx` writer will produce. No parallel HTML runtime to keep in
sync.

## Usage

In your template package:

1. Add the dev dep + script:

   ```json
   {
     "dependencies": { "react-pptx-dev": "workspace:*" },
     "scripts": { "dev": "slides-dev" }
   }
   ```

2. Export an `examples` record from `src/examples.tsx`:

   ```tsx
   import type { DeckExamples } from 'react-pptx-dev';
   import { Cover } from './components/Cover.js';

   export const examples: DeckExamples = {
     cover: {
       label: 'Cover',
       render: () => <Cover title="Q2 Review" />,
     },
   };
   ```

3. Run it:

   ```bash
   pnpm dev
   ```

   Open <http://localhost:5173>.

## URL state

State of record is the hash. Bookmark or share to jump straight to a slide:

```
http://localhost:5173/#example=full-deck&slide=2&zoom=1
```

- `example` — key from your `examples` record
- `slide` — zero-based slide index
- `zoom` — `fit` (default) or a numeric scale

## Browser console

Every render hangs the composed deck on `window.__slides`:

```js
> __slides.deck            // FakeDeck
> __slides.ops             // SlideOp[]
> __slides.manifest        // GenerationManifest
> __slides.refresh()       // force a recompose
```

Useful for spelunking — inspect a shape's text spans, replay ops in a fresh
runtime, etc.

## Flags

```
slides-dev [--examples <path>] [--port <n>] [--host <h>]
```

- `--examples <path>` — override the examples file location (defaults to
  `<main-dir>/examples.tsx`).
- `--port <n>` — port (default `5173`).
- `--host <h>` — host (default `localhost`).
