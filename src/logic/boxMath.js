/**
 * Box math for batch totals and cut-list print.
 *
 * Critical business rule:
 *   boxes = Math.ceil(parts / 4)
 *
 * Per-height cells use ceil(parts/4) per cell. When GroupID data exists,
 * per-order totals are reconciled to the sum of per-group boxes (see groupBoxes.js).
 *
 * Do NOT change the divisor or the rounding without explicit sign-off.
 */

/**
 * Compute boxes from a parts count using the documented 4-parts-per-box rule.
 * @param {number} parts
 * @returns {number}
 */
export function boxesForParts(parts) {
  return Math.ceil((parseInt(parts) || 0) / 4);
}

/**
 * Build the per-height, per-order box matrix plus row/column totals.
 *
 * Mirrors the original index.html box math exactly:
 *   - For each (height, order) cell, parts come from summaryData[height][order].
 *   - boxes = Math.ceil(parts / 4).
 *   - heightRowTotals[h] = sum of boxes across orders for that height.
 *   - orderPartTotals[order] = sum of raw parts across heights.
 *   - orderColTotals[order] = Math.ceil(orderPartTotals[order] / 4) before GroupID reconcile.
 *   - After batching, grouping.js may replace orderColTotals with sum of per-GroupID boxes.
 *
 * @param {string[]} sortedHeights
 * @param {string[]} sortedOrders
 * @param {Record<string, Record<string, number>>} summaryData  [height][order] -> parts
 * @returns {{
 *   heightOrderBoxes: Record<string, Record<string, number>>,
 *   heightRowTotals: Record<string, number>,
 *   orderPartTotals: Record<string, number>,
 *   orderColTotals: Record<string, number>,
 *   totalBoxes: number,
 * }}
 */
export function computeBoxMatrix(sortedHeights, sortedOrders, summaryData) {
  const heightOrderBoxes = {};
  const heightRowTotals = {};
  const orderPartTotals = {};
  const orderColTotals = {};

  sortedOrders.forEach((o) => {
    orderPartTotals[o] = 0;
    orderColTotals[o] = 0;
  });

  sortedHeights.forEach((h) => {
    heightOrderBoxes[h] = {};
    let rowSum = 0;
    sortedOrders.forEach((order) => {
      const parts = summaryData[h]?.[order] || 0;
      const boxes = boxesForParts(parts);
      heightOrderBoxes[h][order] = boxes;
      rowSum += boxes;
      orderPartTotals[order] += parts;
    });
    heightRowTotals[h] = rowSum;
  });

  sortedOrders.forEach((order) => {
    orderColTotals[order] = boxesForParts(orderPartTotals[order] || 0);
  });

  const totalBoxes = Object.values(orderColTotals).reduce((sum, boxes) => sum + boxes, 0);

  return { heightOrderBoxes, heightRowTotals, orderPartTotals, orderColTotals, totalBoxes };
}
