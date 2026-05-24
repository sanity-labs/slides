import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import {
  CircleAlert,
  Fullscreen,
  Menu,
  Minus,
  Plus,
  Command,
  Download,
  Loader2,
  TriangleAlert,
} from 'lucide-react';
import {
  TransformWrapper,
  TransformComponent,
  type ReactZoomPanPinchRef,
} from 'react-zoom-pan-pinch';
import type { FakeDeck } from '../core/fake-runtime.js';
import type { Template } from '../core/template.js';
import { composeDeck, type ComposedDeck } from './compose-deck.js';
import { deriveAutoPreview } from './auto-examples.js';
import { SlideCanvas } from './slide-canvas.js';
import { SHORTCUT_LIST, useKeyboardNav } from './use-keyboard-nav.js';
import {
  DEFAULT_URL_STATE,
  parseUrlState,
  serializeUrlState,
  type ViewerUrlState,
} from './url-state.js';
import { cn } from './lib/cn.js';
import { IconButton } from './ui/icon-button.js';
import { TextButton } from './ui/text-button.js';
import { Kbd } from './ui/kbd.js';

const NAV_VISIBLE_KEY = 'slides-dev:nav-visible';
const THUMB_W = 228;
const MIN_SCALE = 0.1;
const MAX_SCALE = 5;
const ZOOM_STEP = 0.2;
const ANIMATION_MS = 200;
const VIEWPORT_PADDING = 48;

export type DeckViewerProps = {
  readonly template: Template;
};

type AsyncDeckState =
  | { status: 'pending' }
  | { status: 'error'; error: Error }
  | { status: 'ready'; composed: ComposedDeck };

export const DeckViewer = ({ template }: DeckViewerProps): ReactElement => {
  const [url, setUrl] = useUrlState();
  const [navVisible, setNavVisible] = usePersistedBool(NAV_VISIBLE_KEY, true);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [scale, setScale] = useState(1);
  const [autoFit, setAutoFit] = useState(true);

  const wrapperRef = useRef<ReactZoomPanPinchRef | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const async = useDeckCompose(template);
  const slideCount = async.status === 'ready' ? async.composed.deck.slideOrder.length : 0;

  const setSlide = useCallback(
    (n: number) => setUrl({ slide: Math.max(0, Math.min(n, slideCount - 1)) }),
    [setUrl, slideCount],
  );

  const fitToViewport = useCallback(() => {
    const wrapper = wrapperRef.current;
    const container = containerRef.current;
    if (!wrapper || !container) return;
    const fit = computeFitScale(container, template.canvas);
    const x = (container.clientWidth - template.canvas.w * fit) / 2;
    const y = (container.clientHeight - template.canvas.h * fit) / 2;
    wrapper.setTransform(x, y, fit, ANIMATION_MS, 'easeOut');
    setAutoFit(true);
  }, [template.canvas]);

  const zoomBy = useCallback((dir: 1 | -1) => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    setAutoFit(false);
    if (dir === 1) wrapper.zoomIn(ZOOM_STEP, ANIMATION_MS, 'easeOut');
    else wrapper.zoomOut(ZOOM_STEP, ANIMATION_MS, 'easeOut');
  }, []);

  useDebugHandle({ template, async });

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !autoFit) return;
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => fitToViewport());
    });
    ro.observe(container);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [autoFit, fitToViewport]);
  useKeyboardNav({
    onNext: () => setSlide(url.slide + 1),
    onPrev: () => setSlide(url.slide - 1),
    onFirst: () => setSlide(0),
    onLast: () => setSlide(slideCount - 1),
    onZoomIn: () => zoomBy(1),
    onZoomOut: () => zoomBy(-1),
    onZoomFit: fitToViewport,
    onToggleNav: () => setNavVisible((v) => !v),
    onShowHelp: () => setShowShortcuts((v) => !v),
  });

  return (
    <div className="flex h-dvh flex-col antialiased isolate">
      <TopBar
        template={template}
        navVisible={navVisible}
        toggleNav={() => setNavVisible((v) => !v)}
        slideIndex={url.slide}
        slideCount={slideCount}
        showShortcuts={showShortcuts}
        toggleShortcuts={() => setShowShortcuts((v) => !v)}
      />
      <div className="flex min-h-0 flex-1">
        <NavRailContainer visible={navVisible}>
          <NavRail template={template} async={async} slideIndex={url.slide} onSelect={setSlide} />
        </NavRailContainer>
        <Viewport
          template={template}
          async={async}
          slideIndex={url.slide}
          containerRef={containerRef}
          wrapperRef={wrapperRef}
          onTransform={(_, state) => setScale(state.scale)}
          onUserZoom={() => setAutoFit(false)}
          onClampSlide={setSlide}
        />
      </div>
      <FloatingZoom
        scale={scale}
        isFit={autoFit}
        onFit={fitToViewport}
        onZoomIn={() => zoomBy(1)}
        onZoomOut={() => zoomBy(-1)}
      />
    </div>
  );
};

