/**
 * In-memory `SlidesRuntime` for tests.
 *
 * **The single test seam.** Every layer of the testing pyramid (component
 * units, reconciler goldens, MCP integration) goes through `SlidesRuntime`.
 * `FakeSlidesRuntime` records every call and maintains a coherent in-memory
 * deck so reads are consistent with writes — no HTTP-level mocks, no
 * brittle nock fixtures.
 *
 * See `docs/testing-strategy.md` for the rationale.
 *
 * # What it does
 *
 * - Implements every method of `SlidesRuntime`.
 * - `applyOps` walks the op stream and updates the in-memory deck model.
 * - `getOpsLog()` returns every op ever applied across all decks (in order),
 *   for tests that want to assert on the *call sequence*.
 * - `getDeck(deckId)` returns the current in-memory state of a deck — slides,
 *   shapes, text content — for tests that want to assert on the *result*.
 *
 * # What it deliberately doesn't do
 *
 * - Simulate any specific backend's autoresize, font fallback, page-element
 *   inheritance, etc. The fake is a *contract honoring* fake, not a
 *   *behavior simulating* fake. If a test depends on auto-resize behavior,
 *   that's a smoke-test concern, not a fake-runtime concern.
 * - Persist state across instances. Each `FakeSlidesRuntime` is fresh.
 */

import type { GenerationManifest } from './manifest.js';
import type {
  ApplyOpsResult,
  ParagraphStyle,
  ShapeKind,
  ShapeProperties,
  SlideOp,
  SlidesRuntime,
  TextStyle,
} from './runtime.js';

/** Configuration for a fake-runtime instance. */
export interface FakeSlidesRuntimeOptions {
  /**
   * If set, `createDeckFromMaster` returns this deck ID. Otherwise the fake
   * mints fresh `fake-deck-<n>` IDs.
   */
  readonly fixedDeckId?: string;

  /** Override the clock used for revision tokens (deterministic snapshots). */
  readonly now?: () => number;
}

/** A single shape in the fake deck. */
export interface FakeShape {
  readonly objectId: string;
  readonly kind: ShapeKind;
  readonly slideId: string;
  rect: { x: number; y: number; w: number; h: number };
  text: string;
  /**
   * Style spans recorded in document order. Later spans on overlapping
   * ranges win (last-write-wins). The reconciler emits spans in op order;
   * the runtime is responsible for composing them at render time.
   */
  textStyleSpans: Array<{ range: { start: number; end: number }; style: TextStyle }>;
  paragraphStyleSpans: Array<{ range: { start: number; end: number }; style: ParagraphStyle }>;
  shapeProperties: ShapeProperties;
  /** For images, the source URL. `undefined` for non-image shapes. */
  imageUrl?: string;
  /** For images, the alt-text. */
  altText?: string;
  /** For images, `object-fit` semantics. `undefined` falls back to `'fill'`. */
  imageFit?: 'contain' | 'cover' | 'fill';
  /** For images, opacity 0–1. */
  imageOpacity?: number;
  /** For images, rotation in degrees clockwise. */
  imageRotate?: number;
}

/** A single slide in the fake deck. */
export interface FakeSlide {
  readonly slideId: string;
  /** Insertion index recorded at create time, for ordering. */
  readonly insertAt: number;
  /** Object IDs of shapes on this slide, in creation order. */
  readonly shapeIds: string[];
}

/** The in-memory model of a deck. */
export interface FakeDeck {
  readonly deckId: string;
  readonly title: string;
  readonly masterRef: string | null;
  readonly slides: Map<string, FakeSlide>;
  readonly shapes: Map<string, FakeShape>;
  /** Slide IDs in their committed order. */
  readonly slideOrder: string[];
  /** Monotonic revision; bumped after each `applyOps`. */
  revision: number;
}

/** A fake test runtime. See module docstring. */
export class FakeSlidesRuntime implements SlidesRuntime {
  private readonly opsLog: Array<{ deckId: string; op: SlideOp }> = [];
  private readonly decks = new Map<string, FakeDeck>();
  private readonly manifests = new Map<string, GenerationManifest>();
  private deckCounter = 0;
  private readonly fixedDeckId?: string;
  private readonly now: () => number;

  constructor(options: FakeSlidesRuntimeOptions = {}) {
    this.fixedDeckId = options.fixedDeckId;
    this.now = options.now ?? Date.now;
  }

  // -- SlidesRuntime --------------------------------------------------------

  async applyOps(deckId: string, ops: readonly SlideOp[]): Promise<ApplyOpsResult> {
    const deck = this.requireDeck(deckId);
    const createdObjectIds: Record<string, string> = {};

    for (const op of ops) {
      this.opsLog.push({ deckId, op });
      this.applyOp(deck, op, createdObjectIds);
    }

    deck.revision += 1;
    return {
      createdObjectIds,
      revisionId: `rev-${deck.revision}-${this.now()}`,
    };
  }

  async createDeckFromMaster(masterRef: string, title: string): Promise<{ deckId: string }> {
    this.deckCounter += 1;
    const deckId = this.fixedDeckId ?? `fake-deck-${this.deckCounter}`;
    if (this.decks.has(deckId)) {
      throw new Error(`FakeSlidesRuntime: deck "${deckId}" already exists.`);
    }
    this.decks.set(deckId, {
      deckId,
      title,
      masterRef,
      slides: new Map(),
      shapes: new Map(),
      slideOrder: [],
      revision: 0,
    });
    return { deckId };
  }

  // -- SlidesRuntime (continued) --------------------------------------------

  async write(_deckId: string): Promise<{ filePath: string }> {
    throw new Error(
      'FakeSlidesRuntime does not write files. Use PptxSlidesRuntime for file output.',
    );
  }

