# react-pptx

A React reconciler that compiles a typed component tree into a PPTX presentation.

**Status:** Pre-alpha. APIs unstable.

## What this package contains

- **Geometry primitives** — points / EMU conversion, canvas constants.
- **`Template` interface** — the contract every template package must satisfy.
- **`SlidesRuntime` interface** — the seam between the reconciler and the chosen backend.
- **`PptxSlidesRuntime`** — the default backend. Emits a `.pptx` file via [`pptxgenjs`](https://github.com/gitbrent/PptxGenJS).
- **`FakeSlidesRuntime`** — an in-memory test fake that records every op.
- **Font resolver** — runtime font resolution against the backend's available-fonts set.
- **Slot infrastructure** — typed slot identity and generation-manifest types.
- **Op types** — the typed slide operations the reconciler emits.
- **The reconciler itself** — a React host walker that turns a template component tree into ops.

## What this package is NOT

- Not a template. Off-brand styling is a concern of the consuming template package (e.g., `templates/sanity/`).
- Not an MCP server. That's `react-pptx-mcp`.
- Not tied to one render backend. The `SlidesRuntime` interface is the seam; new backends plug in behind the same shape.

## Design principles

- **Determinism.** Given the same React tree, the reconciler emits the same op sequence. Always.
- **No HTTP-level mocks.** The seam is `SlidesRuntime`, not any backend's REST surface. Tests use `FakeSlidesRuntime`.
- **Template-portable from day one.** A second template should require zero code changes here.
