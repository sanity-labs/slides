import '../../styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { DeckViewer } from '../../deck-viewer.js';
// @ts-expect-error -- resolved at runtime by the dev-server Vite plugin
import { template } from 'virtual:slides-dev/template';

const node = document.getElementById('root');
if (!node) throw new Error('slides-dev: missing #root in index.html');

createRoot(node).render(
  <StrictMode>
    <DeckViewer template={template} />
  </StrictMode>,
);