  attachManifest(deckId: string, manifest: GenerationManifest): void {
    this.requireDeck(deckId);
    this.manifests.set(deckId, manifest);
  }

  // -- Test inspection helpers ---------------------------------------------

  /**
   * The complete sequence of ops applied across every deck, in apply order.
   *
   * Most reconciler-golden tests work directly on the ops the reconciler
   * *produces* (without applying them to a runtime). This log is for tests
   * that exercise the runtime contract end-to-end, e.g., MCP integration
   * tests.
   */
  getOpsLog(): ReadonlyArray<{ deckId: string; op: SlideOp }> {
    return this.opsLog;
  }

  /** Snapshot the in-memory deck. Returns `undefined` if it doesn't exist. */
  getDeck(deckId: string): FakeDeck | undefined {
    return this.decks.get(deckId);
  }

  /** Retrieve a deck's manifest (if attached). Test-inspection helper. */
  getManifest(deckId: string): GenerationManifest | undefined {
    return this.manifests.get(deckId);
  }

  /** All deck IDs the fake knows about. */
  listDeckIds(): readonly string[] {
    return [...this.decks.keys()];
  }

  /** Throw an Error with a useful message if the deck doesn't exist. */
  private requireDeck(deckId: string): FakeDeck {
    const deck = this.decks.get(deckId);
    if (!deck) {
      throw new Error(
        `FakeSlidesRuntime: deck "${deckId}" does not exist. Create it via createDeckFromMaster() first.`,
      );
    }
    return deck;
  }

  // -- Op application ------------------------------------------------------

  private applyOp(deck: FakeDeck, op: SlideOp, createdObjectIds: Record<string, string>): void {
    switch (op.type) {
      case 'createSlide': {
        if (deck.slides.has(op.slideId)) {
          throw new Error(`FakeSlidesRuntime: slide "${op.slideId}" already exists.`);
        }
        const slide: FakeSlide = {
          slideId: op.slideId,
          insertAt: op.insertAt ?? deck.slideOrder.length,
          shapeIds: [],
        };
        deck.slides.set(op.slideId, slide);
        const insertIdx = Math.min(slide.insertAt, deck.slideOrder.length);
        deck.slideOrder.splice(insertIdx, 0, op.slideId);
        createdObjectIds[op.slideId] = op.slideId;
        return;
      }
      case 'createShape': {
        const slide = deck.slides.get(op.slideId);
        if (!slide) {
          throw new Error(
            `FakeSlidesRuntime: createShape references unknown slide "${op.slideId}".`,
          );
        }
        if (deck.shapes.has(op.shapeId)) {
          throw new Error(`FakeSlidesRuntime: shape "${op.shapeId}" already exists.`);
        }
        const shape: FakeShape = {
          objectId: op.shapeId,
          kind: op.shape,
          slideId: op.slideId,
          rect: { x: op.rect.x, y: op.rect.y, w: op.rect.w, h: op.rect.h },
          text: '',
          textStyleSpans: [],
          paragraphStyleSpans: [],
          shapeProperties: {},
        };
        deck.shapes.set(op.shapeId, shape);
        slide.shapeIds.push(op.shapeId);
        createdObjectIds[op.shapeId] = op.shapeId;
        return;
      }
      case 'createImage': {
        const slide = deck.slides.get(op.slideId);
        if (!slide) {
          throw new Error(
            `FakeSlidesRuntime: createImage references unknown slide "${op.slideId}".`,
          );
        }
        if (deck.shapes.has(op.imageId)) {
          throw new Error(`FakeSlidesRuntime: image "${op.imageId}" already exists.`);
        }
        const image: FakeShape = {
          objectId: op.imageId,
          kind: 'RECTANGLE', // Slides treats images as a separate kind; we collapse for the fake.
          slideId: op.slideId,
          rect: { x: op.rect.x, y: op.rect.y, w: op.rect.w, h: op.rect.h },
          text: '',
          textStyleSpans: [],
          paragraphStyleSpans: [],
          shapeProperties: {},
          imageUrl: op.url,
          ...(op.altText !== undefined ? { altText: op.altText } : {}),
          ...(op.fit !== undefined ? { imageFit: op.fit } : {}),
          ...(op.opacity !== undefined ? { imageOpacity: op.opacity } : {}),
          ...(op.rotate !== undefined ? { imageRotate: op.rotate } : {}),
        };
        deck.shapes.set(op.imageId, image);
        slide.shapeIds.push(op.imageId);
        createdObjectIds[op.imageId] = op.imageId;
        return;
      }
      case 'insertText': {
        const shape = this.requireShape(deck, op.objectId, 'insertText');
        // The reconciler always inserts into an empty shape, so this is a
        // full-text replace.
        shape.text = op.text;
        return;
      }
      case 'updateTextStyle': {
        const shape = this.requireShape(deck, op.objectId, 'updateTextStyle');
        shape.textStyleSpans.push({ range: { ...op.range }, style: { ...op.style } });
        return;
      }
      case 'updateParagraphStyle': {
        const shape = this.requireShape(deck, op.objectId, 'updateParagraphStyle');
        shape.paragraphStyleSpans.push({ range: { ...op.range }, style: { ...op.style } });
        return;
      }
      case 'updateShapeProperties': {
        const shape = this.requireShape(deck, op.objectId, 'updateShapeProperties');
        shape.shapeProperties = { ...shape.shapeProperties, ...op.properties };
        return;
      }
    }
  }

  private requireShape(deck: FakeDeck, objectId: string, opName: string): FakeShape {
    const shape = deck.shapes.get(objectId);
    if (!shape) {
      throw new Error(`FakeSlidesRuntime: ${opName} targets unknown object "${objectId}".`);
    }
    return shape;
  }
}
