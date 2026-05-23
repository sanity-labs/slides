# react-pptx-mcp

Template-agnostic MCP server framework for [react-pptx](../react-pptx/README.md).

A template package wires its component library into `createSlideServer()` and the framework auto-derives MCP tools from the Zod schemas.

## Tool surface

Three kinds of tools are exposed:

| Tool                | Role                                                                               |
| ------------------- | ---------------------------------------------------------------------------------- |
| `slides_list`       | Discovery. Returns every slide type the template supports with its description.    |
| `slides_add_<type>` | One per slide type. Validates props and echoes back a `{ component, props }` spec. |
| `slides_create`     | Full pipeline. Takes `{ title, slides }`, writes a `.pptx` file, returns the path. |

The per-slide-type prefix defaults to `slides_add_`. Override via `SlideServerConfig.toolPrefix` when the server emits something other than slide decks.

## Usage

```ts
import { createSlideServer } from 'react-pptx-mcp';
import { PptxSlidesRuntime } from 'react-pptx';

const runtime = new PptxSlidesRuntime({ outputDir: '/tmp/decks' });
const server = createSlideServer({ template: yourTemplate, runtime });
await server.start({ transport: 'stdio' });
```

See `templates/sanity/src/cli.ts` for a worked example of wiring a template into a CLI binary.
