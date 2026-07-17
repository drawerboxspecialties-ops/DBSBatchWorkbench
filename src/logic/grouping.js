import { cleanMaterialName } from './materialNames.js';
import { normalizeTopEdgeName, getEdgeCode } from './topEdges.js';
import { scatterOrdersIntoChunks } from './splitOrders.js';
import { CATEGORY_CODES, getMaterialCategory } from './categories.js';
import { getSummaryHeight, getNumericSortValue, getFractionalSortValue } from './widths.js';
import { computeBoxMatrix } from './boxMath.js';
import { getSpecialOrderNumbers } from './specialOrders.js';
import {
  buildOrderShipDateMap,
  formatCombinedShipDateLabel,
  getShipDateFromRow,
  shipDateGroupingToken,
} from './shipDate.js';
import {
  buildOrderGroupBoxTotalsFromRows,
  reconcileOrderColTotals,
  sumOrderColTotals,
} from './groupBoxes.js';

/**
 * Front/back top-edge priority rule:
 * When a matching front and back row disagree on top edge, the B row wins and
 * the matching F row is changed to match B. This keeps front/back rows together
 * when the back row contains the correct edge.
 *
 * Match key = order|material|length|summaryHeight  (so rows of the same drawer match).
 *
 * @param {string[][]} rows
 * @param {{ orderNumber: number, materialName: number, partName: number, length: number, topEdge: number, width: number, w: number }} colIndices
 */
export function defaultFrontTopEdgesFromBacks(rows, colIndices) {
  if (colIndices.orderNumber === -1 || colIndices.partName === -1 || colIndices.topEdge === -1) {
    return;
  }

  const backTopEdgeByExactMatch = {};
  const backTopEdgesByOrder = {};

  rows.forEach((row) => {
    const orderNum = String(row[colIndices.orderNumber] || '').trim();
    const partName = String(row[colIndices.partName] || '').trim().toUpperCase();
    const topEdge = String(row[colIndices.topEdge] || '').trim();
    if (!orderNum || !topEdge) return;

    if (partName === 'B' || partName.startsWith('BACK')) {
      const exactKey = getBackTopEdgeMatchKey(row, colIndices);
      if (!backTopEdgeByExactMatch[exactKey]) {
        backTopEdgeByExactMatch[exactKey] = topEdge;
      }
      if (!backTopEdgesByOrder[orderNum]) {
        backTopEdgesByOrder[orderNum] = new Set();
      }
      backTopEdgesByOrder[orderNum].add(topEdge);
    }
  });

  rows.forEach((row) => {
    const orderNum = String(row[colIndices.orderNumber] || '').trim();
    const partName = String(row[colIndices.partName] || '').trim().toUpperCase();
    if (!(partName === 'F' || partName.startsWith('FRONT'))) return;

    const exactKey = getBackTopEdgeMatchKey(row, colIndices);
    const orderEdges = backTopEdgesByOrder[orderNum] ? Array.from(backTopEdgesByOrder[orderNum]) : [];
    const backTopEdge = backTopEdgeByExactMatch[exactKey] || (orderEdges.length === 1 ? orderEdges[0] : '');
    if (!backTopEdge) return;

    const currentTopEdge = String(row[colIndices.topEdge] || '').trim();
    if (currentTopEdge !== backTopEdge) {
      row[colIndices.topEdge] = backTopEdge;
    }
  });
}

/**
 * Normalize every row's top edge name in place.
 * @param {string[][]} rows
 * @param {{ topEdge: number }} colIndices
 */
export function normalizeTopEdges(rows, colIndices) {
  if (colIndices.topEdge === -1) return;
  rows.forEach((row) => {
    if (colIndices.topEdge >= row.length) return;
    row[colIndices.topEdge] = normalizeTopEdgeName(row[colIndices.topEdge]);
  });
}

function getBackTopEdgeMatchKey(row, colIndices) {
  const order = String(row[colIndices.orderNumber] || '').trim();
  const mat = cleanMaterialName(row[colIndices.materialName] || '');
  const len = String(row[colIndices.length] || '').trim();
  const h = getSummaryHeight(row, colIndices);
  return `${order}|${mat}|${len}|${h}`;
}

/**
 * Normalize the part name on a merged row to a single letter:
 *  - if any merged row is front/back -> 'F'
 *  - else if any merged row is left/right/side -> 'L'
 *  - else the first character of the first row's part name
 *
 * @param {string[][]} rList
 * @param {{ partName: number }} colIndices
 * @returns {string}
 */
function normalizePartNameForMergedRow(rList, colIndices) {
  if (colIndices.partName === -1) return '';
  const rawP = (rList[0][colIndices.partName] || '').trim().toUpperCase();
  if (!rawP) return '';
  if (rawP.startsWith('B') || rawP.includes('BACK')) return 'B';
  if (rawP.startsWith('F') || rawP.includes('FRONT')) return 'F';
  if (rawP.startsWith('L') || rawP.includes('LEFT')) return 'L';
  if (rawP.startsWith('R') || rawP.includes('RIGHT') || rawP.includes('SIDE')) return 'R';
  return rawP.charAt(0);
}

