export type ViewerUrlState = {
  readonly slide: number;
};

export const DEFAULT_URL_STATE: ViewerUrlState = { slide: 0 };

export const parseUrlState = (hash: string): ViewerUrlState => {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const raw = Number.parseInt(params.get('slide') ?? '', 10);
  const slide = Number.isFinite(raw) && raw >= 0 ? raw : 0;
  return { slide };
};

export const serializeUrlState = (state: ViewerUrlState): string => {
  if (state.slide === 0) return '';
  return `#slide=${state.slide}`;
};
