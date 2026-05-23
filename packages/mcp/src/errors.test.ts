import { describe, expect, test } from 'vitest';
import { z } from 'zod';
import { errorResult, formatZodIssue, zodErrorResult } from './errors.js';

describe('formatZodIssue', () => {
  test('formats a path-bearing issue', () => {
    const result = z.object({ a: z.object({ b: z.string() }) }).safeParse({ a: { b: 1 } });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues[0];
      if (!issue) throw new Error('expected at least one issue');
      const formatted = formatZodIssue(issue);
      expect(formatted.path).toBe('a.b');
      expect(formatted.message).toMatch(/string/i);
    }
  });

  test('uses (root) for top-level issues', () => {
    const result = z.string().safeParse(42);
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues[0];
      if (!issue) throw new Error('expected at least one issue');
      expect(formatZodIssue(issue).path).toBe('(root)');
    }
  });
});

describe('zodErrorResult', () => {
  test('returns isError: true with bullets and a hint', () => {
    const parse = z.object({ x: z.string() }).safeParse({});
    if (parse.success) throw new Error('expected failure');
    const result = zodErrorResult('Validation error in foo:', parse.error, 'Try again.');
    expect(result.isError).toBe(true);
    const text = result.content[0]?.text ?? '';
    expect(text).toMatch(/Validation error in foo/);
    expect(text).toMatch(/x:/);
    expect(text).toMatch(/Try again\./);
    expect(result.structuredContent.error.code).toBe('validation_error');
    expect(result.structuredContent.error.issues?.[0]?.path).toBe('x');
  });
});

describe('errorResult', () => {
  test('builds a generic actionable error', () => {
    const result = errorResult('boom', 'Something bad. Retry later.');
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toBe('Something bad. Retry later.');
    expect(result.structuredContent.error.code).toBe('boom');
  });
});
