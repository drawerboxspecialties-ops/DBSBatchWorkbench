import { describe, expect, it } from 'vitest';
import {
  prepareBaseExportRow,
  getRoundedExportMergeKey,
  getCutListRowsForExport,
  getBatchExportRows,
  getExportCombineKey,
} from '../src/logic/exportRows.js';
import { mapHeaders, filterForExport } from '../src/logic/headers.js';
import { splitDataIntoGroups, normalizeTopEdges, defaultFrontTopEdgesFromBacks } from '../src/logic/grouping.js';

const cols = mapHeaders([
  'OrderNumber',
  'MaterialName',
  'PartName',
  'W',
  'Length',
  'Quantity',
  'Label',
  'Width',
  'TopEdge',
]);

describe('prepareBaseExportRow', () => {
  it('cleans the material name', () => {
    const row = ['100', 'Baltic Birch™ Prefinished Ply 12M', 'F', '4.5', '20', '1', '1.2', '4.5', 'Clear Foil'];
    const out = prepareBaseExportRow(row, cols, false);
    expect(out[cols.materialName]).toBe('Baltic Birch Ply PF 12mm');
  });
  it('blanks W and Label', () => {
    const row = ['100', 'Baltic Birch Ply 12mm', 'F', '4.5', '20', '1', '1.2', '4.5', 'Clear Foil'];
    const out = prepareBaseExportRow(row, cols, false);
    expect(out[cols.w]).toBe('');
    expect(out[cols.label]).toBe('');
  });
  it('rounds Width up when roundWidth is true', () => {
    const row = ['100', 'Baltic Birch Ply 12mm', 'F', '4.5', '20', '1', '1.2', '3.937', 'Clear Foil'];
    const out = prepareBaseExportRow(row, cols, true);
    expect(out[cols.width]).toBe('4');
  });
  it('keeps original Width when roundWidth is false', () => {
    const row = ['100', 'Baltic Birch Ply 12mm', 'F', '4.5', '20', '1', '1.2', '3.937', 'Clear Foil'];
    const out = prepareBaseExportRow(row, cols, false);
    expect(out[cols.width]).toBe('3.937');
  });
  it('does not mutate the input row', () => {
    const row = ['100', 'Baltic Birch™ Ply 12mm', 'F', '4.5', '20', '1', '1.2', '4.5', 'Clear Foil'];
    const original = [...row];
    prepareBaseExportRow(row, cols, false);
    expect(row).toEqual(original);
  });
});

describe('getRoundedExportMergeKey', () => {
  it('excludes Quantity and Label from the key', () => {
    const a = ['100', 'Mat', 'F', '', '20', '1', 'L1', '4', 'CFB'];
    const b = ['100', 'Mat', 'F', '', '20', '99', 'L2', '4', 'CFB'];
    expect(getRoundedExportMergeKey(a, cols)).toBe(getRoundedExportMergeKey(b, cols));
  });
});

describe('getCutListRowsForExport — rounded-width export', () => {
  it('merges rows that become identical after rounding and sums quantities', () => {
    const rows = [
      ['100', 'Baltic Birch Ply 12mm', 'F', '4.5', '20', '8', '1.2', '3.937', 'Clear Foil'],
      ['100', 'Baltic Birch Ply 12mm', 'F', '4.5', '20', '4', '1.2', '4.000000', 'Clear Foil'],
    ];
    const out = getCutListRowsForExport(rows, cols, true);
    expect(out).toHaveLength(1);
    expect(out[0][cols.quantity]).toBe('12');
    expect(out[0][cols.width]).toBe('4');
  });

  it('records original width quantities in Label when widths differ from rounded width', () => {
    const rows = [
      ['100', 'Baltic Birch Ply 12mm', 'F', '4.5', '20', '8', '1.2', '3.937', 'Clear Foil'],
      ['100', 'Baltic Birch Ply 12mm', 'F', '4.5', '20', '4', '1.2', '4.000000', 'Clear Foil'],
    ];
    const out = getCutListRowsForExport(rows, cols, true);
    expect(out[0][cols.label]).toContain('Rounded from Width');
    expect(out[0][cols.label]).toContain('3.937 x8');
    expect(out[0][cols.label]).toContain('4 x4');
  });

  it('leaves Label blank when no rounding difference occurred', () => {
    const rows = [
      ['100', 'Baltic Birch Ply 12mm', 'F', '4.5', '20', '8', '1.2', '4.000000', 'Clear Foil'],
    ];
    const out = getCutListRowsForExport(rows, cols, true);
    expect(out[0][cols.label]).toBe('');
  });

  it('blanks W on every exported row', () => {
    const rows = [
      ['100', 'Baltic Birch Ply 12mm', 'F', '4.5', '20', '8', '1.2', '4.000000', 'Clear Foil'],
    ];
    const out = getCutListRowsForExport(rows, cols, true);
    expect(out[0][cols.w]).toBe('');
  });
});

