/**
 * The full pipeline from a list of slide specs to a `.pptx` file on disk.
 *
 * Shared by the `slides_create` MCP tool and the `generate` CLI subcommand a
 * template binary would normally ship. Both call this; both branch on the
 * tagged `Result` it returns.
 */

import { createElement, Fragment, type ReactElement, type ReactNode } from 'react';
import { renderToOps, ReconcilerError, type SlidesRuntime, type Template } from '../core/index.js';

/** One slide spec: which component, what props. */
export interface SlideSpec {
  readonly component: string;
  readonly props: Record<string, unknown>;
}

/** A field-level validation issue. */
export interface RenderIssue {
  readonly path: string;
  readonly message: string;
}

/** Result of a render. Tagged union for explicit branching. */
export type RenderResult =
  | { readonly ok: true; readonly filePath: string; readonly slideCount: number }
  | {
      readonly ok: false;
      readonly code:
        | 'unknown_component'
        | 'validation_error'
        | 'reconciler_error'
        | 'runtime_error';
      readonly message: string;
      readonly issues?: readonly RenderIssue[];
    };

/**
 * Render a list of slide specs to a `.pptx` file. Validates every spec
 * against its component's schema before constructing the tree.
 *
 * @param template - The template (slide-component vocabulary + tokens).
 * @param runtime  - The PPTX runtime to write through.
 * @param title    - Deck title (also the `.pptx` filename stem).
 * @param slides   - The slide specs, in order.
 */
export const renderSlides = async (params: {
  readonly template: Template;
  readonly runtime: SlidesRuntime;
  readonly title: string;
  readonly slides: ReadonlyArray<SlideSpec>;
}): Promise<RenderResult> => {
  const { template, runtime, title, slides } = params;

  const children: ReactNode[] = [];
  for (let i = 0; i < slides.length; i++) {
    const spec = slides[i];
    if (spec === undefined) continue;
    const component = template.components[spec.component];
    if (!component) {
      const known = Object.keys(template.components).sort().join(', ') || '(none)';
      return {
        ok: false,
        code: 'unknown_component',
        message:
          `slides[${i}].component "${spec.component}" is not a slide type in template ` +
          `"${template.name}". Known types: ${known}. Call slides_list to see them with descriptions.`,
      };
    }
    const parsed = component.schema.safeParse(spec.props);
    if (!parsed.success) {
      const issues: RenderIssue[] = parsed.error.issues.map((issue) => ({
        path: issue.path.length > 0 ? issue.path.map(String).join('.') : '(root)',
        message: issue.message,
      }));
      const bullets = issues.map((it) => `  • ${it.path}: ${it.message}`).join('\n');
      return {
        ok: false,
        code: 'validation_error',
        message: `Validation error in slides[${i}].props (slide type "${spec.component}"):\n${bullets}`,
        issues,
      };
    }
    children.push(createElement(component.component, { key: i, ...parsed.data }));
  }
  const tree: ReactElement = createElement(Fragment, null, ...children);

  try {
    const { deckId } = await runtime.createDeckFromMaster(template.name, title);
    const reconciled = renderToOps({ tree, template, deckId });
    await runtime.applyOps(deckId, reconciled.ops);
    runtime.attachManifest(deckId, reconciled.manifest);
    const { filePath } = await runtime.write(deckId);
    return { ok: true, filePath, slideCount: slides.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (err instanceof ReconcilerError) {
      return {
        ok: false,
        code: 'reconciler_error',
        message: `Reconciler rejected the slide tree: ${message}.`,
      };
    }
    return {
      ok: false,
      code: 'runtime_error',
      message: `Error generating PPTX: ${message}.`,
    };
  }
};
