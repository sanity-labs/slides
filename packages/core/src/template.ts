import type { ComponentType, ReactNode } from 'react';
import type { z } from 'zod';
import type { FontStack } from './font-resolver.js';
import type { Canvas, Pt } from './geometry.js';
import type { HexColor } from './runtime.js';

export interface TemplateComponent<P = unknown> {
  component: ComponentType<P>;
  schema: z.ZodObject<z.ZodRawShape>;
  masterRef?: string;
  description: string;
}

export const defineTemplateComponent = <P>(spec: TemplateComponent<P>): TemplateComponent =>
  spec as TemplateComponent;

export interface TypographyToken {
  fontFamily: 'display' | 'body' | 'mono';
  fontSize: Pt;
  lineHeight: number;
  letterSpacing?: number;
  fontWeight?: number;
  textTransform?: 'none' | 'uppercase' | 'lowercase';
}

export interface Template {
  readonly name: string;
  readonly canvas: Canvas;
  readonly fonts: FontStack;
  readonly colors: Readonly<Record<string, HexColor>>;
  readonly typography: Readonly<Record<string, TypographyToken>>;
  readonly spacing: Readonly<Record<string, Pt>>;
  readonly components: Readonly<Record<string, TemplateComponent>>;
  readonly preview?: () => ReactNode;
}

export const defineTemplate = (template: Template): Template => template;
