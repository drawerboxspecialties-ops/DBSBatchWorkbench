import { boxesForParts } from '../logic/boxMath.js';

/**
 * Cross-check OptiCut + Top Edge summaries for the same order batch.
 *
 * @typedef {{ parts: number, boxes: number, lf?: number, rips?: number }} OrderStats
 * @typedef {{
 *   loaded: boolean,
 *   orders: string[],
 *   totalParts: number,
 *   totalBoxes: number,
 *   byOrder: Record<string, OrderStats>,
 *   fileName?: string,
 * }} SideSummary
 *
 * @typedef {{
 *   severity: 'error' | 'warning' | 'info' | 'success',
 *   code: string,
 *   message: string,
 *   order?: string,
 * }} BatchIssue
 *
 * @param {SideSummary | null | undefined} opticut
 * @param {SideSummary | null | undefined} topEdge
 * @returns {{
 *   ready: boolean,
 *   ok: boolean,
 *   errorCount: number,
 *   warningCount: number,
 *   issues: BatchIssue[],
 *   overlapOrders: string[],
 *   totals: {
 *     opticutParts: number,
 *     topEdgeParts: number,
 *     opticutBoxes: number,
 *     topEdgeBoxes: number,
 *     orderCountOpticut: number,
 *     orderCountTopEdge: number,
 *     orderCountShared: number,
 *   }
 * }}
 */
export function compareBatchImports(opticut, topEdge) {
  const issues = [];
  const oc = normalizeSide(opticut);
  const te = normalizeSide(topEdge);

  const totals = {
    opticutParts: oc.totalParts,
    topEdgeParts: te.totalParts,
    opticutBoxes: oc.totalBoxes,
    topEdgeBoxes: te.totalBoxes,
    orderCountOpticut: oc.orders.length,
    orderCountTopEdge: te.orders.length,
    orderCountShared: 0,
  };

  if (!oc.loaded && !te.loaded) {
    issues.push({
      severity: 'info',
      code: 'NONE_LOADED',
      message: 'Load both companion CSVs for this batch to run match checks.',
    });
    return finish(false, issues, [], totals);
  }

  if (!oc.loaded) {
    issues.push({
      severity: 'info',
      code: 'OPTICUT_MISSING',
      message: 'OptiCut CSV not loaded yet — order/parts match checks are waiting.',
    });
    return finish(false, issues, [], totals);
  }

  if (!te.loaded) {
    issues.push({
      severity: 'info',
      code: 'TOPEDGE_MISSING',
      message: 'Top Edge CSV not loaded yet — order/parts match checks are waiting.',
    });
    return finish(false, issues, [], totals);
  }

  if (oc.totalParts <= 0) {
    issues.push({
      severity: 'error',
      code: 'OPTICUT_EMPTY_PARTS',
      message: 'OptiCut file loaded but has no usable part quantities.',
    });
  }

  if (te.totalParts <= 0) {
    issues.push({
      severity: 'error',
      code: 'TOPEDGE_EMPTY_PARTS',
      message: 'Top Edge file loaded but has no usable part quantities.',
    });
  }

  const ocSet = new Set(oc.orders);
  const teSet = new Set(te.orders);
  const onlyOpticut = oc.orders.filter((o) => !teSet.has(o));
  const onlyTopEdge = te.orders.filter((o) => !ocSet.has(o));
  const overlap = oc.orders.filter((o) => teSet.has(o));
  totals.orderCountShared = overlap.length;

  if (onlyOpticut.length) {
    issues.push({
      severity: 'error',
      code: 'ORDERS_ONLY_OPTICUT',
      message: `Orders in OptiCut but missing from Top Edge (${onlyOpticut.length}): ${formatOrderList(onlyOpticut)}`,
    });
  }

  if (onlyTopEdge.length) {
    issues.push({
      severity: 'error',
      code: 'ORDERS_ONLY_TOPEDGE',
      message: `Orders in Top Edge but missing from OptiCut (${onlyTopEdge.length}): ${formatOrderList(onlyTopEdge)}`,
    });
  }

  if (oc.totalParts !== te.totalParts) {
    issues.push({
      severity: 'error',
      code: 'TOTAL_PARTS_MISMATCH',
      message: `Total parts do not match — OptiCut ${oc.totalParts.toLocaleString()} vs Top Edge ${te.totalParts.toLocaleString()} (Δ ${signedDelta(te.totalParts - oc.totalParts)}).`,
    });
  }

  if (oc.totalBoxes !== te.totalBoxes) {
    issues.push({
      severity: 'error',
      code: 'TOTAL_BOXES_MISMATCH',
      message: `Total boxes do not match — OptiCut ${oc.totalBoxes.toLocaleString()} vs Top Edge ${te.totalBoxes.toLocaleString()} (Δ ${signedDelta(te.totalBoxes - oc.totalBoxes)}).`,
    });
  }

  for (const order of overlap) {
    const ocOrder = oc.byOrder[order] || { parts: 0, boxes: 0 };
    const teOrder = te.byOrder[order] || { parts: 0, boxes: 0 };

    if (ocOrder.parts !== teOrder.parts) {
      issues.push({
        severity: 'error',
        code: 'ORDER_PARTS_MISMATCH',
        order,
        message: `Order ${order}: parts mismatch — OptiCut ${ocOrder.parts} vs Top Edge ${teOrder.parts} (Δ ${signedDelta(teOrder.parts - ocOrder.parts)}).`,
      });
    }

    if (ocOrder.boxes !== teOrder.boxes) {
      // Parts can still match while boxes differ when GroupID / grouping ceil rules diverge.
      const severity = ocOrder.parts === teOrder.parts ? 'warning' : 'error';
      issues.push({
        severity,
        code: 'ORDER_BOXES_MISMATCH',
        order,
        message: `Order ${order}: boxes mismatch — OptiCut ${ocOrder.boxes} vs Top Edge ${teOrder.boxes} (Δ ${signedDelta(teOrder.boxes - ocOrder.boxes)}).`,
      });
    }

    if (ocOrder.parts > 0 && ocOrder.parts % 4 !== 0) {
      issues.push({
        severity: 'warning',
        code: 'ORDER_PARTS_NOT_MULTIPLE_OF_4',
        order,
        message: `Order ${order}: OptiCut parts (${ocOrder.parts}) are not a multiple of 4 — box math uses ceil(parts/4)=${boxesForParts(ocOrder.parts)}.`,
      });
    }
  }

  // Internal sanity: per-order row sums vs printed report group totals.
  if (te.orderParts != null && te.reportParts != null && te.orderParts !== te.reportParts) {
    issues.push({
      severity: 'warning',
      code: 'TOPEDGE_INTERNAL_PARTS',
      message: `Top Edge per-order parts (${te.orderParts}) differ from report-group parts (${te.reportParts}). Check removed filters.`,
    });
  }

  if (te.orderBoxes != null && te.reportBoxes != null && te.orderBoxes !== te.reportBoxes) {
    issues.push({
      severity: 'warning',
      code: 'TOPEDGE_INTERNAL_BOXES',
      message: `Top Edge per-order box sum (${te.orderBoxes}) differs from report total boxes (${te.reportBoxes}) — usually because report ceils boxes per height/material group across shared orders.`,
    });
  }

  const errorCount = issues.filter((i) => i.severity === 'error').length;
  if (errorCount === 0 && overlap.length > 0) {
    issues.unshift({
      severity: 'success',
      code: 'BATCH_MATCH_OK',
      message: `Batch match OK — ${overlap.length} shared order${overlap.length === 1 ? '' : 's'}, ${oc.totalParts.toLocaleString()} parts, ${oc.totalBoxes.toLocaleString()} boxes.`,
    });
  }

  return finish(true, issues, overlap, totals);
}

