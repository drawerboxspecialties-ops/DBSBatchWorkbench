import { describe, expect, it } from 'vitest';
import {
  formatInches,
  getCutHeight,
  getCutOptimizationGroups,
  getMaterialCategory,
  getOptimizedSheetTotal,
  getSheetWidth,
  isMdfPbcMaterial,
  isUnsupportedMdfPbcTopEdge,
  materialGetsTopEdgeAllowance,
  packRipHeights,
  parseFraction,
  topEdgeGetsAllowance,
} from '../../src/topEdge/logic/calculatorLogic.js';

describe('dimension parsing and formatting', () => {
  it('parses whole numbers, decimals, fractions, and mixed fractions', () => {
    expect(parseFraction('5')).toBe(5);
    expect(parseFraction('5.25')).toBe(5.25);
    expect(parseFraction('1/2')).toBe(0.5);
    expect(parseFraction('5 1/2"')).toBe(5.5);
    expect(parseFraction('5-1/2')).toBe(5.5);
  });

  it('returns zero for unusable dimensions', () => {
    expect(parseFraction('')).toBe(0);
    expect(parseFraction('bad')).toBe(0);
    expect(parseFraction('1/0')).toBe(0);
  });

  it('formats inches without trailing zeros', () => {
    expect(formatInches(5)).toBe('5');
    expect(formatInches(5.5)).toBe('5.5');
    expect(formatInches(5.125)).toBe('5.13');
  });

  it('adds top edge allowance only for machined solid, plywood, and FAA edges', () => {
    expect(materialGetsTopEdgeAllowance('PF: 12MM Baltic Birch Ply')).toBe(true);
    expect(materialGetsTopEdgeAllowance('Maple Solid')).toBe(true);
    expect(materialGetsTopEdgeAllowance('FAA: Birch')).toBe(true);
    expect(materialGetsTopEdgeAllowance('White Melamine')).toBe(false);

    expect(topEdgeGetsAllowance('Clear Foil Bullnose')).toBe(true);
    expect(topEdgeGetsAllowance('Flat Foil')).toBe(true);
    expect(topEdgeGetsAllowance('PVC Tape')).toBe(false);
    expect(topEdgeGetsAllowance('PF Wood Tape')).toBe(false);
    expect(topEdgeGetsAllowance('Flat PVC')).toBe(false);
    expect(topEdgeGetsAllowance('PVC Flat Flush')).toBe(false);

    expect(getCutHeight(4.25, 'Clear Foil Bullnose', 'PF: 12MM Baltic Birch Ply')).toBe(5.2);
    expect(getCutHeight(5, 'Flat Foil', 'Maple Solid')).toBe(5.2);
    expect(getCutHeight(5.01, 'Clear Foil Bullnose', 'FAA: Birch')).toBe(6.2);
    expect(getCutHeight(5, 'PVC Tape', 'PF: 12MM Baltic Birch Ply')).toBe(5);
    expect(getCutHeight(5, 'Flat PVC', 'PBC White')).toBe(5);
    expect(getCutHeight(5, 'PVC Flat Flush', 'MDF Black')).toBe(5);
    expect(getCutHeight(5.01, 'PF Wood Tape', 'PF: 12MM Baltic Birch Ply')).toBe(6);
    expect(getCutHeight(5.01, 'Clear Foil Bullnose', 'White Melamine')).toBe(6);
  });

  it('flags bullnose flat and foil top edges as unsupported for MDF PBC materials', () => {
    expect(isMdfPbcMaterial('White Melamine')).toBe(true);
    expect(isMdfPbcMaterial('PBC White')).toBe(true);
    expect(isMdfPbcMaterial('MDF Black')).toBe(true);
    expect(isUnsupportedMdfPbcTopEdge('White Melamine', 'Clear Foil Bullnose')).toBe(true);
    expect(isUnsupportedMdfPbcTopEdge('PBC White', 'Flat Foil')).toBe(true);
    expect(isUnsupportedMdfPbcTopEdge('MDF Black', 'PVC Tape')).toBe(false);
    expect(isUnsupportedMdfPbcTopEdge('PBC White', 'Flat PVC')).toBe(false);
    expect(isUnsupportedMdfPbcTopEdge('MDF Black', 'PVC Flat Flush')).toBe(false);
    expect(isUnsupportedMdfPbcTopEdge('PBC White', 'Edgeband')).toBe(false);
  });
});

