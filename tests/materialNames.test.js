import { describe, expect, it } from 'vitest';
import { getExportMaterialName } from '../src/logic/materialNames.js';

describe('export material names', () => {
  it('removes trademark characters and keeps thickness at the end', () => {
    expect(getExportMaterialName('Baltic Birch™ Prefinished Ply 12M')).toBe('Baltic Birch Ply PF 12mm');
  });

  it('uses HRM for Hard rock Maple', () => {
    expect(getExportMaterialName('Hard rock Maple Melamine 15mm')).toBe('HRM Melamine 15mm');
  });

  it('uses HRM for Hard rock Melamine', () => {
    expect(getExportMaterialName('Hard rock Melamine 15mm')).toBe('HRM 15mm');
  });

  it('limits names to 32 characters', () => {
    expect(
      getExportMaterialName('Maple White Very Long Decorative Cabinet Grade Prefinished Plywood 12mm').length
    ).toBeLessThanOrEqual(32);
  });

  it('keeps thickness at the end after PF reorder', () => {
    expect(getExportMaterialName('Prefinished Baltic Birch Ply 12mm')).toBe('Baltic Birch Ply PF 12mm');
  });

  it('tolerates the common "prefinsihed" misspelling', () => {
    expect(getExportMaterialName('Prefinsihed Baltic Birch Ply 12mm')).toBe('Baltic Birch Ply PF 12mm');
  });

  it('expands 12M to 12mm', () => {
    expect(getExportMaterialName('Baltic Birch Ply 12M')).toBe('Baltic Birch Ply 12mm');
  });

  it('keeps 15mm as 15mm', () => {
    expect(getExportMaterialName('Hard rock Maple 15mm')).toBe('HRM 15mm');
  });

  it('strips commas from material name prefix (uses text before comma only)', () => {
    expect(getExportMaterialName('Baltic Birch, Prefinished 12mm')).toBe('Baltic Birch');
  });

  it('keeps names under 32 chars when already short', () => {
    expect(getExportMaterialName('Baltic Birch Ply 12mm')).toBe('Baltic Birch Ply 12mm');
  });

  it('handles empty input', () => {
    expect(getExportMaterialName('')).toBe('');
  });

  it('handles null input', () => {
    expect(getExportMaterialName(null)).toBe('');
  });
});
