import { describe, expect, it } from 'vitest';
import {
  buildOrderShipDateMap,
  shipDateGroupingToken,
  formatShipDateLabel,
  formatCombinedShipDateLabel,
  collectUniqueShipDates,
} from '../src/logic/shipDate.js';
import { mapHeaders } from '../src/logic/headers.js';
import { splitDataIntoGroups } from '../src/logic/grouping.js';
import { applyBatchOrderExclusions, batchOrderKey } from '../src/logic/batchOrders.js';
import { filterForExport } from '../src/logic/headers.js';

const headers = [
  'OrderNumber', 'MaterialName', 'PartName', 'W', 'Length', 'Quantity', 'Label', 'Width', 'TopEdge', 'Ship Date',
];
const cols = mapHeaders(headers);

const row = (order, shipDate, part = 'F') =>
  [order, 'PF: 12MM Baltic Birch Ply', part, '6', '25', '1', '', '6', 'Clear Foil Bullnose', shipDate];

describe('shipDate helpers', () => {
  it('detects Ship Date column', () => {
    expect(cols.shipDate).toBe(9);
  });

  it('builds one ship date per order', () => {
    const rows = [row('100', '6/15/2026'), row('100', '6/15/2026', 'B')];
    expect(buildOrderShipDateMap(rows, cols)['100']).toBe('6/15/2026');
  });

  it('uses No Ship Date token when column exists but value is blank', () => {
    expect(shipDateGroupingToken('100', { 100: '' }, cols)).toBe('_No Ship Date');
  });
});

describe('splitDataIntoGroups with ship date', () => {
  it('splits orders with different ship dates into separate batches', () => {
    const rows = [
      row('100', '6/15/2026'),
      row('101', '6/22/2026'),
    ];
    const groups = splitDataIntoGroups(rows, cols, 999, {}, false);
    const keys = Object.keys(groups);
    expect(keys.length).toBe(2);
    const dates = keys.map((k) => groups[k].shipDate).sort();
    expect(dates).toEqual(['6/15/2026', '6/22/2026']);
  });

  it('combines orders with different ship dates when combineShipDates is true', () => {
    const rows = [
      row('100', '6/15/2026'),
      row('101', '6/22/2026'),
    ];
    const groups = splitDataIntoGroups(rows, cols, 999, {}, false, true);
    expect(Object.keys(groups).length).toBe(1);
    expect(groups[Object.keys(groups)[0]].shipDate).toBe('6/15/2026, 6/22/2026');
  });
});

describe('formatCombinedShipDateLabel', () => {
  it('lists unique ship dates sorted for a batch', () => {
    const rows = [row('100', '6/22/2026'), row('101', '6/15/2026')];
    const map = buildOrderShipDateMap(rows, cols);
    expect(formatCombinedShipDateLabel(rows, cols, map)).toBe('6/15/2026, 6/22/2026');
    expect(collectUniqueShipDates(rows, cols, map)).toEqual(['6/15/2026', '6/22/2026']);
  });
});

describe('applyBatchOrderExclusions', () => {
  it('removes an order from one batch without affecting grouping keys', () => {
    const rows = [row('100', '6/15/2026'), row('101', '6/15/2026')];
    const groups = splitDataIntoGroups(rows, cols, 999, {}, false);
    const batchKey = Object.keys(groups)[0];
    const sourceGroupKey = groups[batchKey].sourceGroupKey;
    const exclusions = new Set([batchOrderKey(sourceGroupKey, '101')]);
    const filtered = applyBatchOrderExclusions(groups, exclusions, cols);
    const next = filtered[batchKey];
    expect(next.sortedOrders).toEqual(['100']);
    expect(next.totalParts).toBe(1);
  });
});

describe('filterForExport', () => {
  it('excludes Ship Date from export', () => {
    const rows = [row('100', '6/15/2026')];
    const { headers: outHeaders } = filterForExport(headers, rows);
    expect(outHeaders).not.toContain('Ship Date');
    expect(outHeaders.length).toBe(9);
  });
});

describe('formatShipDateLabel', () => {
  it('returns null when column is absent', () => {
    const basic = mapHeaders(['OrderNumber', 'MaterialName', 'PartName', 'W', 'Length', 'Quantity', 'Label', 'Width', 'TopEdge']);
    expect(formatShipDateLabel('6/15/2026', basic)).toBeNull();
  });

  it('returns null when ship date is blank (print stays empty)', () => {
    expect(formatShipDateLabel('', cols)).toBeNull();
    expect(formatShipDateLabel('   ', cols)).toBeNull();
  });

  it('returns the date when present', () => {
    expect(formatShipDateLabel('6/15/2026', cols)).toBe('6/15/2026');
  });
});
