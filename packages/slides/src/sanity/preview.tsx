import type { ReactElement } from 'react';
import { Agenda } from './components/Agenda.js';
import { Cover } from './components/Cover.js';
import { SectionDivider } from './components/SectionDivider.js';
import { OneColumn } from './components/OneColumn.js';
import { TitleAndGrid } from './components/TitleAndGrid.js';
import { Demo } from './components/Demo.js';
import { Closing } from './components/Closing.js';

export const preview = (): ReactElement => (
  <>
    <Cover
      eyebrow="EYEBROW"
      title="This is my deck’s first slide — expect more."
      subtitle="Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt."
    />
    <Agenda
      variant="detailed"
      slotPrefix="agenda-detailed"
      items={[
        {
          number: '01',
          title: 'What we heard from you',
          bullets: ['Align on priorities', 'Make sure we have it right'],
        },
        {
          number: '02',
          title: 'How Sanity solves it',
          bullets: [
            'The platform that matches how you work',
            'Evolution to AI content operations at scale',
          ],
        },
        {
          number: '03',
          title: 'See it live',
          bullets: ['A demo built around your use cases', 'QA time'],
        },
      ]}
    />
    <Agenda
      slotPrefix="agenda-simple"
      items={[
        { number: '01', title: 'First things first' },
        { number: '02', title: 'Second item to talk about' },
        { number: '03', title: 'See it live' },
        { number: '03', title: 'We exist for our customers' },
        { number: '03', title: 'We are pioneers' },
        { number: '03', title: 'Hel ved' },
        { number: '03', title: 'Type 2 fun' },
      ]}
    />
    <SectionDivider
      variant="orange-red"
      eyebrow="02"
      title="Title of upcoming part, can be long"
      slotPrefix="section-divider-orange"
    />
    <TitleAndGrid
      title="Here’s the thing"
      slotPrefix="two-column"
      cols={2}
      rows={1}
      cells={[
        {
          eyebrow: 'SUBTITLE',
          body: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt.',
        },
        {
          eyebrow: 'ANOTHER SUB',
          body: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt.',
        },
      ]}
    />
    <SectionDivider
      variant="blue"
      eyebrow="03"
      title="Break some rules"
      slotPrefix="section-divider-blue"
    />
    <OneColumn
      title="Structure powers intelligence"
      bodyEyebrow="SUBTITLE"
      body="Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat."
    />
    <TitleAndGrid
      title="Structure powers intelligence"
      slotPrefix="three-column-texture"
      cols={3}
      rows={1}
      cells={[
        {
          eyebrow: 'SUBTITLE',
          body: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.',
        },
        {
          eyebrow: 'SUBTITLE',
          body: 'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.',
        },
        {
          eyebrow: 'SUBTITLE',
          body: 'Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.',
        },
      ]}
    />
    <TitleAndGrid
      title="Structure powers intelligence"
      slotPrefix="six-cell-grid"
      cols={3}
      rows={2}
      cells={[
        {
          eyebrow: 'SUBTITLE',
          body: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor ut enim ad minim veniam',
        },
        {
          eyebrow: 'SUBTITLE',
          body: 'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.',
        },
        {
          eyebrow: 'SUBTITLE',
          body: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor ut enim ad minim veniam',
        },
        {
          eyebrow: 'SUBTITLE',
          body: 'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.',
        },
        {
          eyebrow: 'SUBTITLE',
          body: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor ut enim ad minim veniam',
        },
        {
          eyebrow: 'SUBTITLE',
          body: 'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.',
        },
      ]}
    />
    <TitleAndGrid
      title="Structure powers intelligence"
      slotPrefix="three-row"
      cols={1}
      rows={3}
      cells={[
        {
          eyebrow: 'SUBTITLE ONE',
          body: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt.',
        },
        {
          eyebrow: 'ANOTHER SUBTITLE',
          body: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt.',
        },
        {
          eyebrow: 'A THIRD SUBTITLE',
          body: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt.',
        },
      ]}
    />
    <Demo />
    <Closing />
  </>
);
