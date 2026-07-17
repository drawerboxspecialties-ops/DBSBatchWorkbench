import { describe, expect, it } from 'vitest';
import { encodeCode128Values, buildCode128Svg } from '../src/logic/code128.js';

describe('encodeCode128Values', () => {
  it('encodes batch keys with start, checksum, and stop', () => {
    const values = encodeCode128Values('PLY_PVC_602480');
    expect(values).not.toBeNull();
    expect(values[0]).toBe(104); // Start B
    expect(values[values.length - 1]).toBe(106); // Stop
    expect(values.length).toBe(1 + 'PLY_PVC_602480'.length + 1 + 1);
  });

  it('rejects empty or non-ASCII text', () => {
    expect(encodeCode128Values('')).toBeNull();
    expect(encodeCode128Values('café')).toBeNull();
  });
});

describe('buildCode128Svg', () => {
  it('returns an SVG with bars for a batch key', () => {
    const svg = buildCode128Svg('FAA_CFB_602648');
    expect(svg).toContain('<svg');
    expect(svg).toContain('<rect');
    expect(svg).toContain('FAA_CFB_602648');
  });
});
