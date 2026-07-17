import { describe, expect, it } from 'vitest';
import { mapHeaders } from '../src/logic/headers.js';
import {
  buildOrderGroupBoxTotals,
  formatGroupBoxInBrackets,
  formatOrderCutListBoxSummary,
  formatOrderGroupBoxLabel,
  reconcileOrderColTotals,
} from '../src/logic/groupBoxes.js';

const headers = [
  'OrderNumber', 'MaterialName', 'PartName', 'W', 'Length', 'Quantity', 'Label', 'Width', 'TopEdge', 'GroupID',
];
const cols = mapHeaders(headers);

const row = (order, groupId, qty = 1, part = 'F') =>
  [order, 'PF: 12MM Baltic Birch Ply', part, '6', '25', String(qty), '', '6', 'Clear Foil Bullnose', groupId];

describe('buildOrderGroupBoxTotals', () => {
  it('returns separate box counts per GroupID within one order', () => {
    const batch = {
      rows: [
        row('602350', '1', 4),
        row('602350', '1', 4, 'B'),
        row('602350', '2', 8),
        row('602350', '2', 4, 'B'),
      ],
      orderColTotals: { 602350: 5 },
    };
    const totals = buildOrderGroupBoxTotals(batch, cols);
    expect(totals['602350']).toEqual([
      { groupId: '1', parts: 8, boxes: 2 },
      { groupId: '2', parts: 12, boxes: 3 },
    ]);
  });

  it('formats each GroupID as groupId-boxes pairs', () => {
    const batch = {
      rows: [row('602350', '1', 8), row('602350', '2', 4)],
      orderColTotals: { 602350: 3 },
    };
    expect(formatOrderGroupBoxLabel('602350', batch, cols)).toBe('1-2, 2-1');
  });

  it('lists all groups for orders with three or more GroupIDs', () => {
    const batch = {
      rows: [row('602336', '1', 8), row('602336', '2', 4), row('602336', '3', 4)],
      orderColTotals: { 602336: 5 },
      orderGroupBoxTotals: {
        602336: [
          { groupId: '1', parts: 8, boxes: 2 },
          { groupId: '2', parts: 4, boxes: 1 },
          { groupId: '3', parts: 4, boxes: 1 },
        ],
      },
    };
    expect(formatOrderGroupBoxLabel('602336', batch, cols)).toBe('1-2, 2-1, 3-1');
  });

  it('falls back to order total boxes when GroupID column is absent', () => {
    const basicCols = mapHeaders([
      'OrderNumber', 'MaterialName', 'PartName', 'W', 'Length', 'Quantity', 'Label', 'Width', 'TopEdge',
    ]);
    const batch = { rows: [['602350', 'Mat', 'F', '6', '25', '8', '', '6', 'Edge']], orderColTotals: { 602350: 2 } };
    expect(formatOrderGroupBoxLabel('602350', batch, basicCols)).toBe('2');
    expect(formatOrderCutListBoxSummary('602350', batch, basicCols)).toBe('2 boxes');
  });

  it('uses pre-merge orderGroupBoxTotals when rows merged across GroupIDs', () => {
    const batch = {
      rows: [row('602336', '2', 7, 'F')],
      orderColTotals: { 602336: 22 },
      orderGroupBoxTotals: {
        602336: [
          { groupId: '1', parts: 58, boxes: 15 },
          { groupId: '2', parts: 12, boxes: 3 },
          { groupId: '3', parts: 16, boxes: 4 },
        ],
      },
    };
    expect(formatOrderGroupBoxLabel('602336', batch, cols)).toBe('1-15, 2-3, 3-4');
  });
});

describe('cut-list box labels', () => {
  it('summarizes total boxes with per-GroupID counts in brackets', () => {
    const batch = {
      rows: [row('602350', '1', 8), row('602350', '2', 4)],
      orderColTotals: { 602350: 3 },
    };
    expect(formatOrderCutListBoxSummary('602350', batch, cols)).toBe('3 boxes (1-2, 2-1)');
  });

  it('shows GroupID with box count in brackets', () => {
    const batch = {
      rows: [row('602350', '1', 8), row('602350', '2', 4)],
      orderColTotals: { 602350: 3 },
    };
    expect(formatGroupBoxInBrackets('602350', '2', batch, cols)).toBe('2 (1)');
  });
});

describe('reconcileOrderColTotals', () => {
  it('sets order total to the sum of per-GroupID box counts', () => {
    const orderGroupBoxTotals = {
      O1: [
        { groupId: '1', parts: 1, boxes: 1 },
        { groupId: '2', parts: 1, boxes: 1 },
        { groupId: '3', parts: 1, boxes: 1 },
      ],
    };
    const reconciled = reconcileOrderColTotals({ O1: 1 }, orderGroupBoxTotals);
    expect(reconciled.O1).toBe(3);
  });

  it('leaves orders without GroupID data on ceil(parts/4) totals', () => {
    const reconciled = reconcileOrderColTotals({ O2: 5 }, {});
    expect(reconciled.O2).toBe(5);
  });
});