/**
 * Sort rows numerically descending: order, then summary height, then length.
 * Fractional values like "3 1/2" are handled.
 *
 * @param {string[][]} rows
 * @param {{ orderNumber: number, length: number, width: number, w: number }} colIndices
 * @returns {string[][]}
 */
function sortRowsDescending(rows, colIndices) {
  return rows.slice().sort((a, b) => {
    const oA = getFractionalSortValue(a[colIndices.orderNumber]);
    const oB = getFractionalSortValue(b[colIndices.orderNumber]);
    if (oB !== oA) return oB - oA;
    const hA = getNumericSortValue(getSummaryHeight(a, colIndices));
    const hB = getNumericSortValue(getSummaryHeight(b, colIndices));
    if (hB !== hA) return hB - hA;
    const lA = getFractionalSortValue(a[colIndices.length]);
    const lB = getFractionalSortValue(b[colIndices.length]);
    return lB - lA;
  });
}

/**
 * Merge rows within a chunk by (Order, Material, Length, SummaryHeight, TopEdge, PartName).
 * Merged rows sum Quantity, clear Label, and normalize PartName.
 *
 * @param {string[][]} chunkRows
 * @param {{ orderNumber: number, materialName: number, length: number, width: number, w: number, topEdge: number, quantity: number, partName: number, label: number }} colIndices
 * @returns {string[][]}
 */
function mergeChunkRows(chunkRows, colIndices) {
  const mergedMap = {};
  chunkRows.forEach((r) => {
    const order = (r[colIndices.orderNumber] || '').trim();
    const mat = cleanMaterialName(r[colIndices.materialName]);
    const len = (r[colIndices.length] || '').trim();
    const h = getSummaryHeight(r, colIndices);
    const edge = (r[colIndices.topEdge] || '').trim();
    const part =
      colIndices.partName !== -1
        ? String(r[colIndices.partName] ?? '').trim().toUpperCase()
        : '';
    const key = `${order}|${mat}|${len}|${h}|${edge}|${part}`;
    if (!mergedMap[key]) mergedMap[key] = [];
    mergedMap[key].push(r);
  });

  const finalRows = [];
  for (const key in mergedMap) {
    const rList = mergedMap[key];
    const normalizedPart = normalizePartNameForMergedRow(rList, colIndices);

    if (rList.length > 1) {
      const firstRow = [...rList[0]];
      const qtySum = rList.reduce((sum, r) => sum + (parseInt(r[colIndices.quantity]) || 0), 0);
      firstRow[colIndices.quantity] = String(qtySum);
      if (colIndices.partName !== -1 && colIndices.partName < firstRow.length) {
        firstRow[colIndices.partName] = normalizedPart;
      }
      if (colIndices.label !== -1 && colIndices.label < firstRow.length) {
        firstRow[colIndices.label] = '';
      }
      finalRows.push(firstRow);
    } else {
      const singleRow = [...rList[0]];
      if (colIndices.partName !== -1 && colIndices.partName < singleRow.length) {
        singleRow[colIndices.partName] = normalizedPart;
      }
      finalRows.push(singleRow);
    }
  }
  return finalRows;
}

