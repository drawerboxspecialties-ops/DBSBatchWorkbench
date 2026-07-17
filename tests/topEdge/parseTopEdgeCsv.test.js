import { describe, expect, it } from 'vitest';
import { parseTopEdgeCSV } from '../../src/topEdge/logic/parseTopEdgeCsv.js';

// ---------------------------------------------------------------------------
// Helpers for building minimal CSVs in tests
// ---------------------------------------------------------------------------
function makeCsv(header, ...rows) {
  return [header, ...rows].join('\n');
}

// ---------------------------------------------------------------------------
// Basic parsing
// ---------------------------------------------------------------------------
describe('parseTopEdgeCSV — basic parsing', () => {
  it('returns empty result for too-short input', () => {
    const result = parseTopEdgeCSV('');
    expect(result.items).toHaveLength(0);
    expect(result.orderIds).toHaveLength(0);
    expect(result.skippedRows).toBe(0);
  });

  it('returns empty result for header-only CSV', () => {
    const result = parseTopEdgeCSV('Order,Qty,Width,Depth,Height,Material,Edge\n');
    expect(result.items).toHaveLength(0);
  });

  it('parses a minimal dimensional row', () => {
    const csv = makeCsv(
      'Order,Qty,Width,Depth,Height,Material,Top Edge',
      '1001,2,10,8,5,Baltic Birch Ply,Clear Foil Bullnose'
    );
    const { items, orderIds } = parseTopEdgeCSV(csv);
    expect(items).toHaveLength(1);
    expect(items[0].qty).toBe(2);
    expect(items[0].width).toBe(10);
    expect(items[0].depth).toBe(8);
    expect(items[0].material).toBe('Baltic Birch Ply');
    expect(items[0].topEdge).toBe('Clear Foil Bullnose');
    expect(items[0].preCalculated).toBeUndefined();
    expect(orderIds).toContain('1001');
  });

  it('skips rows with zero qty/width/depth/height and no preCalc columns', () => {
    const csv = makeCsv(
      'Order,Qty,Width,Depth,Height,Material,Top Edge',
      '1001,0,0,0,0,White Melamine,PVC Tape'
    );
    const { items, skippedRows } = parseTopEdgeCSV(csv);
    expect(items).toHaveLength(0);
    expect(skippedRows).toBe(1);
  });

  it('collects unique order IDs from multiple rows', () => {
    const csv = makeCsv(
      'Order,Qty,Width,Depth,Height,Material,Top Edge',
      '1001,1,10,8,5,White Melamine,PVC Tape',
      '1002,1,10,8,5,White Melamine,PVC Tape',
      '1001,1,10,8,5,White Melamine,PVC Tape'
    );
    const { orderIds } = parseTopEdgeCSV(csv);
    expect(orderIds).toHaveLength(2);
    expect(orderIds).toContain('1001');
    expect(orderIds).toContain('1002');
  });
});

// ---------------------------------------------------------------------------
// preCalculated path
// ---------------------------------------------------------------------------
describe('parseTopEdgeCSV — preCalculated path', () => {
  it('takes the preCalculated path when LF/Rips/Parts are provided', () => {
    const csv = makeCsv(
      'Order,Qty,Height,Material,Top Edge,LF,Rips,Parts',
      '1001,3,5,Baltic Birch Ply,Clear Foil Bullnose,12.5,3,12'
    );
    const { items } = parseTopEdgeCSV(csv);
    expect(items).toHaveLength(1);
    expect(items[0].preCalculated).toBe(true);
    expect(items[0].lf).toBe(12.5);
    expect(items[0].rips).toBe(3);
    expect(items[0].parts).toBe(12);
    // qty (boxes) = ceil(12/4) = 3
    expect(items[0].qty).toBe(3);
  });

  it('sets boxes from qty when parts is 0 in preCalc path', () => {
    const csv = makeCsv(
      'Order,Qty,Height,Material,Top Edge,LF,Rips,Parts',
      '1001,5,5,White Melamine,PVC Tape,8,2,0'
    );
    const { items } = parseTopEdgeCSV(csv);
    expect(items[0].preCalculated).toBe(true);
    // parts=0 → boxes = max(1, qty) = max(1,5) = 5
    expect(items[0].qty).toBe(5);
    expect(items[0].parts).toBe(20); // boxes*4 = 5*4
  });
});

