import { describe, expect, it } from 'vitest';
import { getMaterialCategory, CATEGORY_CODES } from '../src/logic/categories.js';

describe('getMaterialCategory', () => {
  it('returns FAA SIDES for FAA-prefixed materials', () => {
    expect(getMaterialCategory('FAA Maple', '')).toBe('FAA SIDES');
    expect(getMaterialCategory('something faa: stuff', '')).toBe('FAA SIDES');
  });

  it('returns MDF category for MDF/PBC/melamine/particle', () => {
    expect(getMaterialCategory('MDF 18mm', '')).toBe('MDF / PBC / PVC & TAPE SIDES');
    expect(getMaterialCategory('PBC 18mm', '')).toBe('MDF / PBC / PVC & TAPE SIDES');
    expect(getMaterialCategory('White Melamine', '')).toBe('MDF / PBC / PVC & TAPE SIDES');
    expect(getMaterialCategory('Particle Board', '')).toBe('MDF / PBC / PVC & TAPE SIDES');
  });

  it('returns MDF category when edge is PVC or tape', () => {
    expect(getMaterialCategory('Maple', 'PVC White')).toBe('MDF / PBC / PVC & TAPE SIDES');
    expect(getMaterialCategory('Maple', 'White Tape')).toBe('MDF / PBC / PVC & TAPE SIDES');
  });

  it('returns PLYWOOD SIDES for ply/birch', () => {
    expect(getMaterialCategory('Baltic Birch Ply', '')).toBe('PLYWOOD SIDES');
    expect(getMaterialCategory('Plywood', '')).toBe('PLYWOOD SIDES');
  });

  it('returns SOLID SIDES for solid wood species', () => {
    expect(getMaterialCategory('Solid Maple', '')).toBe('SOLID SIDES');
    expect(getMaterialCategory('Alder', '')).toBe('SOLID SIDES');
    expect(getMaterialCategory('Walnut', '')).toBe('SOLID SIDES');
    expect(getMaterialCategory('Oak', '')).toBe('SOLID SIDES');
    expect(getMaterialCategory('Cherry', '')).toBe('SOLID SIDES');
  });

  it('defaults to MDF category for empty/unknown materials', () => {
    expect(getMaterialCategory('', '')).toBe('MDF / PBC / PVC & TAPE SIDES');
    expect(getMaterialCategory('Unknown Stuff', '')).toBe('MDF / PBC / PVC & TAPE SIDES');
  });

  it('exposes stable category codes', () => {
    expect(CATEGORY_CODES['PLYWOOD SIDES']).toBe('PLY');
    expect(CATEGORY_CODES['FAA SIDES']).toBe('FAA');
    expect(CATEGORY_CODES['SOLID SIDES']).toBe('SLD');
    expect(CATEGORY_CODES['MDF / PBC / PVC & TAPE SIDES']).toBe('MDF');
  });
});
