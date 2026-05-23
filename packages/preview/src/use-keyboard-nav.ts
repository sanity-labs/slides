import { useEffect, useRef } from 'react';

export type KeyboardActions = {
  readonly onPrev: () => void;
  readonly onNext: () => void;
  readonly onFirst: () => void;
  readonly onLast: () => void;
  readonly onZoomIn: () => void;
  readonly onZoomOut: () => void;
  readonly onZoomFit: () => void;
  readonly onToggleNav: () => void;
  readonly onShowHelp: () => void;
};

const isTypingTarget = (el: EventTarget | null): boolean => {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
};

export const useKeyboardNav = (actions: KeyboardActions): void => {
  const ref = useRef(actions);
  ref.current = actions;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const handler = SHORTCUTS[e.key];
      if (!handler) return;
      e.preventDefault();
      handler(ref.current);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
};

const SHORTCUTS: Record<string, (a: KeyboardActions) => void> = {
  ArrowDown: (a) => a.onNext(),
  ArrowUp: (a) => a.onPrev(),
  ArrowRight: (a) => a.onNext(),
  ArrowLeft: (a) => a.onPrev(),
  j: (a) => a.onNext(),
  k: (a) => a.onPrev(),
  Home: (a) => a.onFirst(),
  End: (a) => a.onLast(),
  '0': (a) => a.onZoomFit(),
  '+': (a) => a.onZoomIn(),
  '=': (a) => a.onZoomIn(),
  '-': (a) => a.onZoomOut(),
  '[': (a) => a.onToggleNav(),
  '?': (a) => a.onShowHelp(),
};

export const SHORTCUT_LIST: ReadonlyArray<{ keys: string; label: string }> = [
  { keys: '↑ ↓ / j k', label: 'Previous / next slide' },
  { keys: 'Home / End', label: 'First / last slide' },
  { keys: '0', label: 'Auto zoom' },
  { keys: '+ / –', label: 'Zoom in / out' },
  { keys: '[', label: 'Toggle navigation' },
  { keys: '?', label: 'Show this help' },
];
