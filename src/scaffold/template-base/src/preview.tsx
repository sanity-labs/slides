import type { ReactElement } from 'react';
import { Cover } from './components/Cover.js';

export const preview = (): ReactElement => (
  <>
    <Cover title="Hello, __NAME__" subtitle="A @sanity-labs/slides template." />
    <Cover title="Edit me" subtitle="src/preview.tsx" />
  </>
);
