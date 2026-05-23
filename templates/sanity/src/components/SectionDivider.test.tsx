/**
 * `<SectionDivider/>` golden-snapshot tests (layer 1 per
 * `docs/testing-strategy.md`).
 *
 * Six golden snapshots: each of the three variants × (with eyebrow / without).
 * The orange-red and blue variants exercise full-bleed `<Box fill={...}>`;
 * the dot-grid variant additionally exercises `<Image>` + a manifest
 * `ArtifactRef` recording the texture URL — that's the visual-fidelity
 * proof PR #11 deferred and PR #14 ships.
 */

import { describe, expect, test } from 'vitest';
import type { ReactElement } from 'react';
import { renderToOps } from 'react-pptx';
import { sanity } from '../index.js';
import { SectionDivider } from './SectionDivider.js';

const FIXED_NOW = (): string => '2026-05-04T15:00:00.000Z';

const snapshot = (tree: ReactElement, label: string): void => {
  const result = renderToOps({ tree, template: sanity, deckId: null, now: FIXED_NOW });
  expect(result.ops).toMatchSnapshot(`${label} ops`);
  expect(result.manifest).toMatchSnapshot(`${label} manifest`);
};

describe('<SectionDivider/> goldens — orange-red', () => {
  test('without eyebrow', () => {
    snapshot(<SectionDivider variant="orange-red" title="Break some rules" />, 'orange-red bare');
  });
  test('with eyebrow', () => {
    snapshot(
      <SectionDivider variant="orange-red" title="Break some rules" eyebrow="PART 02" />,
      'orange-red with-eyebrow',
    );
  });
});

describe('<SectionDivider/> goldens — blue', () => {
  test('without eyebrow', () => {
    snapshot(<SectionDivider variant="blue" title="Structure" />, 'blue bare');
  });
  test('with eyebrow', () => {
    snapshot(
      <SectionDivider variant="blue" title="Structure" eyebrow="PART 03" />,
      'blue with-eyebrow',
    );
  });
});

describe('<SectionDivider/> goldens — dot-grid', () => {
  test('without eyebrow', () => {
    snapshot(<SectionDivider variant="dot-grid" title="A quieter break" />, 'dot-grid bare');
  });
  test('with eyebrow', () => {
    snapshot(
      <SectionDivider variant="dot-grid" title="A quieter break" eyebrow="PART 04" />,
      'dot-grid with-eyebrow',
    );
  });
});
