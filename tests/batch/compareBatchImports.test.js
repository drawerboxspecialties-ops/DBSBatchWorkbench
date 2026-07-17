import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  compareBatchImports,
  summarizeOpticutState,
  summarizeTopEdgeItems,
} from '../../src/batch/compareBatchImports.js';
import { parseCSV } from '../../src/logic/csv.js';
import { mapHeaders } from '../../src/logic/headers.js';
import {
  normalizeTopEdges,
  defaultFrontTopEdgesFromBacks,
  splitDataIntoGroups,
} from '../../src/logic/grouping.js';
import { parseTopEdgeCSV } from '../../src/topEdge/logic/parseTopEdgeCsv.js';
import { buildReportData } from '../../src/topEdge/logic/buildReportData.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function loadSampleSummaries() {
  const opticutText = fs.readFileSync(path.join(root, 'samples/OPTICUT.csv'), 'utf8');
  const topEdgeText = fs.readFileSync(path.join(root, 'samples/Top Edge Report.csv'), 'utf8');

  const { headers, rows } = parseCSV(opticutText);
  const colIndices = mapHeaders(headers);
  normalizeTopEdges(rows, colIndices);
  defaultFrontTopEdgesFromBacks(rows, colIndices);
  const splitGroups = splitDataIntoGroups(rows, colIndices, 999, {}, true, false);
  const opticut = summarizeOpticutState({ splitGroups, parsedRows: rows, colIndices });

  const parsed = parseTopEdgeCSV(topEdgeText);
  const report = buildReportData(parsed.items);
  const topEdge = summarizeTopEdgeItems(parsed.items, report.groups);

  return { opticut, topEdge };
}

describe('compareBatchImports', () => {
  it('waits until both sides are loaded', () => {
    const result = compareBatchImports(
      { loaded: true, orders: ['1'], totalParts: 4, totalBoxes: 1, byOrder: { 1: { parts: 4, boxes: 1 } } },
      { loaded: false, orders: [], totalParts: 0, totalBoxes: 0, byOrder: {} }
    );
    expect(result.ready).toBe(false);
    expect(result.issues.some((i) => i.code === 'TOPEDGE_MISSING')).toBe(true);
  });

  it('flags order set and total mismatches', () => {
    const result = compareBatchImports(
      {
        loaded: true,
        orders: ['100', '200'],
        totalParts: 8,
        totalBoxes: 2,
        byOrder: {
          100: { parts: 4, boxes: 1 },
          200: { parts: 4, boxes: 1 },
        },
      },
      {
        loaded: true,
        orders: ['100', '300'],
        totalParts: 12,
        totalBoxes: 3,
        byOrder: {
          100: { parts: 8, boxes: 2 },
          300: { parts: 4, boxes: 1 },
        },
      }
    );

    expect(result.ok).toBe(false);
    expect(result.errorCount).toBeGreaterThan(0);
    const codes = result.issues.map((i) => i.code);
    expect(codes).toContain('ORDERS_ONLY_OPTICUT');
    expect(codes).toContain('ORDERS_ONLY_TOPEDGE');
    expect(codes).toContain('TOTAL_PARTS_MISMATCH');
    expect(codes).toContain('TOTAL_BOXES_MISMATCH');
    expect(codes).toContain('ORDER_PARTS_MISMATCH');
  });

  it('passes the paired sample OPTICUT + Top Edge Report files', () => {
    const { opticut, topEdge } = loadSampleSummaries();
    const result = compareBatchImports(opticut, topEdge);

    expect(opticut.orders).toHaveLength(10);
    expect(topEdge.orders).toHaveLength(10);
    expect(result.ready).toBe(true);
    expect(result.errorCount).toBe(0);
    expect(result.ok).toBe(true);
    expect(result.totals.opticutParts).toBe(result.totals.topEdgeParts);
    expect(result.totals.opticutBoxes).toBe(result.totals.topEdgeBoxes);
    expect(result.issues.some((i) => i.code === 'BATCH_MATCH_OK')).toBe(true);
  });
});