function buildSummaryData(finalRows, colIndices) {
  const uniqueOrders = new Set();
  const uniqueHeights = new Set();
  const summaryData = {};
  let totalParts = 0;

  finalRows.forEach((row) => {
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

  return { sortedHeights, sortedOrders, summaryData, totalParts };
}

/**
 * Split parsed rows into material/top-edge batches, applying per-group split limits,
 * round-robin order scattering, row merging, sorting, summary data, and box math.
 *
 * This is the heart of the app. Behavior is preserved exactly from the original
 * index.html implementation.
 *
 * When separateSpecialOrders is true, special orders batch by material + top edge +
 * ship date (SPECIAL_ prefix). If any row on a sales order is special, the entire
 * order is special — rows are never split between normal and SPECIAL batches.
 *
 * @param {string[][]} rows
 * @param {object} colIndices
 * @param {number} maxOrdersPerBatch
 * @param {Record<string, number>} groupSplitLimits  keyed by raw tempKey
 * @param {boolean} separateSpecialOrders
 * @param {boolean} combineShipDates  when true, ignore ship date in batch keys
 * @returns {Record<string, object>} finalized groups keyed by batchKey
 */
export function splitDataIntoGroups(
  rows,
  colIndices,
  maxOrdersPerBatch,
  groupSplitLimits = {},
  separateSpecialOrders = false,
  combineShipDates = false
) {
  const specialOrders = separateSpecialOrders
    ? getSpecialOrderNumbers(rows, colIndices)
    : new Set();
  const orderShipDates = buildOrderShipDateMap(rows, colIndices);

  const rawGroups = {};
  rows.forEach((row) => {
    const rawMaterial = row[colIndices.materialName] || '';
    const material = cleanMaterialName(rawMaterial);
    const topEdge = (row[colIndices.topEdge] || '').trim();
    const cat = getMaterialCategory(material, topEdge);
    const catCode = CATEGORY_CODES[cat];
    const edgeCode = getEdgeCode(topEdge);
    const orderNum = String(row[colIndices.orderNumber] ?? '').trim();
    const isSpecial = specialOrders.has(orderNum);
    const prefix = isSpecial ? 'SPECIAL_' : '';
    const shipToken = combineShipDates
      ? ''
      : shipDateGroupingToken(orderNum, orderShipDates, colIndices);
    const tempKey = `${prefix}${catCode}_${edgeCode}_${material}_${topEdge}${shipToken}`;
    const shipDate = getShipDateFromRow(row, colIndices) || orderShipDates[orderNum] || '';

    if (!rawGroups[tempKey]) {
      rawGroups[tempKey] = {
        rows: [],
        materialName: material,
        topEdge,
        categoryName: cat,
        isSpecial,
        shipDate,
      };
    }
    rawGroups[tempKey].rows.push(row);
  });

  const finalizedGroups = {};

  for (const tempKey in rawGroups) {
    const g = rawGroups[tempKey];

    const ordersInGroupSet = new Set();
    g.rows.forEach((r) => ordersInGroupSet.add(r[colIndices.orderNumber] || 'Unknown'));
    const sortedOrdersInGroup = Array.from(ordersInGroupSet).sort();

    const groupOrderLimit = groupSplitLimits[tempKey] || maxOrdersPerBatch;
    const orderChunks = scatterOrdersIntoChunks(sortedOrdersInGroup, groupOrderLimit);

    orderChunks.forEach((chunk) => {
      const chunkRows = g.rows.filter((r) => chunk.includes(r[colIndices.orderNumber] || 'Unknown'));
      if (chunkRows.length === 0) return;

      const firstOrder = chunk[0];
      const catCode = CATEGORY_CODES[g.categoryName];
      const edgeCode = getEdgeCode(g.topEdge);
      const baseBatchKey = `${g.isSpecial ? 'SPECIAL_' : ''}${catCode}_${edgeCode}_${firstOrder}`;

      let finalKey = baseBatchKey;
      let counter = 1;
      while (finalizedGroups[finalKey]) {
        counter++;
        finalKey = `${baseBatchKey}_${counter}`;
      }

      const orderGroupBoxTotals = buildOrderGroupBoxTotalsFromRows(chunkRows, colIndices);
      const finalRows = sortRowsDescending(mergeChunkRows(chunkRows, colIndices), colIndices);
      const { sortedHeights, sortedOrders, summaryData, totalParts } = buildSummaryData(
        finalRows,
        colIndices
      );

      const { heightOrderBoxes, heightRowTotals, orderPartTotals, orderColTotals } =
        computeBoxMatrix(sortedHeights, sortedOrders, summaryData);

      const reconciledOrderColTotals = reconcileOrderColTotals(orderColTotals, orderGroupBoxTotals);
      const reconciledTotalBoxes = sumOrderColTotals(reconciledOrderColTotals, sortedOrders);

      finalizedGroups[finalKey] = {
        rows: finalRows,
        sourceRows: chunkRows,
        sourceGroupKey: tempKey,
        materialName: g.materialName,
        topEdge: g.topEdge,
        categoryName: g.categoryName,
        isSpecial: g.isSpecial,
        shipDate: combineShipDates
          ? formatCombinedShipDateLabel(chunkRows, colIndices, orderShipDates)
          : g.shipDate,
        orderGroupBoxTotals,
        sortedHeights,
        sortedOrders,
        heightOrderBoxes,
        heightRowTotals,
        orderPartTotals,
        orderColTotals: reconciledOrderColTotals,
        totalBoxes: reconciledTotalBoxes,
        totalParts,
      };
    });
  }

  return finalizedGroups;
}

/**
 * Apply exclusions (orders, materials, top edges) to a set of rows.
 * Comparison is case-insensitive. Returns the filtered rows (does not mutate input).
 *
 * @param {string[][]} rows
 * @param {object} colIndices
 * @param {{ orders: string[], materials: string[], topEdges: string[] }} exclusions
 * @returns {string[][]}
 */
export function applyExclusions(rows, colIndices, exclusions) {
  const { orders = [], materials = [], topEdges = [] } = exclusions;
  return rows.filter((row) => {
    const rowOrder = String(row[colIndices.orderNumber] || '').trim();
    const rowMaterial = cleanMaterialName(row[colIndices.materialName] || '').toLowerCase();
    const rowTopEdge = normalizeTopEdgeName(row[colIndices.topEdge] || '').toLowerCase();
    if (orders.includes(rowOrder)) return false;
    if (materials.some((m) => m.toLowerCase() === rowMaterial)) return false;
    if (topEdges.some((e) => e.toLowerCase() === rowTopEdge)) return false;
    return true;
  });
}