// ---------------------------------------------------------------------------
// getCutHeight applied to height column
// ---------------------------------------------------------------------------
describe('parseTopEdgeCSV — getCutHeight on height', () => {
  it('applies getCutHeight (ceil + allowance) to the raw height value', () => {
    // height=4.25, material=Baltic Birch Ply, edge=Clear Foil Bullnose → getCutHeight=5.2
    const csv = makeCsv(
      'Order,Qty,Width,Depth,Height,Material,Top Edge',
      '1001,1,10,8,4.25,Baltic Birch Ply,Clear Foil Bullnose'
    );
    const { items } = parseTopEdgeCSV(csv);
    expect(items[0].height).toBe(5.2);
  });

  it('applies plain ceiling for non-allowance materials', () => {
    // height=4.25, material=White Melamine, edge=PVC Tape → getCutHeight=5
    const csv = makeCsv(
      'Order,Qty,Width,Depth,Height,Material,Top Edge',
      '1001,1,10,8,4.25,White Melamine,PVC Tape'
    );
    const { items } = parseTopEdgeCSV(csv);
    expect(items[0].height).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// Inch-quote quirk
// ---------------------------------------------------------------------------
describe('parseTopEdgeCSV — inch-quote quirk', () => {
  it('handles inch symbols in unquoted cells without breaking column parsing', () => {
    // The parseCSVLine inch-quote quirk: 5.25" in a cell should parse as 5.25
    // (the " is stripped by parseFraction's replace rule)
    const csv = makeCsv(
      'Order,Qty,Width,Depth,Height,Material,Top Edge',
      '1001,1,10",8",5",White Melamine,PVC Tape'
    );
    const { items } = parseTopEdgeCSV(csv);
    expect(items).toHaveLength(1);
    expect(items[0].width).toBe(10);
    expect(items[0].depth).toBe(8);
  });
});

// ---------------------------------------------------------------------------
// Tab-delimited input
// ---------------------------------------------------------------------------
describe('parseTopEdgeCSV — tab delimiter', () => {
  it('auto-detects tab delimiter', () => {
    const csv = 'Order\tQty\tWidth\tDepth\tHeight\tMaterial\tTop Edge\n1001\t1\t10\t8\t5\tWhite Melamine\tPVC Tape';
    const { items, orderIds } = parseTopEdgeCSV(csv);
    expect(items).toHaveLength(1);
    expect(items[0].width).toBe(10);
    expect(orderIds).toContain('1001');
  });
});

// ---------------------------------------------------------------------------
// Adaptive column detection
// ---------------------------------------------------------------------------
describe('parseTopEdgeCSV — adaptive column detection', () => {
  it('detects numeric columns when headers do not match standard names', () => {
    // Non-standard headers; should fall back to adaptive detection
    const csv = makeCsv(
      'job,pieces,w,d,h,mat,edge',
      '1001,2,12,6,5,White Melamine,PVC Tape'
    );
    const { items } = parseTopEdgeCSV(csv);
    // Should find at least one valid item
    expect(items.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Materials list
// ---------------------------------------------------------------------------
describe('parseTopEdgeCSV — materials list', () => {
  it('returns unique material names found in imported rows', () => {
    const csv = makeCsv(
      'Order,Qty,Width,Depth,Height,Material,Top Edge',
      '1001,1,10,8,5,White Melamine,PVC Tape',
      '1002,1,10,8,5,Baltic Birch Ply,Clear Foil Bullnose',
      '1003,1,10,8,5,White Melamine,PVC Tape'
    );
    const { materials } = parseTopEdgeCSV(csv);
    expect(materials).toHaveLength(2);
    expect(materials).toContain('White Melamine');
    expect(materials).toContain('Baltic Birch Ply');
  });
});
