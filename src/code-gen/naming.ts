/**
 * Component-name validation for the code-gen tools.
 *
 * Component names land in two places that constrain the legal alphabet:
 *
 * - As a TypeScript identifier (the exported React component and Zod schema).
 *   Must start with an uppercase ASCII letter; after that, letters and digits.
 * - As a filename under `src/components/` (`<Name>.tsx`). The TS identifier
 *   alphabet is already a strict subset of legal POSIX filenames, so the
 *   identifier check covers both.
 *
 * Reserving PascalCase is deliberate. Lower-case names would collide with
 * React's "lower-case = host element" convention and parse as DOM tags.
 */

const VALID = /^[A-Z][A-Za-z0-9]*$/;

/** Throws an `Error` with an agent-actionable message if `name` is invalid. */
export const assertValidComponentName = (name: string): void => {
  if (typeof name !== 'string' || name.length === 0) {
    throw new Error(`Component name is required (got: ${JSON.stringify(name)}).`);
  }
  if (!VALID.test(name)) {
    throw new Error(
      `Component name "${name}" is invalid. Use PascalCase: start with an uppercase letter, ` +
        `then letters and digits only. Example: "RevenueChart".`,
    );
  }
};
