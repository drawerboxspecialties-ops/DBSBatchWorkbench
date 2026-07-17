import { describe, expect, it } from 'vitest';
import { getCutListPrintSections, getDifferentFrontMaterialKeys, dfmDrawerKey } from '../src/logic/cutListPrint.js';
import { mapHeaders } from '../src/logic/headers.js';

const headers = [
  'OrderNumber',
  'MaterialName',
  'PartName',
  'W',
  'Length',
  'Quantity',
  'Label',
  'Width',
  'TopEdge',
  'GroupID',
  'Scoop',
  'Slope',
  'DrillFront',
  'DividersFB',
  'DividersSS',
  'FileSlots',
];
const cols = mapHeaders(headers);

function row({
  order,
  part,
  length,
  qty,
  w,
  drawerWidth,
  groupId = '',
  label = '',
  scoop = 'None',
}) {
  const partW = w ?? drawerWidth ?? '6';
  const height = drawerWidth ?? w ?? '6';
  return [
    order,
    'PF: 12MM Baltic Birch Ply',
    part,
    String(partW),
    String(length),
    String(qty),
    label,
    String(height),
    'Clear Foil Bullnose',
    groupId,
    scoop,
    'None',
    'None',
    'None',
    'None',
    'None',
  ];
}

describe('getCutListPrintSections', () => {
  it('puts one rounded width and paired FB/LR lengths on each box row', () => {
    const batch = {
      sourceRows: [
        row({ order: '602350', part: 'F', w: '5', length: '24.125', qty: 4, drawerWidth: '5', groupId: '2', label: '2. 3' }),
        row({ order: '602350', part: 'B', w: '5', length: '24.125', qty: 4, drawerWidth: '5', groupId: '2', label: '2. 3' }),
        row({ order: '602350', part: 'L', w: '4.9375', length: '17.6875', qty: 4, drawerWidth: '5', groupId: '2', label: '2. 3' }),
        row({ order: '602350', part: 'R', w: '4.9375', length: '17.6875', qty: 4, drawerWidth: '5', groupId: '2', label: '2. 3' }),
      ],
    };
    const sections = getCutListPrintSections(batch, cols);
    expect(sections[0].rows).toHaveLength(1);
    expect(sections[0].rows[0]).toMatchObject({
      parts: 16,
      boxes: 4,
      groupId: '2',
      width: '5',
      fbLength: '24.125',
      lrLength: '17.6875',
    });
  });

  it('rounds drawer width up once per row', () => {
    const batch = {
      sourceRows: [
        row({ order: '601881', part: 'F', length: '22', qty: 4, drawerWidth: '9.5', groupId: '1' }),
        row({ order: '601881', part: 'B', length: '22', qty: 4, drawerWidth: '9.5', groupId: '1' }),
      ],
    };
    const sections = getCutListPrintSections(batch, cols);
    expect(sections[0].rows[0]).toMatchObject({
      width: '10',
      fbLength: '22',
      lrLength: '',
    });
  });

  it('sums total parts on the line and derives box count', () => {
    const batch = {
      sourceRows: [
        row({ order: '601881', part: 'F', length: '22', qty: 4, groupId: '1' }),
        row({ order: '601881', part: 'B', length: '22', qty: 4, groupId: '1' }),
      ],
    };
    const sections = getCutListPrintSections(batch, cols);
    expect(sections[0].rows).toHaveLength(1);
    expect(sections[0].rows[0].parts).toBe(8);
    expect(sections[0].rows[0].boxes).toBe(2);
    expect(sections[0].rows[0].fbLength).toBe('22');
  });

  it('keeps all sides on one row for a label group even when drawer heights differ', () => {
    const batch = {
      sourceRows: [
        row({ order: '602016', part: 'F', w: '4.5', length: '18', qty: 8, drawerWidth: '10', label: '1.2' }),
        row({ order: '602016', part: 'L', w: '4.5', length: '18', qty: 4, drawerWidth: '5', label: '1.2' }),
        row({ order: '602016', part: 'R', w: '4.5', length: '18', qty: 16, drawerWidth: '8', label: '1.2' }),
      ],
    };
    const sections = getCutListPrintSections(batch, cols);
    expect(sections[0].rows).toHaveLength(1);
    expect(sections[0].rows[0]).toMatchObject({
      parts: 28,
      boxes: 7,
      width: '10',
      fbLength: '18',
      lrLength: '18',
    });
  });

  it('keeps separate rows when GroupID differs', () => {
    const batch = {
      sourceRows: [
        row({ order: '601881', part: 'F', length: '22', qty: 4, groupId: '1' }),
        row({ order: '601881', part: 'F', length: '22', qty: 2, groupId: '2' }),
      ],
    };
    const sections = getCutListPrintSections(batch, cols);
    expect(sections[0].rows).toHaveLength(2);
    expect(sections[0].rows.map((r) => r.groupId)).toEqual(['1', '2']);
  });

  it('sorts GroupIDs in numeric sequence within each order', () => {
    const batch = {
      sourceRows: [
        row({ order: '602336', part: 'F', length: '34', qty: 4, groupId: '3' }),
        row({ order: '602336', part: 'F', length: '22', qty: 4, groupId: '1' }),
        row({ order: '602336', part: 'F', length: '18', qty: 4, groupId: '2' }),
      ],
    };
    const sections = getCutListPrintSections(batch, cols);
    expect(sections[0].rows.map((r) => r.groupId)).toEqual(['1', '2', '3']);
  });

  it('creates separate rows for multiple front sizes in the same GroupID', () => {
    const batch = {
      sourceRows: [
        row({ order: '601881', part: 'F', length: '30', qty: 4, drawerWidth: '8', groupId: '1' }),
        row({ order: '601881', part: 'F', length: '22', qty: 8, drawerWidth: '8', groupId: '1' }),
        row({ order: '601881', part: 'L', w: '4.5', length: '20', qty: 8, drawerWidth: '8', groupId: '1' }),
        row({ order: '601881', part: 'R', w: '4.5', length: '18', qty: 12, drawerWidth: '8', groupId: '1' }),
      ],
    };
    const sections = getCutListPrintSections(batch, cols);
    expect(sections[0].rows).toHaveLength(2);
    expect(sections[0].rows[0].fbLength).toBe('30');
    expect(sections[0].rows[1].fbLength).toBe('22');
  });

  it('flags only the group with scoop as special, not every row on the order', () => {
    const batch = {
      sourceRows: [
        row({ order: '602336', part: 'F', length: '34', qty: 4, groupId: '3', scoop: '#4  4" x 1"' }),
        row({ order: '602336', part: 'F', length: '22', qty: 4, groupId: '1' }),
      ],
    };
    const sections = getCutListPrintSections(batch, cols);
    expect(sections).toHaveLength(1);
    expect(sections[0].special).toBe(true);
    expect(sections[0].rows.find((r) => r.groupId === '3')?.special).toBe(true);
    expect(sections[0].rows.find((r) => r.groupId === '1')?.special).toBe(false);
  });

  it('does not flag a group special for drill front alone', () => {
    const drillRow = row({ order: '601881', part: 'F', length: '22', qty: 4, groupId: '1' });
    drillRow[cols.drillFront] = '#1  2 Hole';
    const batch = { sourceRows: [drillRow] };
    const sections = getCutListPrintSections(batch, cols);
    expect(sections[0].rows[0].special).toBe(false);
  });

  it('skips rows with zero quantity, missing length, or unknown part', () => {
    const batch = {
      sourceRows: [
        row({ order: '601881', part: 'F', length: '22', qty: 0, groupId: '1' }),
        row({ order: '601881', part: 'F', length: '', qty: 4, groupId: '1' }),
        row({ order: '601881', part: 'Cleat', length: '22', qty: 4, groupId: '1' }),
        row({ order: '601881', part: 'F', length: '22', qty: 4, groupId: '1' }),
      ],
    };
    const sections = getCutListPrintSections(batch, cols);
    expect(sections[0].rows).toHaveLength(1);
    expect(sections[0].rows[0].parts).toBe(4);
    expect(sections[0].rows[0].boxes).toBe(1);
  });

  it('falls back to merged rows when sourceRows are absent', () => {
    const batch = {
      rows: [row({ order: '601881', part: 'F', length: '22', qty: 4, groupId: '1' })],
    };
    const sections = getCutListPrintSections(batch, cols);
    expect(sections[0].rows).toHaveLength(1);
    expect(sections[0].rows[0].parts).toBe(4);
    expect(sections[0].rows[0].boxes).toBe(1);
  });

  it('treats generic Side parts as left/right stack', () => {
    const batch = {
      sourceRows: [
        row({ order: '601881', part: 'F', length: '22', qty: 4, groupId: '1' }),
        row({ order: '601881', part: 'Side', length: '18', qty: 4, groupId: '1' }),
      ],
    };
    const sections = getCutListPrintSections(batch, cols);
    expect(sections[0].rows[0].lrLength).toBe('18');
  });

  it('merges identical cut lines into one row', () => {
    const batch = {
      sourceRows: [
        row({ order: '601881', part: 'F', length: '22', qty: 4, groupId: '1' }),
        row({ order: '601881', part: 'F', length: '22', qty: 4, groupId: '1' }),
      ],
    };
    const sections = getCutListPrintSections(batch, cols);
    expect(sections[0].rows).toHaveLength(1);
    expect(sections[0].rows[0].parts).toBe(8);
    expect(sections[0].rows[0].boxes).toBe(2);
  });

  it('treats each Label as its own drawer when GroupID is shared (602437-style)', () => {
    function drawer({ label, w, length, drawerWidth, qty = 1 }) {
      const partW = w ?? drawerWidth;
      return [
        row({ order: '602437', part: 'F', w: partW, length, qty, drawerWidth, groupId: '1', label }),
        row({ order: '602437', part: 'B', w: partW, length, qty, drawerWidth, groupId: '1', label }),
        row({ order: '602437', part: 'L', w: partW, length, qty, drawerWidth, groupId: '1', label }),
        row({ order: '602437', part: 'R', w: partW, length, qty, drawerWidth, groupId: '1', label }),
      ];
    }
    const sourceRows = [
      ...drawer({ label: '51', w: '5.687', length: '8.75', drawerWidth: '6' }),
      ...drawer({ label: '12', w: '5.687', length: '8.75', drawerWidth: '6' }),
      ...drawer({ label: '15', w: '8.437', length: '10.25', drawerWidth: '8.5' }),
    ];
    const sections = getCutListPrintSections({ sourceRows }, cols);
    const rows = sections[0].rows;
    const sumBx = rows.reduce((sum, r) => sum + r.boxes, 0);
    const sumPcs = rows.reduce((sum, r) => sum + r.parts, 0);
    expect(sumPcs).toBe(12);
    expect(sumBx).toBe(3);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.width === '6')).toMatchObject({ parts: 8, boxes: 2 });
    expect(rows.find((r) => r.width === '9')).toMatchObject({ parts: 4, boxes: 1 });
  });
});