/**
 * Build a Top Edge summary from parsed items + optional report groups.
 * @param {object[]} items
 * @param {object[]} [reportGroups]
 * @returns {SideSummary & { reportParts?: number, reportBoxes?: number }}
 */
export function summarizeTopEdgeItems(items, reportGroups = null) {
  const list = Array.isArray(items) ? items : [];
  const byOrder = {};

  list.forEach((item) => {
    const order = normalizeOrderId(item?.orderId);
    if (!order) return;
    if (!byOrder[order]) byOrder[order] = { parts: 0, boxes: 0, lf: 0, rips: 0 };
    const parts = item.preCalculated
      ? Number(item.parts) || 0
      : (Number(item.qty) || 0) * 4;
    byOrder[order].parts += parts;
    if (item.preCalculated) {
      byOrder[order].lf += Number(item.lf) || 0;
      byOrder[order].rips += Number(item.rips) || 0;
    }
  });

  Object.keys(byOrder).forEach((order) => {
    byOrder[order].boxes = boxesForParts(byOrder[order].parts);
  });

  const orders = Object.keys(byOrder).sort(compareOrders);
  const totalParts = orders.reduce((sum, o) => sum + byOrder[o].parts, 0);
  const totalBoxes = orders.reduce((sum, o) => sum + byOrder[o].boxes, 0);

  /** @type {SideSummary & { orderParts?: number, orderBoxes?: number, reportParts?: number, reportBoxes?: number }} */
  const summary = {
    loaded: list.length > 0,
    orders,
    totalParts,
    totalBoxes,
    byOrder,
    orderParts: totalParts,
    orderBoxes: totalBoxes,
  };

  if (Array.isArray(reportGroups)) {
    summary.reportParts = reportGroups.reduce((sum, g) => sum + (Number(g.parts) || 0), 0);
    summary.reportBoxes = reportGroups.reduce((sum, g) => sum + (Number(g.boxes) || 0), 0);
    // Prefer report totals for batch-level box/parts match (matches printed report).
    summary.totalParts = summary.reportParts;
    summary.totalBoxes = summary.reportBoxes;
  }

  return summary;
}

