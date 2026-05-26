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
  /**
   * Extra package specifiers an agent-authored Tier-2 custom component may
   * `import` from, on top of the base allowlist (`@sanity-labs/slides`,
   * `react`, `react/jsx-runtime`, `zod`). Use this to expose the template's
   * own brand-chrome helpers — a `<BrandSlide>` that wraps content with the
   * logo + footer, a `<TopLabel>` that positions an eyebrow at the canonical
   * spot — so custom slides match the curated ones visually.
   *
   * The template author opts in. The framework default stays
   * brand-locked-only (no template extras). Listing a specifier here does
   * **not** install or resolve the package; the deck project's
   * `node_modules` must contain it independently (typically because the
   * deck inherits the template's runtime dependencies).
   *
   * Surfaced through `slides_list({ detail: "detailed" })` so the agent
   * knows which extras it can reach for.
   */
  readonly additionalImportAllowlist?: ReadonlyArray<string>;
  /**
   * Template-specific design guidelines for the MCP agent.
   *
   * A markdown string that teaches the agent about the template's brand rules,
   * component usage patterns, do's and don'ts, and visual design constraints.
   * Surfaced through the `slides_guidelines` MCP tool so the agent can read
   * it once at session start.
   *
   * The framework's global SKILL.md teaches the general tool workflow;
   * the template's skill teaches brand-specific rules that layer on top.
   *
   * Keep it concise and actionable — this burns tokens on every session.
   */
  readonly skill?: string;
}

export const defineTemplate = (template: Template): Template => template;
