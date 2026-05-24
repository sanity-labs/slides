/**
 * `<Cover/>` golden-snapshot tests (layer 1 per `docs/testing-strategy.md`).
 *
 * Renders the component through the reconciler with representative props
 * and snapshots the full op stream + manifest. Failures surface as readable
 * snapshot diffs in PR review.
 *
 * The snapshots are richer than PR #11's text-only goldens: they include
 * `updateShapeProperties` (full-bleed black canvas + OrangeRed accent line
 * fills) — the visual-fidelity proof.
 */

import { describe, expect, test } from 'vitest';
import { renderToOps } from '../../core/index.js';
import { sanity } from '../index.js';
import { Cover } from './Cover.js';

const FIXED_NOW = (): string => '2026-05-04T15:00:00.000Z';

describe('<Cover/> goldens', () => {
  test('minimum: title only', () => {
    const result = renderToOps({
      tree: <Cover title="Q2 Review" />,
      template: sanity,
      deckId: null,
      now: FIXED_NOW,
    });
    expect(result.ops).toMatchSnapshot('ops');
    expect(result.manifest).toMatchSnapshot('manifest');
  });

  test('full: title + subtitle + custom eyebrow', () => {
    const result = renderToOps({
      tree: <Cover title="Q2 Review" subtitle="Structure powers intelligence" eyebrow="Q2 2026" />,
      template: sanity,
      deckId: null,
      now: FIXED_NOW,
    });
    expect(result.ops).toMatchSnapshot('ops');
    expect(result.manifest).toMatchSnapshot('manifest');
  });
});
