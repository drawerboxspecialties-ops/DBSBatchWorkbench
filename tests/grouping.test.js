import { describe, expect, it } from 'vitest';
import {
  splitDataIntoGroups,
  defaultFrontTopEdgesFromBacks,
  normalizeTopEdges,
  applyExclusions,
} from '../src/logic/grouping.js';
import { mapHeaders } from '../src/logic/headers.js';
import { parseCSV } from '../src/logic/csv.js';
import { DEMO_CSV } from '../src/logic/demoData.js';

function loadDemo() {
  const { headers, rows } = parseCSV(DEMO_CSV);
  const colIndices = mapHeaders(headers);
  normalizeTopEdges(rows, colIndices);
  defaultFrontTopEdgesFromBacks(rows, colIndices);
  return { headers, rows, colIndices };
}

describe('defaultFrontTopEdgesFromBacks (B-edge priority rule)', () => {
  it('changes matching front rows to match the back row top edge', () => {
    const cols = mapHeaders(['OrderNumber', 'MaterialName', 'PartName', 'W', 'Length', 'Quantity', 'Label', 'Width', 'TopEdge']);
    // F and B share order/material/length/height but disagree on edge
    const rows = [
      ['100', 'Baltic Birch', 'F', '4.5', '20', '1', '', '4.5', 'Raw Wood'],
      ['100', 'Baltic Birch', 'B', '4.5', '20', '1', '', '4.5', 'Clear Foil'],
    ];
    defaultFrontTopEdgesFromBacks(rows, cols);
    expect(rows[0][cols.topEdge]).toBe('Clear Foil');
    expect(rows[1][cols.topEdge]).toBe('Clear Foil');
  });

  it('does not change F when there is no matching B', () => {
    const cols = mapHeaders(['OrderNumber', 'MaterialName', 'PartName', 'W', 'Length', 'Quantity', 'Label', 'Width', 'TopEdge']);
    const rows = [
      ['100', 'Baltic Birch', 'F', '4.5', '20', '1', '', '4.5', 'Raw Wood'],
      ['101', 'Baltic Birch', 'B', '4.5', '20', '1', '', '4.5', 'Clear Foil'],
    ];
    defaultFrontTopEdgesFromBacks(rows, cols);
    expect(rows[0][cols.topEdge]).toBe('Raw Wood');
  });

  it('uses the single back edge for an order when the exact match key differs', () => {
    const cols = mapHeaders(['OrderNumber', 'MaterialName', 'PartName', 'W', 'Length', 'Quantity', 'Label', 'Width', 'TopEdge']);
    // Same order, only one back edge for the whole order -> applies to F even if length differs
    const rows = [
      ['100', 'Baltic Birch', 'F', '4.5', '20', '1', '', '4.5', 'Raw Wood'],
      ['100', 'Baltic Birch', 'B', '4.5', '30', '1', '', '4.5', 'Clear Foil'],
    ];
    defaultFrontTopEdgesFromBacks(rows, cols);
    expect(rows[0][cols.topEdge]).toBe('Clear Foil');
  });

  it('is a no-op when topEdge column is missing', () => {
    const cols = { orderNumber: 0, materialName: 1, partName: 2, topEdge: -1, length: 4, width: 7, w: 3 };
    const rows = [['100', 'Baltic Birch', 'F', '4.5', '20', '1', '', '4.5', 'Raw Wood']];
    expect(() => defaultFrontTopEdgesFromBacks(rows, cols)).not.toThrow();
  });
});

