import type { ReactNode } from 'react';
import { renderToOps } from 'react-pptx/reconciler';
import { FakeSlidesRuntime, type FakeDeck } from 'react-pptx/fake-runtime';
import type { GenerationManifest } from 'react-pptx/manifest';
import type { SlideOp } from 'react-pptx/runtime';
import type { Template } from 'react-pptx/template';

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
