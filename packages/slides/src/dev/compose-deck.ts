import type { ReactNode } from 'react';
import { renderToOps } from '../core/reconciler.js';
import { FakeSlidesRuntime, type FakeDeck } from '../core/fake-runtime.js';
import type { GenerationManifest } from '../core/manifest.js';
import type { SlideOp } from '../core/runtime.js';
import type { Template } from '../core/template.js';

export type ComposeDeckInput = {
  readonly tree: ReactNode;
  readonly template: Template;
  readonly title?: string;
  readonly now?: () => string;
};

export type ComposedDeck = {
  readonly deck: FakeDeck;
  readonly ops: readonly SlideOp[];
  readonly manifest: GenerationManifest;
};

const DECK_ID = 'dev-deck';

export const composeDeck = async (input: ComposeDeckInput): Promise<ComposedDeck> => {
  const runtime = new FakeSlidesRuntime({ fixedDeckId: DECK_ID });
  await runtime.createDeckFromMaster(input.template.name, input.title ?? 'Dev deck');

  const reconciled = renderToOps({
    tree: input.tree,
    template: input.template,
    deckId: DECK_ID,
    ...(input.now ? { now: input.now } : {}),
  });

  await runtime.applyOps(DECK_ID, reconciled.ops);

  const deck = runtime.getDeck(DECK_ID);
  if (!deck) throw new Error('composeDeck: FakeSlidesRuntime lost track of the dev deck.');

  return { deck, ops: reconciled.ops, manifest: reconciled.manifest };
};
