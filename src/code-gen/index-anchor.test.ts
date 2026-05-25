import { describe, expect, test } from 'vitest';
import { readRegisteredNames, writeAnchors } from './index-anchor.js';

const SCAFFOLD = `import { CANVAS_16_9, defineTemplate, defineTemplateComponent } from '@sanity-labs/slides';

// <generated-imports>
// </generated-imports>

export default defineTemplate({
  name: 'demo',
  canvas: CANVAS_16_9,
  fonts: { display: ['Inter'], body: ['Inter'], mono: ['Courier'] },
  colors: {},
  typography: {},
  spacing: {},
  components: {
    // <generated-components>
    // </generated-components>
  },
});
`;

describe('index-anchor', () => {
  test('writeAnchors round-trips an empty registry', () => {
    const out = writeAnchors(SCAFFOLD, []);
    expect(out).toContain('// <generated-imports>\n// </generated-imports>');
    expect(out).toContain('// <generated-components>\n    // </generated-components>');
    expect(readRegisteredNames(out)).toEqual([]);
  });

  test('writeAnchors adds an import line + component entry per name', () => {
    const out = writeAnchors(SCAFFOLD, ['RevenueChart', 'TeamGrid']);
    expect(out).toContain(
      "import { RevenueChart, RevenueChartSchema } from './components/RevenueChart.js';",
    );
    expect(out).toContain("import { TeamGrid, TeamGridSchema } from './components/TeamGrid.js';");
    expect(out).toContain('RevenueChart: defineTemplateComponent({');
    expect(out).toContain('description: "Custom slide type: RevenueChart."');
    expect(readRegisteredNames(out)).toEqual(['RevenueChart', 'TeamGrid']);
  });

  test('writeAnchors is idempotent (writing twice == once)', () => {
    const once = writeAnchors(SCAFFOLD, ['A', 'B']);
    const twice = writeAnchors(once, ['A', 'B']);
    expect(twice).toBe(once);
  });

  test('writeAnchors removes a name when re-emitted without it', () => {
    const added = writeAnchors(SCAFFOLD, ['A', 'B']);
    const dropped = writeAnchors(added, ['A']);
    expect(readRegisteredNames(dropped)).toEqual(['A']);
    expect(dropped).not.toContain('B:');
    expect(dropped).not.toContain('./components/B.js');
  });

  test('missing anchors throw an agent-actionable error', () => {
    const corrupt = SCAFFOLD.replace('// <generated-imports>', '// (removed)');
    expect(() => writeAnchors(corrupt, ['A'])).toThrowError(/missing the .* anchor pair/);
  });
});