describe('getCutListRowsForExport — non-rounded export', () => {
  it('keeps original widths and does not merge', () => {
    const rows = [
      ['100', 'Baltic Birch Ply 12mm', 'F', '4.5', '20', '8', '1.2', '3.937', 'Clear Foil'],
      ['100', 'Baltic Birch Ply 12mm', 'F', '4.5', '20', '4', '1.2', '4.000000', 'Clear Foil'],
    ];
    const out = getCutListRowsForExport(rows, cols, false);
    expect(out).toHaveLength(2);
    expect(out[0][cols.width]).toBe('3.937');
    expect(out[0][cols.label]).toBe('');
  });
});

describe('filterForExport', () => {
  const headers = [
    'OrderNumber', 'MaterialName', 'PartName', 'W', 'Length', 'Quantity', 'Label', 'Width', 'TopEdge',
    'GroupID', 'Laser', 'Scoop', 'Slope', 'DrillFront', 'DividersFB', 'DividersSS', 'FileSlots', 'Ship Date',
  ];
  const row = [
    '602350', 'PF: 12MM Baltic Birch Ply', 'F', '6', '25', '1', '', '6', 'Clear Foil Bullnose',
    'GRP-1', 'Yes', 'None', 'Type #1', '#1 2 Hole', '1 - Removable', '1 - Fixed', '1" Letter', '6/15/2026',
  ];

  it('removes GroupID and all batching-only secondary-operation columns', () => {
    const { headers: outHeaders, rows } = filterForExport(headers, [row]);
    expect(outHeaders).toEqual([
      'OrderNumber', 'MaterialName', 'PartName', 'W', 'Length', 'Quantity', 'Label', 'Width', 'TopEdge',
    ]);
    expect(rows[0][0]).toBe('602350');
  });

  it('merges rows that differ only in batching-only columns when rounding export', () => {
    const extendedCols = mapHeaders(headers);
    const rowA = [...row];
    const rowB = [...row];
    rowB[extendedCols.laser] = 'No';
    rowB[extendedCols.scoop] = 'Type #2';
    const out = getCutListRowsForExport([rowA, rowB], extendedCols, true, headers);
    const filtered = filterForExport(headers, out);
    expect(filtered.rows).toHaveLength(1);
    expect(filtered.rows[0][extendedCols.quantity]).toBe('2');
  });
});

describe('getBatchExportRows', () => {
  it('prefers sourceRows over merged batch rows', () => {
    const sourceRows = [['602437', 'Mat', 'F', '5', '8.75', '1', '51', '6', 'Edge']];
    const mergedRows = [['602437', 'Mat', 'F', '5', '8.75', '4', '', '6', 'Edge']];
    expect(getBatchExportRows({ sourceRows, rows: mergedRows })).toBe(sourceRows);
  });

  it('falls back to rows when sourceRows are absent', () => {
    const mergedRows = [['602437', 'Mat', 'B', '5', '8.75', '1', '', '6', 'Edge']];
    expect(getBatchExportRows({ rows: mergedRows })).toBe(mergedRows);
  });
});

