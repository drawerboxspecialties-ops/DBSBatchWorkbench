import { describe, expect, it } from 'vitest';
import { getCutListPrintSections } from '../src/logic/cutListPrint.js';
import { mapHeaders } from '../src/logic/headers.js';

const cols = mapHeaders([
  'OrderNumber', 'MaterialName', 'PartName', 'W', 'Length', 'Quantity', 'Label', 'Width', 'TopEdge',
  'Laser', 'Scoop', 'Slope', 'DrillFront', 'DividersFB', 'DividersSS', 'FileSlots', 'GroupID', 'ShipDate',
]);

function melamineRow(part, w, length, qty, label, groupId, width) {
  return [
    '602457', 'PBC: 1/2" White Melamine', part, String(w), String(length), String(qty),
    label, String(width), 'Flat PVC', 'No', 'None', 'None', 'None', 'None', 'None', 'None',
    String(groupId), '07/09/26',
  ];
}

/** Group 1 rows from OPTICUT.csv order 602457 — two labels, two heights per label. */
function group1Rows602457() {
  return [
    melamineRow('F', 3.437, 13.375, 1, '1', 1, 3.5),
    melamineRow('B', 2.437, 13.375, 1, '1', 1, 2.5),
    melamineRow('L', 3.5, 12, 1, '1', 1, 3.5),
    melamineRow('R', 3.5, 12, 1, '1', 1, 3.5),
    melamineRow('F', 3.937, 13.375, 1, '1', 1, 4),
    melamineRow('B', 2.937, 13.375, 1, '1', 1, 3),
    melamineRow('L', 4, 12, 1, '1', 1, 4),
    melamineRow('R', 4, 12, 1, '1', 1, 4),
    melamineRow('F', 3.437, 13.375, 4, '7. 8. 11. 12', 1, 3.5),
    melamineRow('B', 2.437, 13.375, 4, '7. 8. 11. 12', 1, 2.5),
    melamineRow('L', 3.5, 15, 4, '7. 8. 11. 12', 1, 3.5),
    melamineRow('R', 3.5, 15, 4, '7. 8. 11. 12', 1, 3.5),
    melamineRow('F', 3.937, 13.375, 4, '7. 8. 11. 12', 1, 4),
    melamineRow('B', 2.937, 13.375, 4, '7. 8. 11. 12', 1, 3),
    melamineRow('L', 4, 15, 4, '7. 8. 11. 12', 1, 4),
    melamineRow('R', 4, 15, 4, '7. 8. 11. 12', 1, 4),
  ];
}

describe('602457 cut-list box totals', () => {
  it('row box and part sums match group 1 totals when two heights share rounded width 4', () => {
    const sections = getCutListPrintSections({ sourceRows: group1Rows602457() }, cols);
    const rows = sections[0].rows;
    const sumBx = rows.reduce((s, r) => s + r.boxes, 0);
    const sumPcs = rows.reduce((s, r) => s + r.parts, 0);
    expect(sumPcs).toBe(40);
    expect(sumBx).toBe(10);
  });

  it('full order 602457 cut-list rows reconcile to 17 boxes', () => {
    const sourceRows = [
      ...group1Rows602457(),
      melamineRow('F', 10.375, 13.375, 1, '1', 2, 10.5),
      melamineRow('B', 9.375, 13.375, 1, '1', 2, 9.5),
      melamineRow('L', 10.438, 12, 1, '1', 2, 10.5),
      melamineRow('R', 10.438, 12, 1, '1', 2, 10.5),
      melamineRow('F', 10.375, 13.375, 4, '7. 8. 11. 12', 2, 10.5),
      melamineRow('B', 9.375, 13.375, 4, '7. 8. 11. 12', 2, 9.5),
      melamineRow('L', 10.438, 15, 4, '7. 8. 11. 12', 2, 10.5),
      melamineRow('R', 10.438, 15, 4, '7. 8. 11. 12', 2, 10.5),
      melamineRow('F', 2.687, 18.468, 2, '6. 13', 3, 3),
      melamineRow('B', 2.687, 18.468, 2, '6. 13', 3, 3),
      melamineRow('L', 2.75, 18, 2, '6. 13', 3, 3),
      melamineRow('R', 2.75, 18, 2, '6. 13', 3, 3),
    ];
    for (let i = 16; i < 24; i++) {
      sourceRows[i][cols.fileSlots] = '1" Letter: Front - Back';
    }

    const sections = getCutListPrintSections({ sourceRows }, cols);
    const cutRows = sections[0].rows;
    expect(cutRows.reduce((s, r) => s + r.parts, 0)).toBe(68);
    expect(cutRows.reduce((s, r) => s + r.boxes, 0)).toBe(17);
  });
});