describe('material rules', () => {
  it('uses 60 inch sheets for birch or explicit 60 marker', () => {
    expect(getSheetWidth('Baltic Birch Ply')).toBe(60);
    expect(getSheetWidth('Plywood (60)')).toBe(60);
  });

  it('uses 48 inch sheets by default', () => {
    expect(getSheetWidth('White Melamine')).toBe(48);
  });

  it('categorizes materials and edge overrides consistently', () => {
    expect(getMaterialCategory('FAA: Birch', 'Clear Foil Bullnose')).toBe('FAA SIDES');
    expect(getMaterialCategory('Baltic Birch Ply', 'Clear Foil Bullnose')).toBe('PLYWOOD SIDES');
    expect(getMaterialCategory('Maple Solid', 'Clear Foil Bullnose')).toBe('SOLID SIDES');
    expect(getMaterialCategory('Baltic Birch Ply', 'PVC White Tape')).toBe('MDF / PBC / PVC & TAPE SIDES');
    expect(getMaterialCategory('White Melamine', 'Clear Foil Bullnose')).toBe('MDF / PBC / PVC & TAPE SIDES');
  });
});

describe('cut optimization rules', () => {
  it('packs rip heights into sheets using usable width and kerf', () => {
    const sheets = packRipHeights([20, 20, 10], 48, 0.188);
    expect(sheets).toHaveLength(2);
    expect(sheets[0].rips).toEqual([20, 20]);
    expect(sheets[1].rips).toEqual([10]);
  });

  it('skips cut optimization for solid and FAA sides', () => {
    expect(getCutOptimizationGroups([{ height: 5, rips: 1, material: 'Maple', topEdge: 'Raw' }], 'SOLID SIDES')).toEqual([]);
    expect(getCutOptimizationGroups([{ height: 5, rips: 1, material: 'FAA Birch', topEdge: 'Raw' }], 'FAA SIDES')).toEqual([]);
  });

  it('groups optimization by material, top edge, and sheet width', () => {
    const rows = [
      { height: 10, rips: 2, material: 'Baltic Birch Ply', topEdge: 'Clear Foil Bullnose' },
      { height: 12, rips: 1, material: 'Baltic Birch Ply', topEdge: 'Clear Foil Bullnose' },
    ];
    const groups = getCutOptimizationGroups(rows, 'PLYWOOD SIDES');

    expect(groups).toHaveLength(1);
    expect(groups[0].sheetWidth).toBe(60);
    expect(groups[0].usableWidth).toBe(59.5);
    expect(getOptimizedSheetTotal(rows, 'PLYWOOD SIDES')).toBe(groups[0].sheets.length);
  });

  it('keeps optimization groups for the same material together by top edge', () => {
    const rows = [
      { height: 8, rips: 1, material: 'Maple Ply', topEdge: 'PVC Tape' },
      { height: 8, rips: 1, material: 'Baltic Birch Ply', topEdge: 'PF Wood Tape' },
      { height: 6, rips: 1, material: 'Baltic Birch Ply', topEdge: 'PVC Tape' },
    ];
    const groups = getCutOptimizationGroups(rows, 'PLYWOOD SIDES');

    expect(groups.map(group => `${group.material} / ${group.topEdge}`)).toEqual([
      'Baltic Birch Ply / PF Wood Tape',
      'Baltic Birch Ply / PVC Tape',
      'Maple Ply / PVC Tape',
    ]);
  });
});