describe('different front material (*DFM)', () => {
  function matRow({ order, material, part, length, qty, groupId, w = '4', drawerWidth = '4' }) {
    return [
      order,
      material,
      part,
      String(w),
      String(length),
      String(qty),
      '',
      String(drawerWidth),
      'Bullnose',
      groupId,
      'None',
      'None',
      'None',
      'None',
      'None',
      'None',
    ];
  }

  it('detects order+group when front material differs from B/L/R', () => {
    const allRows = [
      matRow({
        order: '602648',
        material: 'FAA: 3/4" Premium White Maple FSC',
        part: 'F',
        length: '19.063',
        qty: 2,
        groupId: '3',
      }),
      matRow({
        order: '602648',
        material: 'FAA: 1/2" Maple White',
        part: 'B',
        length: '19.063',
        qty: 2,
        groupId: '3',
      }),
      matRow({
        order: '602648',
        material: 'FAA: 1/2" Maple White',
        part: 'L',
        length: '20.876',
        qty: 2,
        groupId: '3',
      }),
      matRow({
        order: '602648',
        material: 'FAA: 1/2" Maple White',
        part: 'R',
        length: '20.876',
        qty: 2,
        groupId: '3',
      }),
      // same-material drawer should not flag
      matRow({
        order: '602648',
        material: 'PF: 1/2" Maple White',
        part: 'F',
        length: '14.375',
        qty: 4,
        groupId: '1',
      }),
      matRow({
        order: '602648',
        material: 'PF: 1/2" Maple White',
        part: 'B',
        length: '14.375',
        qty: 4,
        groupId: '1',
      }),
      matRow({
        order: '602648',
        material: 'PF: 1/2" Maple White',
        part: 'L',
        length: '20.626',
        qty: 4,
        groupId: '1',
      }),
      matRow({
        order: '602648',
        material: 'PF: 1/2" Maple White',
        part: 'R',
        length: '20.626',
        qty: 4,
        groupId: '1',
      }),
    ];

    const keys = getDifferentFrontMaterialKeys(allRows, cols);
    expect(keys.has(dfmDrawerKey('602648', '3'))).toBe(true);
    expect(keys.has(dfmDrawerKey('602648', '1'))).toBe(false);
  });

  it('marks *DFM on both front-only and side-only cut lists', () => {
    const allRows = [
      matRow({
        order: '602648',
        material: 'FAA: 3/4" Premium White Maple FSC',
        part: 'F',
        length: '19.063',
        qty: 2,
        groupId: '3',
      }),
      matRow({
        order: '602648',
        material: 'FAA: 1/2" Maple White',
        part: 'B',
        length: '19.063',
        qty: 2,
        groupId: '3',
      }),
      matRow({
        order: '602648',
        material: 'FAA: 1/2" Maple White',
        part: 'L',
        length: '20.876',
        qty: 2,
        groupId: '3',
      }),
      matRow({
        order: '602648',
        material: 'FAA: 1/2" Maple White',
        part: 'R',
        length: '20.876',
        qty: 2,
        groupId: '3',
      }),
    ];

    const frontBatch = {
      sourceRows: allRows.filter((r) => r[cols.partName] === 'F'),
    };
    const sideBatch = {
      sourceRows: allRows.filter((r) => r[cols.partName] !== 'F'),
    };

    const frontSections = getCutListPrintSections(frontBatch, cols, { allRows });
    const sideSections = getCutListPrintSections(sideBatch, cols, { allRows });

    expect(frontSections[0].rows.every((r) => r.dfm)).toBe(true);
    expect(sideSections[0].rows.every((r) => r.dfm)).toBe(true);
  });

  it('sets Bx = Pcs on front-only *DFM rows (each front is one drawer box)', () => {
    const allRows = [
      matRow({
        order: '602648',
        material: 'FAA: 3/4" Premium White Maple FSC',
        part: 'F',
        length: '34.875',
        qty: 3,
        groupId: '3',
      }),
      matRow({
        order: '602648',
        material: 'FAA: 3/4" Premium White Maple FSC',
        part: 'F',
        length: '28.938',
        qty: 2,
        groupId: '3',
      }),
      matRow({
        order: '602648',
        material: 'FAA: 1/2" Maple White',
        part: 'B',
        length: '34.875',
        qty: 3,
        groupId: '3',
      }),
      matRow({
        order: '602648',
        material: 'FAA: 1/2" Maple White',
        part: 'L',
        length: '20.876',
        qty: 3,
        groupId: '3',
      }),
      matRow({
        order: '602648',
        material: 'FAA: 1/2" Maple White',
        part: 'R',
        length: '20.876',
        qty: 3,
        groupId: '3',
      }),
    ];

    const frontBatch = { sourceRows: allRows.filter((r) => r[cols.partName] === 'F') };
    const rows = getCutListPrintSections(frontBatch, cols, { allRows })[0].rows;
    expect(rows.every((r) => r.frontOnlyDfm)).toBe(true);
    expect(rows.every((r) => r.boxes === r.parts)).toBe(true);
    expect(rows.reduce((s, r) => s + r.boxes, 0)).toBe(5);
  });
});
