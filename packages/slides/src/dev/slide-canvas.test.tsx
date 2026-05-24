import { describe, expect, test } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement, Fragment } from 'react';
import { Slide, Box, Text } from '../core/components.js';
import { CANVAS_16_9 } from '../core/geometry.js';
import type { Template } from '../core/template.js';
import { composeDeck } from './compose-deck.js';
import { SlideCanvas } from './slide-canvas.js';

const STUB_TEMPLATE: Template = {
  name: 'stub',
  canvas: CANVAS_16_9,
  fonts: { display: ['Inter'], body: ['Inter'], mono: ['Courier'] },
  colors: {},
  typography: {},
  spacing: {},
  components: {},
};

const renderHtml = async () => {
  const { deck } = await composeDeck({
    tree: createElement(
      Fragment,
      null,
      createElement(
        Slide,
        null,
        createElement(Box, {
          rect: { x: 0, y: 0, w: 960, h: 540 },
          fill: { kind: 'solid', color: '#000000' },
        }),
        createElement(
          Box,
          { rect: { x: 20, y: 100, w: 400, h: 80 } },
          createElement(
            Text,
            { textStyle: { fontFamily: 'Inter', fontSize: 36, foregroundColor: '#ffffff' } },
            'Hello world',
          ),
        ),
      ),
    ),
    template: STUB_TEMPLATE,
  });

  const slide = deck.slides.get(deck.slideOrder[0] as string);
  if (!slide) throw new Error('no slide');
  return renderToStaticMarkup(createElement(SlideCanvas, { slide, deck, canvas: CANVAS_16_9 }));
};

describe('<SlideCanvas>', () => {
  test('renders shapes at the slide coordinate space', async () => {
    const html = await renderHtml();
    expect(html).toContain('background:#000000');
    expect(html).toContain('left:0px');
    expect(html).toContain('top:0px');
    expect(html).toContain('left:20px');
  });

  test('emits text content with style spans applied', async () => {
    const html = await renderHtml();
    expect(html).toContain('Hello world');
    expect(html).toContain('color:#ffffff');
    expect(html).toContain('font-size:36px');
  });
});