describe('getCutListRowsForExport — preserves part sides', () => {
  const headers = [
    'OrderNumber', 'MaterialName', 'PartName', 'W', 'Length', 'Quantity', 'Label', 'Width', 'TopEdge', 'GroupID',
  ];
  const extendedCols = mapHeaders(headers);

  function drawerRow(part, label, length, drawerWidth, w = drawerWidth, qty = 1) {
    return [
      '602437',
      'PBC: 1/2" White Melamine',
      part,
      String(w),
      String(length),
      String(qty),
      label,
      String(drawerWidth),
      'PVC Flat Flush',
      '1',
    ];
  }

  it('combines F+B as F and L+R as L when exported Width and Length match', () => {
    const sourceRows = [
      drawerRow('F', '51', '8.75', '6', '5.687'),
      drawerRow('B', '51', '8.75', '6', '5.687'),
      drawerRow('L', '51', '15.063', '6', '5.75'),
      drawerRow('R', '51', '15.063', '6', '5.75'),
    ];
    const out = getCutListRowsForExport(sourceRows, extendedCols, true, headers);
    const parts = out.map((r) => r[extendedCols.partName]).sort();
    expect(parts).toEqual(['F', 'L']);
    expect(out.find((r) => r[extendedCols.partName] === 'F')[extendedCols.quantity]).toBe('2');
    expect(out.find((r) => r[extendedCols.partName] === 'L')[extendedCols.quantity]).toBe('2');
  });

  it('keeps F and B separate when exported Width differs', () => {
    const sourceRows = [
      drawerRow('F', '1', '13.375', '4', '3.437'),
      drawerRow('B', '1', '13.375', '3', '2.437'),
    ];
    const out = getCutListRowsForExport(sourceRows, extendedCols, true, headers);
    const parts = out.map((r) => r[extendedCols.partName]).sort();
    expect(parts).toEqual(['B', 'F']);
  });

  it('exports all drawer widths from grouped sourceRows (602437-style)', () => {
    const sourceRows = [
      drawerRow('F', '51', '8.75', '6'),
      drawerRow('B', '51', '8.75', '6'),
      drawerRow('L', '51', '15.063', '6'),
      drawerRow('R', '51', '15.063', '6'),
      drawerRow('F', '51/2', '8.75', '8.5', '8.437', 2),
      drawerRow('B', '51/2', '8.75', '8.5', '8.437', 2),
      drawerRow('L', '51/2', '15.063', '8.5', '8.5', 2),
      drawerRow('R', '51/2', '15.063', '8.5', '8.5', 2),
      drawerRow('F', '15', '10.25', '8.5', '8.437'),
      drawerRow('B', '15', '10.25', '8.5', '8.437'),
      drawerRow('L', '15', '21.063', '8.5', '8.5'),
      drawerRow('R', '15', '21.063', '8.5', '8.5'),
    ];
    normalizeTopEdges(sourceRows, extendedCols);
    defaultFrontTopEdgesFromBacks(sourceRows, extendedCols);
    const groups = splitDataIntoGroups(sourceRows, extendedCols, 999, {}, false);
    const batch = Object.values(groups)[0];
    const exportRows = getCutListRowsForExport(
      getBatchExportRows(batch),
      extendedCols,
      true,
      headers
    );
    const { rows } = filterForExport(headers, exportRows);
    const widths = new Set(rows.map((r) => r[extendedCols.width]));
    expect(widths.has('6')).toBe(true);
    expect(widths.has('9')).toBe(true);
    const totalQty = rows.reduce((sum, r) => sum + (parseInt(r[extendedCols.quantity]) || 0), 0);
    expect(totalQty).toBe(16);
    const partNames = new Set(rows.map((r) => r[extendedCols.partName]));
    expect(partNames.has('F')).toBe(true);
    expect(partNames.has('L')).toBe(true);
    expect(partNames.has('B')).toBe(false);
    expect(partNames.has('R')).toBe(false);
  });
});

describe('combineOppositePartSides', () => {
  it('builds a combine key without PartName, Quantity, or Label', () => {
    const row = ['100', 'Mat', 'F', '', '20', '4', 'note', '6', 'PVC'];
    const key = getExportCombineKey(row, cols);
    expect(key).not.toContain('F');
    expect(key).toContain('20');
    expect(key).toContain('6');
  });
});
