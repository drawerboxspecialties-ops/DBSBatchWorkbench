import { describe, expect, it } from 'vitest';
import { scatterOrdersIntoChunks } from '../src/logic/splitOrders.js';

describe('split order distribution', () => {
  it('scatters orders round-robin without exceeding max order count', () => {
    const chunks = scatterOrdersIntoChunks(['100', '101', '102', '103', '104'], 2);
    expect(chunks).toEqual([['100', '103'], ['101', '104'], ['102']]);
  });

  it('keeps each order in exactly one split batch', () => {
    const chunks = scatterOrdersIntoChunks(['100', '101', '102', '103'], 2);
    const flattened = chunks.flat();
    expect(new Set(flattened).size).toBe(flattened.length);
    expect(flattened.sort()).toEqual(['100', '101', '102', '103']);
  });

  it('returns a single chunk when limit exceeds count', () => {
    const chunks = scatterOrdersIntoChunks(['100', '101'], 999);
    expect(chunks).toEqual([['100', '101']]);
  });

  it('handles a single order', () => {
    const chunks = scatterOrdersIntoChunks(['100'], 5);
    expect(chunks).toEqual([['100']]);
  });

  it('handles empty input', () => {
    const chunks = scatterOrdersIntoChunks([], 5);
    expect(chunks).toEqual([[]]);
  });

  it('treats invalid max as "use all"', () => {
    const chunks = scatterOrdersIntoChunks(['100', '101', '102'], NaN);
    expect(chunks).toEqual([['100', '101', '102']]);
  });

  it('respects a max of 1 (one order per batch)', () => {
    const chunks = scatterOrdersIntoChunks(['100', '101', '102'], 1);
    expect(chunks).toEqual([['100'], ['101'], ['102']]);
  });
});
