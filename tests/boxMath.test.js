import { describe, expect, it } from 'vitest';
import { boxesForParts, computeBoxMatrix } from '../src/logic/boxMath.js';

describe('boxesForParts', () => {
  it('uses Math.ceil(parts / 4) — the documented 4-parts-per-box rule', () => {
    expect(boxesForParts(0)).toBe(0);
    expect(boxesForParts(1)).toBe(1);
    expect(boxesForParts(4)).toBe(1);
    expect(boxesForParts(5)).toBe(2);
    expect(boxesForParts(8)).toBe(2);
    expect(boxesForParts(9)).toBe(3);
    expect(boxesForParts(40)).toBe(10);
  });

  it('coerces string input', () => {
    expect(boxesForParts('8')).toBe(2);
  });

  it('treats invalid input as 0 parts', () => {
    expect(boxesForParts('abc')).toBe(0);
    expect(boxesForParts(null)).toBe(0);
    expect(boxesForParts(undefined)).toBe(0);
  });
});

describe('computeBoxMatrix', () => {
  const sortedHeights = ['4', '9'];
  const sortedOrders = ['601881', '601883'];
  const summaryData = {
    '4': { '601881': 40, '601883': 4 },
    '9': { '601881': 8, '601883': 0 },
  };

  it('computes per-cell boxes via Math.ceil(parts/4)', () => {
    const { heightOrderBoxes } = computeBoxMatrix(sortedHeights, sortedOrders, summaryData);
    expect(heightOrderBoxes['4']['601881']).toBe(10); // ceil(40/4)
    expect(heightOrderBoxes['4']['601883']).toBe(1); // ceil(4/4)
    expect(heightOrderBoxes['9']['601881']).toBe(2); // ceil(8/4)
    expect(heightOrderBoxes['9']['601883']).toBe(0); // ceil(0/4)
  });

  it('sums row totals across orders per height', () => {
    const { heightRowTotals } = computeBoxMatrix(sortedHeights, sortedOrders, summaryData);
    expect(heightRowTotals['4']).toBe(11); // 10 + 1
    expect(heightRowTotals['9']).toBe(2); // 2 + 0
  });

  it('sums parts per order across heights', () => {
    const { orderPartTotals } = computeBoxMatrix(sortedHeights, sortedOrders, summaryData);
    expect(orderPartTotals['601881']).toBe(48); // 40 + 8
    expect(orderPartTotals['601883']).toBe(4); // 4 + 0
  });

  it('computes order column totals via Math.ceil(parts/4)', () => {
    const { orderColTotals } = computeBoxMatrix(sortedHeights, sortedOrders, summaryData);
    expect(orderColTotals['601881']).toBe(12); // ceil(48/4)
    expect(orderColTotals['601883']).toBe(1); // ceil(4/4)
  });

  it('totals all boxes across orders', () => {
    const { totalBoxes } = computeBoxMatrix(sortedHeights, sortedOrders, summaryData);
    expect(totalBoxes).toBe(13); // 12 + 1
  });

  it('handles empty input', () => {
    const result = computeBoxMatrix([], [], {});
    expect(result.totalBoxes).toBe(0);
    expect(result.heightOrderBoxes).toEqual({});
  });
});
