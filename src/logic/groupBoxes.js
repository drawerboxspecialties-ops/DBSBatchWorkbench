import { boxesForParts } from './boxMath.js';

/**
 * Sum parts per (order, GroupID) from raw rows and convert each group to box count.
 *
 * @param {string[][]} rows
 * @param {object} colIndices
 * @returns {Record<string, Array<{ groupId: string, boxes: number, parts: number }>>}
 */
export function buildOrderGroupBoxTotalsFromRows(rows, colIndices) {
  const result = {};
  if (!colIndices || colIndices.groupId === -1 || !rows?.length) {
    return result;
  }

  const partsMap = {};
  rows.forEach((row) => {
    const order = String(row[colIndices.orderNumber] ?? '').trim();
    const groupId = String(row[colIndices.groupId] ?? '').trim();
    const qty = parseInt(row[colIndices.quantity]) || 0;
    if (!order || !groupId || qty <= 0) return;
    const key = `${order}|${groupId}`;
    partsMap[key] = (partsMap[key] || 0) + qty;
  });

  Object.entries(partsMap).forEach(([key, parts]) => {
    const sep = key.indexOf('|');
    const order = key.slice(0, sep);
    const groupId = key.slice(sep + 1);
    if (!result[order]) result[order] = [];
    result[order].push({ groupId, parts, boxes: boxesForParts(parts) });
  });

  Object.values(result).forEach((groups) => {
    groups.sort((a, b) =>
      String(a.groupId).localeCompare(String(b.groupId), undefined, { numeric: true })
    );
  });

  return result;
}

/**
 * Align per-order box totals with GroupID breakdown: each order's box count is the
 * sum of ceil(parts/4) per group (not ceil of all parts together).
 *
 * @param {Record<string, number>} orderColTotals
 * @param {Record<string, Array<{ boxes: number }>>} orderGroupBoxTotals
 * @returns {Record<string, number>}
 */
export function reconcileOrderColTotals(orderColTotals, orderGroupBoxTotals) {
  const reconciled = { ...orderColTotals };
  Object.entries(orderGroupBoxTotals || {}).forEach(([order, groups]) => {
    if (groups?.length) {
      reconciled[order] = groups.reduce((sum, g) => sum + g.boxes, 0);
    }
  });
  return reconciled;
}

/**
 * Sum box counts for the given orders (batch total).
 *
 * @param {Record<string, number>} orderColTotals
 * @param {string[]} sortedOrders
 * @returns {number}
 */
export function sumOrderColTotals(orderColTotals, sortedOrders) {
  return (sortedOrders || []).reduce((sum, order) => sum + (orderColTotals[order] ?? 0), 0);
}

/**
 * Sum parts per (order, GroupID) and convert each group to box count.
 * Uses pre-merge totals on the batch when present (rows may merge across GroupIDs).
 *
 * @param {{ rows: string[][], orderGroupBoxTotals?: Record<string, Array<{ groupId: string, boxes: number, parts: number }>> }} batch
 * @param {object} colIndices
 * @returns {Record<string, Array<{ groupId: string, boxes: number, parts: number }>>}
 */
export function buildOrderGroupBoxTotals(batch, colIndices) {
  if (batch?.orderGroupBoxTotals) {
    return batch.orderGroupBoxTotals;
  }
  return buildOrderGroupBoxTotalsFromRows(batch?.rows, colIndices);
}

/**
 * Print label: per-GroupID box counts as "1-2, 2-3" next to the sales order.
 *
 * @param {string} order
 * @param {object} batch
 * @param {object} colIndices
 * @returns {string}
 */
export function formatOrderGroupBoxLabel(order, batch, colIndices) {
  const groups = buildOrderGroupBoxTotals(batch, colIndices)[order];
  if (groups?.length) {
    return groups.map((g) => `${g.groupId}-${g.boxes}`).join(', ');
  }
  const boxes = batch?.orderColTotals?.[order] ?? 0;
  return String(boxes);
}

/**
 * Cut-list order title suffix: total boxes plus per-GroupID counts in brackets.
 * Example: "3 boxes (1-2, 2-1)"
 *
 * @param {string} order
 * @param {object} batch
 * @param {object} colIndices
 * @returns {string}
 */
export function formatOrderCutListBoxSummary(order, batch, colIndices) {
  const total = batch?.orderColTotals?.[order] ?? 0;
  if (total <= 0) return '';
  const boxWord = total === 1 ? 'box' : 'boxes';
  const groupLabel = formatOrderGroupBoxLabel(order, batch, colIndices);
  if (groupLabel.includes('-')) {
    return `${total} ${boxWord} (${groupLabel})`;
  }
  return `${total} ${boxWord}`;
}

/**
 * Cut-list Grp cell: GroupID with box count in brackets, e.g. "2 (1)".
 *
 * @param {string} order
 * @param {string} groupId
 * @param {object} batch
 * @param {object} colIndices
 * @returns {string}
 */
export function formatGroupBoxInBrackets(order, groupId, batch, colIndices) {
  const id = String(groupId ?? '').trim();
  if (!id) return '';
  const groups = buildOrderGroupBoxTotals(batch, colIndices)[order];
  const match = groups?.find((g) => String(g.groupId) === id);
  if (match) return `${id} (${match.boxes})`;
  return id;
}