/**
 * Build an OptiCut summary from split groups and/or raw rows.
 * @param {{
 *   splitGroups?: Record<string, any>,
 *   parsedRows?: any[][],
 *   colIndices?: { orderNumber: number, quantity: number } | null,
 * }} input
 * @returns {SideSummary}
 */
export function summarizeOpticutState(input = {}) {
  const splitGroups = input.splitGroups || {};
  const groupList = Object.values(splitGroups);
  const byOrder = {};

  if (groupList.length > 0) {
    groupList.forEach((group) => {
      const orders = group.sortedOrders || Object.keys(group.orderPartTotals || {});
      orders.forEach((orderRaw) => {
        const order = normalizeOrderId(orderRaw);
        if (!order) return;
        if (!byOrder[order]) byOrder[order] = { parts: 0, boxes: 0 };
        byOrder[order].parts += Number(group.orderPartTotals?.[orderRaw]) || 0;
        byOrder[order].boxes += Number(group.orderColTotals?.[orderRaw]) || 0;
      });
    });
  } else if (input.parsedRows?.length && input.colIndices) {
    const ci = input.colIndices;
    input.parsedRows.forEach((row) => {
      const order = normalizeOrderId(row[ci.orderNumber]);
      if (!order) return;
      if (!byOrder[order]) byOrder[order] = { parts: 0, boxes: 0 };
      byOrder[order].parts += parseInt(row[ci.quantity], 10) || 0;
    });
    Object.keys(byOrder).forEach((order) => {
      byOrder[order].boxes = boxesForParts(byOrder[order].parts);
    });
  }

  const orders = Object.keys(byOrder).sort(compareOrders);
  const totalParts = orders.reduce((sum, o) => sum + byOrder[o].parts, 0);
  const totalBoxes = orders.reduce((sum, o) => sum + byOrder[o].boxes, 0);

  return {
    loaded: orders.length > 0 || groupList.length > 0 || (input.parsedRows?.length > 0),
    orders,
    totalParts,
    totalBoxes,
    byOrder,
  };
}

function normalizeSide(side) {
  if (!side || typeof side !== 'object') {
    return { loaded: false, orders: [], totalParts: 0, totalBoxes: 0, byOrder: {} };
  }
  const byOrder = {};
  Object.entries(side.byOrder || {}).forEach(([orderRaw, stats]) => {
    const order = normalizeOrderId(orderRaw);
    if (!order) return;
    byOrder[order] = {
      parts: Number(stats?.parts) || 0,
      boxes: Number(stats?.boxes) || 0,
      lf: Number(stats?.lf) || 0,
      rips: Number(stats?.rips) || 0,
    };
  });
  const orders = (Array.isArray(side.orders) ? side.orders : Object.keys(byOrder))
    .map(normalizeOrderId)
    .filter(Boolean);
  const uniqueOrders = [...new Set(orders)].sort(compareOrders);

  return {
    loaded: !!side.loaded,
    orders: uniqueOrders,
    totalParts: Number(side.totalParts) || 0,
    totalBoxes: Number(side.totalBoxes) || 0,
    byOrder,
    orderParts: side.orderParts,
    orderBoxes: side.orderBoxes,
    reportParts: side.reportParts,
    reportBoxes: side.reportBoxes,
    fileName: side.fileName,
  };
}

function normalizeOrderId(value) {
  return String(value ?? '').replace(/[^0-9]/g, '');
}

function compareOrders(a, b) {
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}

function formatOrderList(orders) {
  if (orders.length <= 12) return orders.join(', ');
  return `${orders.slice(0, 12).join(', ')}… (+${orders.length - 12} more)`;
}

function signedDelta(n) {
  if (n > 0) return `+${n}`;
  return String(n);
}

function finish(ready, issues, overlapOrders, totals) {
  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;
  return {
    ready,
    ok: ready && errorCount === 0,
    errorCount,
    warningCount,
    issues,
    overlapOrders,
    totals,
  };
}
