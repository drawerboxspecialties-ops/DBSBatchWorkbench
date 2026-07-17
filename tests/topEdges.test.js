import { describe, expect, it } from 'vitest';
import { getEdgeCode, normalizeTopEdgeName } from '../src/logic/topEdges.js';

describe('top edge cleanup', () => {
  it('maps Bullnose FA Finished to Bullnose Clear Foil', () => {
    expect(normalizeTopEdgeName('Bullnose FA Finished.')).toBe('Bullnose Clear Foil');
  });

  it('removes trademark characters and special punctuation', () => {
    expect(normalizeTopEdgeName('PVC® Edge!!')).toBe('PVC Edge');
  });

  it('collapses extra spaces', () => {
    expect(normalizeTopEdgeName('Clear   Foil   Bullnose')).toBe('Clear Foil Bullnose');
  });

  it('keeps clear foil edge code stable', () => {
    expect(getEdgeCode('Bullnose Clear Foil')).toBe('CFB');
  });

  it('returns PVC code for PVC edges', () => {
    expect(getEdgeCode('PVC White Tape')).toBe('PVC');
  });

  it('returns TPE code for tape edges', () => {
    expect(getEdgeCode('White Tape')).toBe('TPE');
  });

  it('returns RAW code for raw/wood edges', () => {
    expect(getEdgeCode('Raw Wood')).toBe('RAW');
  });

  it('falls back to first 4 letters for unknown edges', () => {
    expect(getEdgeCode('Alder')).toBe('ALDE');
  });

  it('falls back to EDG for empty input', () => {
    expect(getEdgeCode('')).toBe('EDG');
  });

  it('handles null input', () => {
    expect(normalizeTopEdgeName(null)).toBe('');
    expect(getEdgeCode(null)).toBe('EDG');
  });
});
