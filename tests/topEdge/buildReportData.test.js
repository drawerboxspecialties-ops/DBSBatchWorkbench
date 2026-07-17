import { describe, expect, it } from 'vitest';
import { buildReportData, getCategoryDisplayName, CATEGORIES } from '../../src/topEdge/logic/buildReportData.js';

// ---------------------------------------------------------------------------
// Category display names
// ---------------------------------------------------------------------------
describe('getCategoryDisplayName', () => {
  it('returns short names for known categories', () => {
    expect(getCategoryDisplayName('PLYWOOD SIDES')).toBe('Plywood');
    expect(getCategoryDisplayName('SOLID SIDES')).toBe('Solid');
    expect(getCategoryDisplayName('FAA SIDES')).toBe('FAA');
    expect(getCategoryDisplayName('MDF / PBC / PVC & TAPE SIDES')).toBe('MDF / PBC');
  });

  it('passes through unknown category keys', () => {
    expect(getCategoryDisplayName('CUSTOM')).toBe('CUSTOM');
  });

  it('exports the four expected category constants', () => {
    expect(CATEGORIES).toHaveLength(4);
    expect(CATEGORIES).toContain('PLYWOOD SIDES');
    expect(CATEGORIES).toContain('FAA SIDES');
    expect(CATEGORIES).toContain('SOLID SIDES');
    expect(CATEGORIES).toContain('MDF / PBC / PVC & TAPE SIDES');
  });
});

// ---------------------------------------------------------------------------
// Dimensional item math
// ---------------------------------------------------------------------------
describe('buildReportData — dimensional items', () => {
  it('computes perimeter, parts, LF, rips, and boxes for a simple dimensional item', () => {
    // width=10, depth=5, qty=2 → perimeter=30, totalInches=60, parts=8
    const items = [
      {
        qty: 2, width: 10, depth: 5, height: 5,
        topEdge: 'PVC Tape', material: 'White Melamine',
        orderId: '',
      },
    ];
    const { groups } = buildReportData(items);
    expect(groups).toHaveLength(1);
    const g = groups[0];
    // lf = ceil(60/12) = 5
    expect(g.lf).toBe(5);
    // ripSize for non-birch = 96.5; rips = ceil(60/96.5) = 1
    expect(g.rips).toBe(1);
    expect(g.ripSize).toBe('96.5"');
    // parts = qty*4 = 8; boxes = g.boxes = qty = 2
    expect(g.parts).toBe(8);
    expect(g.boxes).toBe(2);
    expect(g.category).toBe('MDF / PBC / PVC & TAPE SIDES');
  });

  it('uses 60" rip size for Baltic Birch non-FAA materials', () => {
    // totalInches = (2*10 + 2*8) * 1 = 36
    const items = [
      {
        qty: 1, width: 10, depth: 8, height: 5,
        topEdge: 'Clear Foil Bullnose', material: 'Baltic Birch Ply',
        orderId: '',
      },
    ];
    const { groups } = buildReportData(items);
    const g = groups[0];
    // rips = ceil(36/60) = 1
    expect(g.ripSize).toBe('60" (5x5)');
    expect(g.rips).toBe(1);
    expect(g.lf).toBe(3); // ceil(36/12)
  });

  it('aggregates multiple dimensional items with the same group key', () => {
    const items = [
      { qty: 1, width: 6, depth: 4, height: 5, topEdge: 'PVC Tape', material: 'White Melamine', orderId: '' },
      { qty: 2, width: 6, depth: 4, height: 5, topEdge: 'PVC Tape', material: 'White Melamine', orderId: '' },
    ];
    // perimeter = 20; totalInches = 20*1 + 20*2 = 60; parts = 4 + 8 = 12; boxes = 1+2 = 3
    const { groups } = buildReportData(items);
    expect(groups).toHaveLength(1);
    expect(groups[0].parts).toBe(12);
    expect(groups[0].boxes).toBe(3);
    expect(groups[0].lf).toBe(5); // ceil(60/12)
  });
});

