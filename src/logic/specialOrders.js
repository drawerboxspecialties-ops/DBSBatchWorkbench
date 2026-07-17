/**
 * Secondary-operation columns that flag an order as "special".
 * Laser and GroupID are intentionally excluded per shop rules.
 *
 * These keys correspond to optional columns detected by mapHeaders.
 */
export const SPECIAL_ORDER_COLUMN_KEYS = [
  'scoop',
  'slope',
  'dividersFB',
  'dividersSS',
  'drillFront',
  'fileSlots',
];

/** Cut-list print: flag individual drawer groups (not DrillFront). */
export const CUTLIST_SPECIAL_COLUMN_KEYS = [
  'scoop',
  'slope',
  'dividersFB',
  'dividersSS',
  'fileSlots',
];

/**
 * A cell counts as "special" when it holds a real value, i.e. it is not blank
 * and not the literal "none" (case-insensitive).
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isSpecialOrderValue(value) {
  const v = String(value ?? '').trim().toLowerCase();
  return v !== '' && v !== 'none';
}

/**
 * Determine which order numbers are "special".
 *
 * If ANY row on a sales order has a special value in ANY special column, the
 * entire order is special — all of its rows batch together in SPECIAL_ groups.
 * Orders are never split between normal and special batches.
 *
 * Laser and GroupID are never read for this check.
 *
 * @param {string[][]} rows
 * @param {object} colIndices
 * @returns {Set<string>} set of trimmed order numbers
 */
export function getSpecialOrderNumbers(rows, colIndices) {
  const special = new Set();
  if (!colIndices || colIndices.orderNumber === -1) return special;

  const laserIdx = colIndices.laser;
  const groupIdIdx = colIndices.groupId;
  const skipIndices = new Set([laserIdx, groupIdIdx].filter((idx) => typeof idx === 'number' && idx !== -1));
  const specialCols = SPECIAL_ORDER_COLUMN_KEYS.map((key) => colIndices[key]).filter(
    (idx) => typeof idx === 'number' && idx !== -1 && !skipIndices.has(idx)
  );
  if (specialCols.length === 0) return special;

  rows.forEach((row) => {
    const order = String(row[colIndices.orderNumber] ?? '').trim();
    if (!order || special.has(order)) return;
    for (const idx of specialCols) {
      if (idx < row.length && isSpecialOrderValue(row[idx])) {
        special.add(order);
        break;
      }
    }
  });

  return special;
}

/**
 * Stable key for a drawer set within an order (GroupID preferred, then Label).
 * @param {string} order
 * @param {string} groupId
 * @param {string} label
 * @returns {string}
 */
export function getGroupSpecialKey(order, groupId, label) {
  const o = String(order ?? '').trim();
  const g = String(groupId ?? '').trim();
  const l = String(label ?? '').trim();
  if (!o) return '';
  if (g) return `${o}|g:${g}`;
  if (l) return `${o}|l:${l}`;
  return '';
}

/**
 * @param {string[]} row
 * @param {object} colIndices
 * @returns {boolean}
 */
export function rowHasCutlistSpecialValue(row, colIndices) {
  const specialCols = CUTLIST_SPECIAL_COLUMN_KEYS.map((key) => colIndices[key]).filter(
    (idx) => typeof idx === 'number' && idx !== -1
  );
  return specialCols.some((idx) => idx < row.length && isSpecialOrderValue(row[idx]));
}

/**
 * Drawer groups (order + GroupID or Label) with scoop, slope, dividers, or file slots.
 * @param {string[][]} rows
 * @param {object} colIndices
 * @returns {Set<string>}
 */
export function getSpecialGroupKeys(rows, colIndices) {
  const special = new Set();
  if (!colIndices || colIndices.orderNumber === -1) return special;

  rows.forEach((row) => {
    if (!rowHasCutlistSpecialValue(row, colIndices)) return;
    const order = String(row[colIndices.orderNumber] ?? '').trim();
    const groupId =
      colIndices.groupId !== -1 && colIndices.groupId < row.length
        ? String(row[colIndices.groupId] ?? '').trim()
        : '';
    const label =
      colIndices.label !== -1 && colIndices.label < row.length
        ? String(row[colIndices.label] ?? '').trim()
        : '';
    const key = getGroupSpecialKey(order, groupId, label);
    if (key) special.add(key);
  });

  return special;
}
