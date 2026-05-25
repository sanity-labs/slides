/**
 * Deck entrypoint. Loaded by the MCP server via tsx — no build step needed.
 *
 * Agent-authored components are added under `src/components/` and registered
 * here between the `<generated-imports>` / `<generated-components>` anchors.
 * The MCP server's code-gen tools (`slides_add_component`, `slides_edit_component`)
 * own those anchors; do not hand-edit them.
 */

import { CANVAS_16_9, defineTemplate, defineTemplateComponent } from '@sanity-labs/slides';

// <generated-imports>
// </generated-imports>

export default defineTemplate({
  name: '__NAME__',
  canvas: CANVAS_16_9,
  fonts: {
    display: ['Inter', 'Arial'],
    body: ['Inter', 'Arial'],
    mono: ['IBM Plex Mono', 'Courier New'],
  },
  colors: {},
  typography: {},
  spacing: {},
  components: {
    // <generated-components>
    // </generated-components>
  },
});

// Keep `defineTemplateComponent` referenced even when the components map is
// empty so unused-import lints stay quiet between regenerations.
export { defineTemplateComponent };
