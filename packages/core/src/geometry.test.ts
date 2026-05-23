import { describe, expect, test } from 'vitest';
import {
  CANVAS_16_9,
  CANVAS_4_3,
  EMU_PER_INCH,
  EMU_PER_POINT,
  PT_PER_INCH,
  inToEmu,
  inToPt,
  ptToEmu,
  ptToIn,
} from './geometry.js';

describe('constants', () => {
  test('EMU_PER_POINT is 914400 / 72', () => {
    expect(EMU_PER_POINT * PT_PER_INCH).toBe(EMU_PER_INCH);
  });
});

describe('ptToEmu', () => {
  test('0 pt → 0 EMU', () => {
    expect(ptToEmu(0)).toBe(0);
  });
  test('1 pt → 12700 EMU', () => {
    expect(ptToEmu(1)).toBe(12_700);
  });
  test('72 pt → 914400 EMU (1 inch)', () => {
    expect(ptToEmu(72)).toBe(EMU_PER_INCH);
  });
  test('rounds half-units consistently', () => {
    expect(ptToEmu(0.5)).toBe(6_350);
    expect(ptToEmu(0.25)).toBe(3_175);
  });
});

describe('inToEmu / inToPt / ptToIn', () => {
  test('1 inch round-trip pt→in→pt', () => {
    expect(ptToIn(inToPt(1))).toBe(1);
  });
  test('inToEmu(1) === ptToEmu(72)', () => {
    expect(inToEmu(1)).toBe(ptToEmu(72));
  });
});

describe('Canvas constants', () => {
  test('16:9 is 960×540 pt', () => {
    expect(CANVAS_16_9.w).toBe(960);
    expect(CANVAS_16_9.h).toBe(540);
  });
  test('16:9 EMU is precomputed correctly', () => {
    expect(CANVAS_16_9.emuW).toBe(ptToEmu(960));
    expect(CANVAS_16_9.emuH).toBe(ptToEmu(540));
  });
  test('4:3 is 720×540 pt', () => {
    expect(CANVAS_4_3.w).toBe(720);
    expect(CANVAS_4_3.h).toBe(540);
  });
});