describe('splitDataIntoGroups (integration via demo CSV)', () => {
  it('groups the demo CSV into a PLY/CFB batch and an MDF/PVC batch', () => {
    const { rows, colIndices } = loadDemo();
    const groups = splitDataIntoGroups(rows, colIndices, 999, {});
    const keys = Object.keys(groups).sort();
    // PLY_CFB_601881 and MDF_PVC_601882
    expect(keys).toEqual(['MDF_PVC_601882', 'PLY_CFB_601881']);
  });

  it('computes totalBoxes using Math.ceil(parts/4)', () => {
    const { rows, colIndices } = loadDemo();
    const groups = splitDataIntoGroups(rows, colIndices, 999, {});
    const ply = groups['PLY_CFB_601881'];
    // Demo PLY parts: 40+8+4+24+4+16+8 = 104 parts -> ceil(104/4) = 26 boxes by order totals
    expect(ply.totalBoxes).toBe(26);
    expect(ply.totalParts).toBe(104);
  });

  it('merges duplicate rows with the same order/material/length/height/edge/part and sums quantity', () => {
    const { rows, colIndices } = loadDemo();
    const groups = splitDataIntoGroups(rows, colIndices, 999, {});
    const mdf = groups['MDF_PVC_601882'];
    const mergedQty = mdf.rows.reduce((sum, r) => sum + (parseInt(r[colIndices.quantity]) || 0), 0);
    expect(mdf.rows.length).toBe(2);
    expect(mergedQty).toBe(32);
    const parts = mdf.rows.map((r) => r[colIndices.partName]).sort();
    expect(parts).toEqual(['B', 'F']);
  });

  it('keeps each order in exactly one split batch', () => {
    const { rows, colIndices } = loadDemo();
    const groups = splitDataIntoGroups(rows, colIndices, 2, {});
    const plyKeys = Object.keys(groups).filter((k) => k.startsWith('PLY_CFB_'));
    const allOrders = plyKeys.flatMap((k) => groups[k].sortedOrders);
    expect(new Set(allOrders).size).toBe(allOrders.length);
  });

  it('respects per-group split limits', () => {
    const { rows, colIndices } = loadDemo();
    const groups = splitDataIntoGroups(rows, colIndices, 999, {
      'PLY_CFB_PF: 12MM Baltic Birch Ply_Clear Foil Bullnose': 1,
    });
    const plyKeys = Object.keys(groups).filter((k) => k.startsWith('PLY_CFB_'));
    plyKeys.forEach((k) => {
      expect(groups[k].sortedOrders.length).toBeLessThanOrEqual(1);
    });
  });

  it('stores pre-merge orderGroupBoxTotals when same dimensions span GroupIDs', () => {
    const headers = [
      'OrderNumber', 'MaterialName', 'PartName', 'W', 'Length', 'Quantity', 'Label', 'Width', 'TopEdge', 'GroupID',
    ];
    const cols = mapHeaders(headers);
    const mk = (groupId, qty) =>
      ['602336', 'PF: 12MM Baltic Birch Ply', 'F', '5', '33.938', String(qty), '', '5', 'Clear Foil Bullnose', groupId];
    const rows = [mk('2', 3), mk('3', 4)];
    const groups = splitDataIntoGroups(rows, cols, 999, {}, false);
    const batch = Object.values(groups)[0];
    expect(batch.rows).toHaveLength(1);
    expect(batch.orderGroupBoxTotals['602336']).toEqual([
      { groupId: '2', parts: 3, boxes: 1 },
      { groupId: '3', parts: 4, boxes: 1 },
    ]);
    expect(batch.orderColTotals['602336']).toBe(2);
  });

  it('matches orderColTotals to the sum of GroupID box counts', () => {
    const headers = [
      'OrderNumber', 'MaterialName', 'PartName', 'W', 'Length', 'Quantity', 'Label', 'Width', 'TopEdge', 'GroupID',
    ];
    const cols = mapHeaders(headers);
    const mk = (groupId) =>
      ['O1', 'PF: 12MM Baltic Birch Ply', 'F', '5', '10', '1', '', '5', 'Clear Foil Bullnose', groupId];
    const rows = [mk('1'), mk('2'), mk('3')];
    const groups = splitDataIntoGroups(rows, cols, 999, {}, false);
    const batch = Object.values(groups)[0];
    const groupSum = batch.orderGroupBoxTotals.O1.reduce((s, g) => s + g.boxes, 0);
    expect(batch.orderColTotals.O1).toBe(groupSum);
    expect(batch.orderColTotals.O1).toBe(3);
  });
});

describe('applyExclusions', () => {
  const cols = mapHeaders(['OrderNumber', 'MaterialName', 'PartName', 'W', 'Length', 'Quantity', 'Label', 'Width', 'TopEdge']);
  const rows = [
    ['100', 'Baltic Birch', 'F', '4.5', '20', '1', '', '4.5', 'Clear Foil'],
    ['101', 'MDF', 'F', '6', '24', '1', '', '6', 'PVC White Tape'],
  ];

  it('removes rows by order number', () => {
    expect(applyExclusions(rows, cols, { orders: ['100'] })).toHaveLength(1);
  });
  it('removes rows by material (case-insensitive)', () => {
    expect(applyExclusions(rows, cols, { materials: ['mdf'] })).toHaveLength(1);
  });
  it('removes rows by top edge (case-insensitive)', () => {
    expect(applyExclusions(rows, cols, { topEdges: ['clear foil'] })).toHaveLength(1);
  });
  it('returns all rows when no exclusions given', () => {
    expect(applyExclusions(rows, cols, {})).toHaveLength(2);
  });
  it('does not mutate the input array', () => {
    const copy = [...rows];
    applyExclusions(rows, cols, { orders: ['100'] });
    expect(rows).toEqual(copy);
  });
});
