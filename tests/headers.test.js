import { describe, expect, it } from 'vitest';
import { mapHeaders } from '../src/logic/headers.js';

describe('mapHeaders', () => {
  it('detects standard Allmoxy headers by name', () => {
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
    expect(cols).toEqual({
      orderNumber: 0,
      materialName: 1,
      partName: 2,
      w: 3,
      length: 4,
      quantity: 5,
      label: 6,
      width: 7,
      topEdge: 8,
      scoop: -1,
      slope: -1,
      dividersFB: -1,
      dividersSS: -1,
      drillFront: -1,
      fileSlots: -1,
      laser: -1,
      groupId: -1,
      shipDate: -1,
    });
  });

  it('is case-insensitive and ignores spaces/underscores/hyphens', () => {
    const cols = mapHeaders([
      'Order Number',
      'Material_Name',
      'Part-Name',
      'W',
      'Length',
      'Quantity',
      'Label',
      'Width',
      'Top Edge',
    ]);
    expect(cols.orderNumber).toBe(0);
    expect(cols.materialName).toBe(1);
    expect(cols.partName).toBe(2);
    expect(cols.topEdge).toBe(8);
  });

  it('falls back to positional defaults when headers are missing', () => {
    const cols = mapHeaders(['only', 'one']);
    expect(cols.orderNumber).toBe(0);
    expect(cols.materialName).toBe(1);
    expect(cols.partName).toBe(2);
    expect(cols.w).toBe(3);
    expect(cols.width).toBe(7);
    expect(cols.topEdge).toBe(8);
  });

  it('detects invoice as order number', () => {
    const cols = mapHeaders(['Invoice', 'Material', 'Part', 'W', 'Length', 'Qty', 'Label', 'Width', 'TopEdge']);
    expect(cols.orderNumber).toBe(0);
    expect(cols.quantity).toBe(5);
  });

  it('detects species as material', () => {
    const cols = mapHeaders(['Order', 'Species', 'Part', 'W', 'Length', 'Qty', 'Label', 'Width', 'TopEdge']);
    expect(cols.materialName).toBe(1);
  });

  it('uses the LAST width column (drawer height) when two width columns exist', () => {
    const cols = mapHeaders([
      'Order',
      'Material',
      'Part',
      'Width',
      'Length',
      'Qty',
      'Label',
      'Width',
      'TopEdge',
    ]);
    expect(cols.width).toBe(7);
  });

  it('detects the optional special-order columns and leaves them -1 when absent', () => {
    const withSpecial = mapHeaders([
      'OrderNumber', 'MaterialName', 'PartName', 'W', 'Length', 'Quantity', 'Label', 'Width', 'TopEdge',
      'Laser', 'Scoop', 'Slope', 'DrillFront', 'DividersFB', 'DividersSS', 'FileSlots',
    ]);
    expect(withSpecial.scoop).toBe(10);
    expect(withSpecial.slope).toBe(11);
    expect(withSpecial.drillFront).toBe(12);
    expect(withSpecial.dividersFB).toBe(13);
    expect(withSpecial.dividersSS).toBe(14);
    expect(withSpecial.fileSlots).toBe(15);
    expect(withSpecial.laser).toBe(9);
    expect(withSpecial.groupId).toBe(-1);
    expect(withSpecial.width).toBe(7);

    const withGroup = mapHeaders([
      'OrderNumber', 'MaterialName', 'PartName', 'W', 'Length', 'Quantity', 'Label', 'Width', 'TopEdge', 'GroupID',
    ]);
    expect(withGroup.groupId).toBe(9);

    const without = mapHeaders(['Order', 'Material', 'Part', 'W', 'Length', 'Qty', 'Label', 'Width', 'TopEdge']);
    expect(without.scoop).toBe(-1);
    expect(without.fileSlots).toBe(-1);
  });

  it('clears W when it collides with Width to avoid blanking the drawer height', () => {
    const cols = mapHeaders([
      'Order',
      'Material',
      'Part',
      'Length',
      'Qty',
      'Label',
      'TopEdge',
      'W',
    ]);
    expect(cols.w).toBe(-1);
    expect(cols.width).toBe(7);
  });
});
