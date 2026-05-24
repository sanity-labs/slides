/**
 * Render-snapshot tests for the four new Layer 2 components.
 *
 * Each renders to ops + manifest with representative props; failures
 * surface as readable snapshot diffs in PR review. The same pattern as
 * `Cover.test.tsx` and `SectionDivider.test.tsx`.
 */

import { describe, expect, test } from 'vitest';
import type { ReactElement } from 'react';
import { renderToOps } from '../../core/index.js';
import { sanity } from '../index.js';
import { OneColumn } from './OneColumn.js';
import { TitleAndBody } from './TitleAndBody.js';
import { TitleAndGrid } from './TitleAndGrid.js';
import { Closing } from './Closing.js';

const FIXED_NOW = (): string => '2026-05-04T15:00:00.000Z';

const snap = (tree: ReactElement, label: string): void => {
  const result = renderToOps({ tree, template: sanity, deckId: null, now: FIXED_NOW });
  expect(result.ops).toMatchSnapshot(`${label} ops`);
  expect(result.manifest).toMatchSnapshot(`${label} manifest`);
};

describe('<OneColumn/> goldens', () => {
  test('minimal: title + body', () => {
    snap(<OneColumn title="Quarterly review" body="The strategy worked." />, 'one-column minimal');
  });
  test('full: with eyebrows + footer', () => {
    snap(
      <OneColumn
        title="Quarterly review"
        eyebrow="STRATEGY"
        bodyEyebrow="OUTCOME"
        body="The strategy worked."
        footer="Sanity 2026"
      />,
      'one-column full',
    );
  });
});

describe('<TitleAndBody/> goldens', () => {
  test('minimal: title + body', () => {
    snap(
      <TitleAndBody title="Why structure matters" body="Because content reuse compounds." />,
      'title-and-body minimal',
    );
  });
  test('full: with eyebrows + footer', () => {
    snap(
      <TitleAndBody
        title="Why structure matters"
        eyebrow="THESIS"
        bodyEyebrow="THE CLAIM"
        body="Because content reuse compounds."
        footer="Sanity 2026"
      />,
      'title-and-body full',
    );
  });
});

describe('<TitleAndGrid/> goldens', () => {
  test('3×2 grid of fields', () => {
    snap(
      <TitleAndGrid
        title="Six metrics that matter"
        eyebrow="DASHBOARD"
        cols={3}
        rows={2}
        cells={[
          { eyebrow: 'REVENUE', body: '+18% YoY' },
          { eyebrow: 'GROWTH', body: '23% net new' },
          { eyebrow: 'CHURN', body: 'Down 2pt' },
          { eyebrow: 'ARR', body: '$54M' },
          { eyebrow: 'NPS', body: '62' },
          { eyebrow: 'HEADCOUNT', body: '180' },
        ]}
      />,
      'title-and-grid 3x2',
    );
  });
  test('2×1 grid of fields', () => {
    snap(
      <TitleAndGrid
        title="Two camps"
        cols={2}
        cells={[
          { eyebrow: 'CAMP A', body: 'Believes in structure.' },
          { eyebrow: 'CAMP B', body: 'Believes in flexibility.' },
        ]}
      />,
      'title-and-grid 2x1',
    );
  });
});

describe('<Closing/> goldens', () => {
  test('minimal: no slide number', () => {
    snap(<Closing />, 'closing minimal');
  });
  test('with slide number', () => {
    snap(<Closing slideNumber="12 / 12" />, 'closing with-slide-number');
  });
});