// ---------------------------------------------------------------------------
// preCalculated item math
// ---------------------------------------------------------------------------
describe('buildReportData — preCalculated items', () => {
  it('uses preCalculated LF and rips directly', () => {
    const items = [
      {
        qty: 3, width: 0, depth: 0, height: 5,
        topEdge: 'Clear Foil Bullnose', material: 'White Melamine',
        parts: 12, lf: 7.3, rips: 2.1,
        preCalculated: true, orderId: '',
      },
    ];
    const { groups } = buildReportData(items);
    expect(groups).toHaveLength(1);
    const g = groups[0];
    // lf = ceil(7.3) = 8; rips = ceil(2.1) = 3
    expect(g.lf).toBe(8);
    expect(g.rips).toBe(3);
    // boxes = ceil(parts/4) = ceil(12/4) = 3
    expect(g.boxes).toBe(3);
    expect(g.parts).toBe(12);
  });

  it('sum-parts-then-ceil-boxes: accumulates parts across rows before ceiling division', () => {
    // Two rows: parts=5 and parts=3 → total parts=8 → boxes=ceil(8/4)=2
    // (NOT: ceil(5/4)+ceil(3/4) = 2+1 = 3)
    const items = [
      {
        qty: 2, width: 0, depth: 0, height: 5,
        topEdge: 'Clear Foil Bullnose', material: 'Baltic Birch Ply',
        parts: 5, lf: 4, rips: 1,
        preCalculated: true, orderId: '',
      },
      {
        qty: 1, width: 0, depth: 0, height: 5,
        topEdge: 'Clear Foil Bullnose', material: 'Baltic Birch Ply',
        parts: 3, lf: 2, rips: 1,
        preCalculated: true, orderId: '',
      },
    ];
    const { groups } = buildReportData(items);
    expect(groups).toHaveLength(1);
    const g = groups[0];
    expect(g.parts).toBe(8);
    expect(g.boxes).toBe(2); // ceil(8/4) = 2, NOT 2+1=3
    expect(g.lf).toBe(6);   // ceil(4+2)
    expect(g.rips).toBe(2); // ceil(1+1)
  });

  it('falls back to g.boxes when parts is 0 in a preCalculated group', () => {
    const items = [
      {
        qty: 4, width: 0, depth: 0, height: 5,
        topEdge: 'PVC Tape', material: 'White Melamine',
        parts: 0, lf: 3, rips: 1,
        preCalculated: true, orderId: '',
      },
    ];
    const { groups } = buildReportData(items);
    // hasPreCalculated=true but parts=0, so boxes = g.boxes = 4
    expect(groups[0].boxes).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Category routing
// ---------------------------------------------------------------------------
describe('buildReportData — category assignment', () => {
  it('routes FAA material to FAA SIDES regardless of edge', () => {
    const items = [{ qty: 1, width: 5, depth: 5, height: 5, topEdge: 'PVC Tape', material: 'FAA: Birch', orderId: '' }];
    const { groups } = buildReportData(items);
    expect(groups[0].category).toBe('FAA SIDES');
  });

  it('routes plywood to PLYWOOD SIDES', () => {
    const items = [{ qty: 1, width: 5, depth: 5, height: 5, topEdge: 'Clear Foil Bullnose', material: 'Baltic Birch Ply', orderId: '' }];
    const { groups } = buildReportData(items);
    expect(groups[0].category).toBe('PLYWOOD SIDES');
  });

  it('routes solid wood to SOLID SIDES', () => {
    const items = [{ qty: 1, width: 5, depth: 5, height: 5, topEdge: 'Clear Foil Bullnose', material: 'Maple Solid', orderId: '' }];
    const { groups } = buildReportData(items);
    expect(groups[0].category).toBe('SOLID SIDES');
  });

  it('routes plywood with PVC tape edge to MDF/PBC category', () => {
    const items = [{ qty: 1, width: 5, depth: 5, height: 5, topEdge: 'PVC White Tape', material: 'Baltic Birch Ply', orderId: '' }];
    const { groups } = buildReportData(items);
    expect(groups[0].category).toBe('MDF / PBC / PVC & TAPE SIDES');
  });

  it('flags unsupported top edge on MDF/PBC material', () => {
    const items = [{ qty: 1, width: 5, depth: 5, height: 5, topEdge: 'Clear Foil Bullnose', material: 'White Melamine', orderId: '' }];
    const { groups } = buildReportData(items);
    expect(groups[0].unsupportedTopEdge).toBe(true);
  });

  it('does not flag unsupported edge for non-MDF materials', () => {
    const items = [{ qty: 1, width: 5, depth: 5, height: 5, topEdge: 'Clear Foil Bullnose', material: 'Baltic Birch Ply', orderId: '' }];
    const { groups } = buildReportData(items);
    expect(groups[0].unsupportedTopEdge).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// groupedCategories structure
// ---------------------------------------------------------------------------
describe('buildReportData — groupedCategories', () => {
  it('returns an object with all four category keys', () => {
    const { groupedCategories } = buildReportData([]);
    expect(Object.keys(groupedCategories)).toEqual([
      'PLYWOOD SIDES', 'FAA SIDES', 'SOLID SIDES', 'MDF / PBC / PVC & TAPE SIDES',
    ]);
  });

  it('places groups into the correct category bucket', () => {
    const items = [
      { qty: 1, width: 5, depth: 5, height: 5, topEdge: 'Clear Foil Bullnose', material: 'Baltic Birch Ply', orderId: '' },
      { qty: 1, width: 5, depth: 5, height: 5, topEdge: 'PVC Tape', material: 'White Melamine', orderId: '' },
    ];
    const { groupedCategories } = buildReportData(items);
    expect(groupedCategories['PLYWOOD SIDES']).toHaveLength(1);
    expect(groupedCategories['MDF / PBC / PVC & TAPE SIDES']).toHaveLength(1);
    expect(groupedCategories['FAA SIDES']).toHaveLength(0);
    expect(groupedCategories['SOLID SIDES']).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Order ID tracking
// ---------------------------------------------------------------------------
describe('buildReportData — order ID tracking', () => {
  it('collects order IDs per group without duplicates', () => {
    const items = [
      { qty: 1, width: 5, depth: 5, height: 5, topEdge: 'PVC Tape', material: 'White Melamine', orderId: '1001' },
      { qty: 1, width: 5, depth: 5, height: 5, topEdge: 'PVC Tape', material: 'White Melamine', orderId: '1001' },
      { qty: 1, width: 5, depth: 5, height: 5, topEdge: 'PVC Tape', material: 'White Melamine', orderId: '1002' },
    ];
    const { groups } = buildReportData(items);
    expect(groups[0].orderIds).toHaveLength(2);
    expect(groups[0].orderIds).toContain('1001');
    expect(groups[0].orderIds).toContain('1002');
  });
});
