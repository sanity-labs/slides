import { describe, expect, test } from 'vitest';
import { decodeAltText, encodeAltText, type SlotId } from './manifest.js';

describe('encodeAltText / decodeAltText', () => {
  test('round-trips a slot ID through the alt-text encoding', () => {
    const slotId: SlotId = 'cover:title';
    const encoded = encodeAltText(slotId);
    expect(encoded).toBe('rgs-slot:cover:title');
    expect(decodeAltText(encoded)).toBe(slotId);
  });

  test('returns undefined for an unmanaged alt-text caption', () => {
    expect(decodeAltText('Picture of a sunrise')).toBeUndefined();
    expect(decodeAltText('')).toBeUndefined();
    expect(decodeAltText(null)).toBeUndefined();
    expect(decodeAltText(undefined)).toBeUndefined();
  });

  test('rejects malformed payloads after the prefix', () => {
    // Missing colon between component and slot.
    expect(decodeAltText('rgs-slot:invalid')).toBeUndefined();
    // Disallowed characters (spaces, capitals).
    expect(decodeAltText('rgs-slot:Cover:Title')).toBeUndefined();
    expect(decodeAltText('rgs-slot:cover :title')).toBeUndefined();
    // Empty halves.
    expect(decodeAltText('rgs-slot::title')).toBeUndefined();
    expect(decodeAltText('rgs-slot:cover:')).toBeUndefined();
  });

  test('accepts hyphenated identifiers in both halves', () => {
    expect(decodeAltText('rgs-slot:two-column:left-body')).toBe('two-column:left-body');
  });
});
