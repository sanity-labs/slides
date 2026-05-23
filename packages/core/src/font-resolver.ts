/**
 * Synchronous font-role resolution at the reconciler boundary.
 *
 * The reconciler invokes `resolveFontRole` immediately before pushing
 * every text-style op, so downstream translators never see a role keyword
 * (`'display'`, `'body'`, `'mono'`) as a literal family.
 */

import type { FontRole } from './runtime.js';

/**
 * Per-role ordered preference. Earlier entries are higher fidelity. Templates
 * should always include a system-safe last entry (e.g., `"Arial"`).
 */
export interface FontStack {
  display: readonly string[];
  body: readonly string[];
  mono: readonly string[];
}

/** Configuration error: a role's preference list is empty. */
class EmptyFontStackError extends Error {
  constructor(role: string) {
    super(
      `FontStack.${role} is empty. Every role (display, body, mono) needs at least one font, with a system-safe last entry (e.g., "Arial").`,
    );
    this.name = 'EmptyFontStackError';
  }
}

/**
 * Resolve a font role to the brand's first-preference family.
 *
 * Strict-fails on an empty stack rather than silently picking Arial.
 *
 * @throws {EmptyFontStackError} if `stack[role]` is empty.
 */
export const resolveFontRole = (stack: FontStack, role: FontRole): string => {
  const first = stack[role][0];
  if (first === undefined) throw new EmptyFontStackError(role);
  return first;
};

/** Type guard: is `value` one of the reserved font role keywords? */
export const isFontRole = (value: string): value is FontRole =>
  value === 'display' || value === 'body' || value === 'mono';