const computeFitScale = (container: HTMLElement, canvas: { w: number; h: number }): number => {
  const w = container.clientWidth - VIEWPORT_PADDING * 2;
  const h = container.clientHeight - VIEWPORT_PADDING * 2;
  return Math.max(MIN_SCALE, Math.min(w / canvas.w, h / canvas.h));
};

const useUrlState = (): [ViewerUrlState, (next: ViewerUrlState) => void] => {
  const [state, setState] = useState<ViewerUrlState>(() =>
    typeof window === 'undefined' ? DEFAULT_URL_STATE : parseUrlState(window.location.hash),
  );

  useEffect(() => {
    const onHashChange = () => setState(parseUrlState(window.location.hash));
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const setUrl = useCallback((next: ViewerUrlState) => {
    setState(next);
    const serialized = serializeUrlState(next);
    if (typeof window !== 'undefined' && window.location.hash !== serialized) {
      window.history.replaceState(null, '', serialized || window.location.pathname);
    }
  }, []);

  return [state, setUrl];
};

const usePersistedBool = (
  key: string,
  fallback: boolean,
): [boolean, (next: boolean | ((prev: boolean) => boolean)) => void] => {
  const [state, setState] = useState<boolean>(() => {
    if (typeof window === 'undefined') return fallback;
    const stored = window.localStorage.getItem(key);
    return stored === null ? fallback : stored === 'true';
  });
  const set = useCallback(
    (next: boolean | ((prev: boolean) => boolean)) => {
      setState((prev) => {
        const resolved = typeof next === 'function' ? next(prev) : next;
        if (typeof window !== 'undefined') window.localStorage.setItem(key, String(resolved));
        return resolved;
      });
    },
    [key],
  );
  return [state, set];
};

const useDeckCompose = (template: Template): AsyncDeckState => {
  const [state, setState] = useState<AsyncDeckState>({ status: 'pending' });
  useEffect(() => {
    let cancelled = false;
    setState({ status: 'pending' });
    (async () => {
      try {
        const tree = template.preview ? template.preview() : deriveAutoPreview(template);
        const composed = await composeDeck({ tree, template });
        if (!cancelled) setState({ status: 'ready', composed });
      } catch (err) {
        if (!cancelled) {
          setState({
            status: 'error',
            error: err instanceof Error ? err : new Error(String(err)),
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [template]);
  return state;
};

declare global {
  interface Window {
    __slides?: {
      template: Template;
      deck?: FakeDeck;
      ops?: ComposedDeck['ops'];
      manifest?: ComposedDeck['manifest'];
    };
  }
}

const useDebugHandle = ({
  template,
  async,
}: {
  template: Template;
  async: AsyncDeckState;
}): void => {
  useEffect(() => {
    window.__slides = {
      template,
      ...(async.status === 'ready'
        ? {
            deck: async.composed.deck,
            ops: async.composed.ops,
            manifest: async.composed.manifest,
          }
        : {}),
    };
  }, [template, async]);
};

const TopBar = ({
  template,
  navVisible,
  toggleNav,
  slideIndex,
  slideCount,
  showShortcuts,
  toggleShortcuts,
}: {
  template: Template;
  navVisible: boolean;
  toggleNav: () => void;
  slideIndex: number;
  slideCount: number;
  showShortcuts: boolean;
  toggleShortcuts: () => void;
}): ReactElement => (
  <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-paper px-3 py-2">
    <div className="flex min-w-0 items-center gap-3">
      <IconButton
        icon={<Menu className="size-4" />}
        label={navVisible ? 'Hide navigation' : 'Show navigation'}
        selected={navVisible}
        onClick={toggleNav}
      />
      <h1 className="inline-flex shrink-0 items-center rounded-md bg-ink/5 px-2 py-1 text-xs font-medium text-ink">
        {template.name}
      </h1>
      {slideCount > 0 && (
        <span className="shrink-0 text-xs font-medium text-text-muted tabular-nums">
          Slide {slideIndex + 1} of {slideCount}
        </span>
      )}
    </div>
    <div className="flex items-center gap-1">
      <ShortcutsDropdown open={showShortcuts} onToggle={toggleShortcuts} />
      <ExportButton templateName={template.name} />
    </div>
  </header>
);

const NavRailContainer = ({
  visible,
  children,
}: {
  visible: boolean;
  children: ReactNode;
}): ReactElement => (
  <div
    inert={!visible}
    aria-hidden={!visible}
    className={cn(
      'h-full shrink-0 overflow-hidden transition-[width] duration-300 ease-out',
      visible ? 'w-[280px]' : 'w-0',
    )}
  >
    {children}
  </div>
);

const NavRail = ({
  template,
  async,
  slideIndex,
  onSelect,
}: {
  template: Template;
  async: AsyncDeckState;
  slideIndex: number;
  onSelect: (i: number) => void;
}): ReactElement => (
  <nav
    aria-label="Slides"
    className="h-full w-[280px] shrink-0 overflow-y-auto border-r border-border bg-paper py-5 pr-4 pl-1.5"
  >
    {async.status !== 'ready' ? (
      <div className="text-sm text-text-muted">Loading…</div>
    ) : (
      <ul role="list" className="flex flex-col gap-5">
        {async.composed.deck.slideOrder.map((slideId, i) => {
          const slide = async.composed.deck.slides.get(slideId);
          if (!slide) return null;
          const isActive = i === slideIndex;
          const thumbH = template.canvas.h * (THUMB_W / template.canvas.w);
          return (
            <li key={slideId}>
              <button
                type="button"
                onClick={() => onSelect(i)}
                aria-current={isActive ? 'true' : undefined}
                aria-label={`Slide ${i + 1}`}
                className="group flex w-full items-start gap-4 focus:outline-none focus-visible:outline-none"
              >
                <span
                  className={cn(
                    'w-7 shrink-0 pt-0.5 text-right text-sm font-medium tabular-nums',
                    isActive ? 'text-ink' : 'text-text-muted',
                  )}
                >
                  {i + 1}
                </span>
                <div
                  className={cn(
                    'overflow-hidden rounded-lg bg-surface transition-shadow',
                    isActive
                      ? 'ring-3 ring-focus'
                      : 'ring-1 ring-border group-hover:ring-border-strong group-focus-visible:ring-3 group-focus-visible:ring-focus',
                  )}
                  style={{ width: THUMB_W, height: thumbH }}
                >
                  <div
                    className="pointer-events-none origin-top-left"
                    style={{ transform: `scale(${THUMB_W / template.canvas.w})` }}
                  >
                    <SlideCanvas
                      slide={slide}
                      deck={async.composed.deck}
                      canvas={template.canvas}
                    />
                  </div>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    )}
  </nav>
);

const Viewport = ({
  template,
  async,
  slideIndex,
  containerRef,
  onUserZoom,
  wrapperRef,
  onTransform,
  onClampSlide,
}: {
  template: Template;
  async: AsyncDeckState;
  slideIndex: number;
  containerRef: React.RefObject<HTMLDivElement | null>;
  wrapperRef: React.MutableRefObject<ReactZoomPanPinchRef | null>;
  onTransform: (ref: ReactZoomPanPinchRef, state: { scale: number }) => void;
  onUserZoom: () => void;
  onClampSlide: (i: number) => void;
}): ReactElement => (
  <main ref={containerRef} className="relative min-w-0 flex-1 overflow-hidden">
    {async.status === 'pending' && (
      <Center>
        <ViewerStatus icon={<Spinner />} message="Composing deck…" />
      </Center>
    )}
    {async.status === 'error' && (
      <Center>
        <ErrorPanel error={async.error} />
      </Center>
    )}
    {async.status === 'ready' && (
      <ActiveSlide
        template={template}
        deck={async.composed.deck}
        slideIndex={slideIndex}
        containerEl={containerRef.current}
        wrapperRef={wrapperRef}
        onTransform={onTransform}
        onUserZoom={onUserZoom}
        onClampSlide={onClampSlide}
      />
    )}
  </main>
);

const ActiveSlide = ({
  template,
  deck,
  slideIndex,
  containerEl,
  wrapperRef,
  onTransform,
  onUserZoom,
  onClampSlide,
}: {
  template: Template;
  deck: FakeDeck;
  slideIndex: number;
  containerEl: HTMLDivElement | null;
  wrapperRef: React.MutableRefObject<ReactZoomPanPinchRef | null>;
  onTransform: (ref: ReactZoomPanPinchRef, state: { scale: number }) => void;
  onUserZoom: () => void;
  onClampSlide: (i: number) => void;
}): ReactElement | null => {
  const count = deck.slideOrder.length;
  const clamped = Math.max(0, Math.min(slideIndex, count - 1));

  useEffect(() => {
    if (clamped !== slideIndex) onClampSlide(clamped);
  }, [clamped, slideIndex, onClampSlide]);

  if (count === 0) {
    return (
      <Center>
        <ViewerStatus
          icon={<TriangleAlert className="size-4" />}
          message="This template renders zero slides."
        />
      </Center>
    );
  }

  const slideId = deck.slideOrder[clamped];
  const slide = slideId ? deck.slides.get(slideId) : undefined;
  if (!slide) return <Center>Slide not found.</Center>;

  const initialScale = containerEl ? computeFitScale(containerEl, template.canvas) : 1;

  return (
    <TransformWrapper
      key={clamped}
      ref={wrapperRef}
      initialScale={initialScale}
      minScale={MIN_SCALE}
      maxScale={MAX_SCALE}
      centerOnInit
      limitToBounds={false}
      doubleClick={{ disabled: true }}
      wheel={{ step: 0.04 }}
      onTransform={onTransform}
      onWheelStart={onUserZoom}
      onPinchStart={onUserZoom}
      onZoomStart={onUserZoom}
    >
      <TransformComponent
        wrapperClass="!w-full !h-full !cursor-grab active:!cursor-grabbing"
        contentClass="!shadow-[0_4px_32px_rgb(0_0_0_/_0.12)] ring-1 ring-black/5 rounded"
      >
        <div style={{ width: template.canvas.w, height: template.canvas.h }}>
          <SlideCanvas slide={slide} deck={deck} canvas={template.canvas} />
        </div>
      </TransformComponent>
    </TransformWrapper>
  );
};

const FloatingZoom = ({
  scale,
  isFit,
  onFit,
  onZoomIn,
  onZoomOut,
}: {
  scale: number;
  isFit: boolean;
  onFit: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
}): ReactElement => (
  <div className="pointer-events-none fixed right-4 bottom-4 z-10 flex items-center gap-1 rounded-full bg-paper p-1 shadow-[0_6px_24px_rgb(0_0_0_/_0.1),_0_2px_6px_rgb(0_0_0_/_0.06)] ring-1 ring-border [&_*]:pointer-events-auto">
    <IconButton icon={<Minus className="size-4" />} label="Zoom out" onClick={onZoomOut} />
    <button
      type="button"
      onDoubleClick={onFit}
      aria-label="Reset zoom to fit"
      title="Double-click to fit"
      className="min-w-12 cursor-default rounded-md px-1 py-2 text-center text-xs font-medium text-text-muted tabular-nums select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      {isFit ? 'Auto' : `${Math.round(scale * 100)}%`}
    </button>
    <IconButton icon={<Plus className="size-4" />} label="Zoom in" onClick={onZoomIn} />
    <IconButton icon={<Fullscreen className="size-4" />} label="Fit to viewport" onClick={onFit} />
  </div>
);

const ShortcutsDropdown = ({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}): ReactElement => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onToggle();
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, [open, onToggle]);

  return (
    <div ref={ref} className="relative">
      <TextButton
        icon={<Command className="size-4" />}
        selected={open}
        onClick={onToggle}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        Shortcuts
      </TextButton>
      {open && (
        <div
          role="dialog"
          aria-label="Keyboard shortcuts"
          className="absolute top-full right-0 z-20 mt-2 w-72 rounded-xl bg-paper p-5 shadow-[0_12px_40px_rgb(0_0_0_/_0.12),_0_4px_12px_rgb(0_0_0_/_0.08)] ring-1 ring-border"
        >
          <h2 className="mb-4 text-xs font-semibold tracking-wide text-text-muted uppercase">
            Keyboard shortcuts
          </h2>
          <ul role="list" className="flex flex-col gap-3">
            {SHORTCUT_LIST.map((s) => (
              <li key={s.label} className="flex items-center justify-between gap-3 text-xs">
                <span className="text-ink">{s.label}</span>
                <span className="flex shrink-0 items-center gap-1.5">
                  {s.keys.split(' ').map((token, i) => (
                    <ShortcutToken key={i} token={token} />
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

const ExportButton = ({ templateName }: { templateName: string }): ReactElement => {
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await fetch('/api/export.pptx');
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${templateName}.pptx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setExporting(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={exporting}
      className="inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-full bg-brand px-3 pl-2.5 text-xs font-medium text-paper transition-colors hover:bg-brand/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed"
    >
      <span className="relative inline-flex size-4 shrink-0 items-center justify-center">
        <Download
          className={cn(
            'absolute inset-0 size-4 transition-all duration-200',
            exporting ? 'scale-50 opacity-0' : 'scale-100 opacity-100',
          )}
        />
        <Loader2
          className={cn(
            'absolute inset-0 size-4 animate-spin transition-all duration-200',
            exporting ? 'scale-100 opacity-100' : 'scale-50 opacity-0',
          )}
        />
      </span>
      Export
    </button>
  );
};

const SHORTCUT_SEPARATORS = new Set(['/', '·', '•']);

const ShortcutToken = ({ token }: { token: string }) =>
  SHORTCUT_SEPARATORS.has(token) ? (
    <span className="text-xs text-text-muted">{token}</span>
  ) : (
    <Kbd>{token}</Kbd>
  );

const Center = ({ children }: { children: ReactNode }) => (
  <div className="flex h-full w-full items-center justify-center">{children}</div>
);

const ViewerStatus = ({ icon, message }: { icon: ReactNode; message: string }) => (
  <div className="flex items-center gap-3 text-sm text-text-muted">
    <span className="text-text-muted">{icon}</span>
    <span>{message}</span>
  </div>
);

const ErrorPanel = ({ error }: { error: Error }) => (
  <div className="max-w-xl rounded-lg border border-red-200 bg-red-50 p-4">
    <div className="flex items-center gap-2 text-red-700">
      <CircleAlert className="size-4 shrink-0" />
      <h2 className="text-sm font-semibold">{error.name}</h2>
    </div>
    <pre className="mt-2 font-mono text-sm whitespace-pre-wrap text-red-800">{error.message}</pre>
  </div>
);

const Spinner = () => (
  <span
    aria-hidden="true"
    className="inline-block size-4 animate-spin rounded-full border-2 border-border border-t-ink"
  />
);
