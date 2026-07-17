import { computeBoxMatrix } from './boxMath.js';
import { getSummaryHeight } from './widths.js';
import { buildOrderGroupBoxTotalsFromRows, reconcileOrderColTotals, sumOrderColTotals } from './groupBoxes.js';

/**
 * Unique key for per-batch order inclusion/exclusion overrides.
 *
 * @param {string} sourceGroupKey
 * @param {string} order
 */
export function batchOrderKey(sourceGroupKey, order) {
  return `${sourceGroupKey}|${String(order).trim()}`;
}

/**
 * Remove orders excluded from specific source groups and drop empty batches.
 * Recomputes summary/box totals for surviving batches.
 *
 * @param {Record<string, object>} groups
 * @param {Set<string>} exclusions  keys from batchOrderKey()
 * @param {object} colIndices
 * @returns {Record<string, object>}
 */
export function applyBatchOrderExclusions(groups, exclusions, colIndices) {
  if (!exclusions || exclusions.size === 0) return groups;

  const result = {};
  Object.entries(groups).forEach(([batchKey, batch]) => {
    const notExcluded = (row) => {
      const order = String(row[colIndices.orderNumber] ?? '').trim();
      return !exclusions.has(batchOrderKey(batch.sourceGroupKey, order));
    };
    const rows = (batch.rows || []).filter(notExcluded);
    if (rows.length === 0) return;
    const sourceRows = (batch.sourceRows || []).filter(notExcluded);

    const uniqueOrders = new Set();
    const uniqueHeights = new Set();
    const summaryData = {};
    let totalParts = 0;

    rows.forEach((row) => {
      const orderNum = row[colIndices.orderNumber] || 'Unknown';
      const height = getSummaryHeight(row, colIndices);
      const qty = parseInt(row[colIndices.quantity]) || 0;
      uniqueOrders.add(orderNum);
      uniqueHeights.add(height);
      if (!summaryData[height]) summaryData[height] = {};
      if (!summaryData[height][orderNum]) summaryData[height][orderNum] = 0;
      summaryData[height][orderNum] += qty;
      totalParts += qty;
    });

    const sortedHeights = Array.from(uniqueHeights).sort((a, b) => parseFloat(b) - parseFloat(a));
    const sortedOrders = Array.from(uniqueOrders).sort();
    const { heightOrderBoxes, heightRowTotals, orderPartTotals, orderColTotals } =
      computeBoxMatrix(sortedHeights, sortedOrders, summaryData);

    const orderGroupBoxTotals = batch.orderGroupBoxTotals
      ? Object.fromEntries(
          Object.entries(batch.orderGroupBoxTotals).filter(([order]) =>
            sortedOrders.includes(order)
          )
        )
      : buildOrderGroupBoxTotalsFromRows(rows, colIndices);

    const reconciledOrderColTotals = reconcileOrderColTotals(orderColTotals, orderGroupBoxTotals);
    const reconciledTotalBoxes = sumOrderColTotals(reconciledOrderColTotals, sortedOrders);

    result[batchKey] = {
      ...batch,
      rows,
      sourceRows,
      sortedHeights,
      sortedOrders,
      heightOrderBoxes,
      heightRowTotals,
      orderPartTotals,
      orderColTotals: reconciledOrderColTotals,
      totalBoxes: reconciledTotalBoxes,
      totalParts,
      orderGroupBoxTotals,
    };
  });

  return result;
}
