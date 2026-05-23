import { describe, expect, test } from 'vitest';
import { parseUrlState, serializeUrlState } from './url-state.js';

describe('url-state', () => {
  test('empty hash → defaults', () => {
    expect(parseUrlState('')).toEqual({ slide: 0 });
  });

  test('round-trips slide', () => {
    expect(parseUrlState(serializeUrlState({ slide: 3 }))).toEqual({ slide: 3 });
  });

  test('omits default slide', () => {
    expect(serializeUrlState({ slide: 0 })).toBe('');
    expect(serializeUrlState({ slide: 2 })).toBe('#slide=2');
  });

  test('malformed slide → 0', () => {
    expect(parseUrlState('#slide=abc').slide).toBe(0);
    expect(parseUrlState('#slide=-1').slide).toBe(0);
  });
});
