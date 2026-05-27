---
'@sanity-labs/slides': patch
---

`slidesctl init` now writes the absolute path to the current Node binary into the MCP client config instead of bare `node`.

GUI apps like Claude Desktop don't inherit the user's shell PATH, so `command: "node"` could resolve to whichever `node` happens to be first in the GUI's PATH — often an ancient system Node that pre-dates top-level `await` and crashes the slidesctl server immediately with `SyntaxError: Unexpected reserved word`. Now we use `process.execPath`, which is the absolute path to the current Node binary (the one running `slidesctl init`). This guarantees the same Node version that successfully ran the wizard also runs the server.

Existing broken entries can be fixed by re-running `slidesctl use <name>`, or manually replacing `"command": "node"` with the absolute path in the MCP client config.
