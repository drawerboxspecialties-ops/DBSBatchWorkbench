import { describe, expect, it } from 'vitest';
import { getCutListPrintSections } from '../src/logic/cutListPrint.js';
import { mapHeaders } from '../src/logic/headers.js';

const cols = mapHeaders([
  'OrderNumber', 'MaterialName', 'PartName', 'W', 'Length', 'Quantity', 'Label', 'Width', 'TopEdge',
  'Laser', 'Scoop', 'Slope', 'DrillFront', 'DividersFB', 'DividersSS', 'FileSlots', 'GroupID', 'ShipDate',
]);

function mapleRow(part, w, length, qty, label, width) {
  return [
    '602504', 'PF: 5/8" Maple White', part, String(w), String(length), String(qty),
    label, String(width), 'Flat Flush Foil', 'Yes', 'None', 'None', 'None', 'None', 'None', 'None',
    '1', '07/15/26',
  ];
}

/** Label 82-03 #62 — stacked 4"/9"/9" drawers with different side depths on duplicate 9" fronts. */
function stackedDrawerRows602504() {
  return [
    mapleRow('F', 4, 22.406, 1, '82-03 #62', 4),
    mapleRow('B', 3.25, 22.406, 1, '82-03 #62', 3.5),
    mapleRow('L', 3.937, 17.376, 1, '82-03 #62', 4),
    mapleRow('R', 3.937, 17.376, 1, '82-03 #62', 4),
    mapleRow('F', 9, 22.406, 1, '82-03 #62', 9),
    mapleRow('B', 8.25, 22.406, 1, '82-03 #62', 8.5),
    mapleRow('L', 8.937, 17.376, 1, '82-03 #62', 9),
    mapleRow('R', 8.937, 17.376, 1, '82-03 #62', 9),
    mapleRow('F', 9, 22.406, 1, '82-03 #62', 9),
    mapleRow('B', 8.25, 22.406, 1, '82-03 #62', 8.5),
    mapleRow('L', 8.937, 20.376, 1, '82-03 #62', 9),
    mapleRow('R', 8.937, 20.376, 1, '82-03 #62', 9),
  ];
}

describe('602504 cut-list box totals', () => {
  it('pairs each stacked front with its own sides when 9" fronts share FB length', () => {
    const sections = getCutListPrintSections({ sourceRows: stackedDrawerRows602504() }, cols);
    const rows = sections[0].rows;
    expect(rows.reduce((s, r) => s + r.parts, 0)).toBe(12);
    expect(rows.reduce((s, r) => s + r.boxes, 0)).toBe(3);
    expect(rows.filter((r) => r.lrLength === '17.376')).toHaveLength(2);
    expect(rows.find((r) => r.lrLength === '20.376')).toMatchObject({ width: '9', parts: 4, boxes: 1 });
  });
});
