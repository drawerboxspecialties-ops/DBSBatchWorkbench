import { boxesForParts } from './boxMath.js';
import {
  getStackMatrixWidth,
  formatDecimalForDisplay,
  getNumericSortValue,
  getFractionalSortValue,
} from './widths.js';
import { getSpecialGroupKeys, getGroupSpecialKey } from './specialOrders.js';

/** Shop-floor mark: front material differs from B/L/R for this drawer. */
export const DFM_MARK = '*DFM';

/** @typedef {{ w: string, length: string }} PartDim */

/**
 * Stable key for matching a drawer across material batches (order + GroupID).
 * @param {string} order
 * @param {string} [groupId='']
 * @returns {string}
 */
export function dfmDrawerKey(order, groupId = '') {
  return `${String(order ?? '').trim()}|${String(groupId ?? '').trim()}`;
}

/**
 * Find drawers whose Front material differs from Back/Left/Right material.
 * Keys are `order|groupId` (blank groupId when GroupID is absent).
 *
 * @param {string[][]} rows
 * @param {object} colIndices
 * @returns {Set<string>}
 */
export function getDifferentFrontMaterialKeys(rows, colIndices) {
  const keys = new Set();
  if (!rows?.length || !colIndices || colIndices.materialName === -1) return keys;

  /** @type {Map<string, { fronts: Set<string>, sides: Set<string> }>} */
  const byDrawer = new Map();

  rows.forEach((row) => {
    const order = String(row[colIndices.orderNumber] ?? '').trim();
    if (!order) return;
    const side = getPartSide(row, colIndices);
    if (!side) return;
    const material = String(row[colIndices.materialName] ?? '')
      .trim()
      .toLowerCase();
    if (!material) return;
    const groupId =
      colIndices.groupId !== -1 && colIndices.groupId < row.length
        ? String(row[colIndices.groupId] ?? '').trim()
        : '';
    const key = dfmDrawerKey(order, groupId);
    if (!byDrawer.has(key)) {
      byDrawer.set(key, { fronts: new Set(), sides: new Set() });
    }
    const entry = byDrawer.get(key);
    if (side === 'front') entry.fronts.add(material);
    else entry.sides.add(material);
  });

  byDrawer.forEach((entry, key) => {
    if (!entry.fronts.size || !entry.sides.size) return;
    const same =
      entry.fronts.size === entry.sides.size &&
      [...entry.fronts].every((m) => entry.sides.has(m));
    if (!same) keys.add(key);
  });

  return keys;
}

/**
 * @param {string[]} row
 * @param {object} colIndices
 * @returns {'front'|'back'|'left'|'right'|''}
 */
function getPartSide(row, colIndices) {
  if (colIndices.partName === -1 || colIndices.partName >= row.length) return '';
  const part = String(row[colIndices.partName] ?? '').trim().toUpperCase();
  if (part.startsWith('F') || part.includes('FRONT')) return 'front';
  if (part.startsWith('B') || part.includes('BACK')) return 'back';
  if (part.startsWith('L') || part.includes('LEFT')) return 'left';
  if (part.startsWith('R') || part.includes('RIGHT')) return 'right';
  if (part.includes('SIDE')) return 'left';
  return '';
}

/**
 * @param {string[]} row
 * @param {object} colIndices
 * @returns {PartDim}
 */
function readPartDim(row, colIndices) {
  const w =
    colIndices.w !== -1 && colIndices.w < row.length
      ? formatDecimalForDisplay(String(row[colIndices.w] ?? '').trim())
      : '';
  const length = formatDecimalForDisplay(String(row[colIndices.length] ?? '').trim());
  return { w, length };
}

function drawerSetKey(order, groupId, label) {
  const gid = String(groupId ?? '').trim();
  const lab = String(label ?? '').trim();
  if (gid && lab) return `${order}|g:${gid}|l:${lab}`;
  if (gid) return `${order}|g:${gid}`;
  if (lab) return `${order}|l:${lab}`;
  return '';
}

function compareGroupIds(a, b) {
  const idA = String(a.groupId ?? '').trim();
  const idB = String(b.groupId ?? '').trim();
  if (idA === idB) return 0;
  if (!idA) return 1;
  if (!idB) return -1;
  return idA.localeCompare(idB, undefined, { numeric: true });
}

function emptySide() {
  return { w: '', length: '' };
}

function setSide(target, dim) {
  if (!dim.w && !dim.length) return;
  target.w = dim.w;
  target.length = dim.length;
}

function sumPartQtys(parts) {
  return parts.reduce((sum, p) => sum + p.qty, 0);
}

function sortFrontParts(fronts) {
  return fronts.slice().sort((a, b) => {
    const swDiff = b.stackWidthSort - a.stackWidthSort;
    if (swDiff !== 0) return swDiff;
    return getFractionalSortValue(b.dim.length) - getFractionalSortValue(a.dim.length);
  });
}

function buildBoxLineFromFront(lead, bucket) {
  return {
    order: bucket.order,
    groupId: bucket.groupId,
    lineLabel: bucket.lineLabel,
    special: bucket.special,
    dfm: bucket.dfm,
    width: lead.stackWidth,
    stackWidthSort: lead.stackWidthSort,
    front: { ...lead.dim },
    back: emptySide(),
    left: emptySide(),
    right: emptySide(),
    parts: 0,
  };
}

function pairDrawerSides(line, lead, backs, lefts, rights, usedBack, usedLeft, usedRight) {
  line.parts = lead.qty;
  const back = pickClosestWPart(backs, usedBack, lead, { requireLength: true });
  if (back) {
    setSide(line.back, back.dim);
    line.parts += back.qty;
  }
  const leftPart = pickClosestWPart(lefts, usedLeft, lead);
  if (leftPart) {
    setSide(line.left, leftPart.dim);
    line.parts += leftPart.qty;
  }
  const rightPart = pickClosestWPart(rights, usedRight, lead);
  if (rightPart) {
    setSide(line.right, rightPart.dim);
    line.parts += rightPart.qty;
  }
}

function pickClosestWPart(list, used, lead, { requireLength } = {}) {
  let best = null;
  let bestIdx = -1;
  let bestDiff = Infinity;

  list.forEach((p, i) => {
    if (used.has(i)) return;
    if (requireLength && p.dim.length !== lead.dim.length) return;
    if (lead.dim.w && p.dim.w) {
      const diff = Math.abs(parseFloat(p.dim.w) - parseFloat(lead.dim.w));
      if (Number.isFinite(diff) && diff < bestDiff) {
        best = p;
        bestIdx = i;
        bestDiff = diff;
      }
      return;
    }
    if (!requireLength && p.stackWidth === lead.stackWidth && bestDiff === Infinity) {
      best = p;
      bestIdx = i;
    }
  });

  if (best) {
    used.add(bestIdx);
    return best;
  }
  return null;
}

function boxRowMergeKey(row) {
  return [
    row.order,
    row.groupId,
    row.width,
    row.front.length,
    row.back.length,
    row.left.length,
    row.right.length,
    row.special ? '1' : '0',
    row.dfm ? '1' : '0',
  ].join('|');
}

/** Combine rows with identical dimensions so print matches export merge behavior. */
function mergeIdenticalBoxRows(rows) {
  const merged = [];
  const indexByKey = new Map();
  rows.forEach((row) => {
    const key = boxRowMergeKey(row);
    const existingIndex = indexByKey.get(key);
    if (existingIndex !== undefined) {
      merged[existingIndex].parts += row.parts;
      return;
    }
    indexByKey.set(key, merged.length);
    merged.push({ ...row });
  });
  return merged;
}

/**
 * Build cut-list print sections: one row per box line with rounded drawer width,
 * Front/Back length, and Left/Right length (shop cut-list layout).
 *
 * @param {{ sourceRows?: string[][], rows?: string[][] }} batch
 * @param {object} colIndices
 * @param {{ allRows?: string[][], dfmKeys?: Set<string> }} [options]
 *   Pass `allRows` (full import) or precomputed `dfmKeys` so cross-material
 *   fronts are marked with *DFM on both the front sheet and the side sheet.
 */
export function getCutListPrintSections(batch, colIndices, options = {}) {
  const rows = batch?.sourceRows?.length ? batch.sourceRows : batch?.rows || [];
  if (!rows.length || !colIndices) return [];

  const dfmKeys =
    options.dfmKeys ||
    getDifferentFrontMaterialKeys(options.allRows?.length ? options.allRows : rows, colIndices);
  const isDfm = (order, groupId) => dfmKeys.has(dfmDrawerKey(order, groupId));

  const specialGroups = getSpecialGroupKeys(rows, colIndices);
  const hasGroupId = colIndices.groupId !== -1;
  const hasLabel = colIndices.label !== -1;
  const isGroupSpecial = (order, groupId, label) =>
    specialGroups.has(getGroupSpecialKey(order, groupId, label));
  /** @type {Map<string, { order: string, groupId: string, label: string, lineLabel: string, special: boolean, dfm: boolean, parts: object[] }>} */
  const buckets = new Map();

  rows.forEach((row) => {
    const order = String(row[colIndices.orderNumber] ?? '').trim();
    const side = getPartSide(row, colIndices);
    const dim = readPartDim(row, colIndices);
    const qty = parseInt(row[colIndices.quantity]) || 0;
    if (!side || !dim.length || qty <= 0) return;

    const stackWidth = formatDecimalForDisplay(getStackMatrixWidth(row, colIndices));
    const groupId =
      hasGroupId && colIndices.groupId < row.length
        ? String(row[colIndices.groupId] ?? '').trim()
        : '';
    const label =
      hasLabel && colIndices.label < row.length
        ? String(row[colIndices.label] ?? '').trim()
        : '';
    const setKey = drawerSetKey(order, groupId, label) || `${order}|w:${stackWidth}`;

    if (!buckets.has(setKey)) {
      buckets.set(setKey, {
        order,
        groupId,
        label,
        lineLabel: label,
        special: isGroupSpecial(order, groupId, label),
        dfm: isDfm(order, groupId),
        parts: [],
      });
    }

    buckets.get(setKey).parts.push({
      side,
      dim,
      qty,
      stackWidth,
      stackWidthSort: getFractionalSortValue(stackWidth),
      lengthSort: getFractionalSortValue(dim.length),
    });
  });

  const boxRows = [];

  buckets.forEach((bucket) => {
    const fronts = bucket.parts.filter((p) => p.side === 'front');
    const backs = bucket.parts.filter((p) => p.side === 'back');
    const lefts = bucket.parts.filter((p) => p.side === 'left');
    const rights = bucket.parts.filter((p) => p.side === 'right');

    if (fronts.length === 0) {
      const byWidth = new Map();
      [...lefts, ...rights, ...backs].forEach((p) => {
        if (!byWidth.has(p.stackWidth)) {
          byWidth.set(p.stackWidth, {
            order: bucket.order,
            groupId: bucket.groupId,
            lineLabel: bucket.lineLabel,
            special: bucket.special,
            dfm: bucket.dfm,
            width: p.stackWidth,
            stackWidthSort: p.stackWidthSort,
            front: emptySide(),
            back: emptySide(),
            left: emptySide(),
            right: emptySide(),
            parts: 0,
          });
        }
        const line = byWidth.get(p.stackWidth);
        if (p.side === 'left') setSide(line.left, p.dim);
        if (p.side === 'right') setSide(line.right, p.dim);
        if (p.side === 'back') setSide(line.back, p.dim);
        line.parts += p.qty;
      });
      byWidth.forEach((line) => boxRows.push(line));
      return;
    }

    const frontGroups = new Map();
    fronts.forEach((p) => {
      const key = `${p.dim.w}|${p.dim.length}|${p.stackWidth}`;
      if (!frontGroups.has(key)) frontGroups.set(key, []);
      frontGroups.get(key).push(p);
    });

    const usedBack = new Set();
    const usedLeft = new Set();
    const usedRight = new Set();

    if (frontGroups.size === 1) {
      const group = frontGroups.values().next().value;
      const lead = group[0];
      const line = buildBoxLineFromFront(lead, bucket);
      line.parts = sumPartQtys(bucket.parts);

      const back = pickClosestWPart(backs, usedBack, lead, { requireLength: true });
      if (back) setSide(line.back, back.dim);

      const pickFirstUnused = (list, used) => {
        const idx = list.findIndex((_, i) => !used.has(i));
        if (idx === -1) return null;
        used.add(idx);
        return list[idx];
      };
      const leftPart = pickFirstUnused(lefts, usedLeft);
      const rightPart = pickFirstUnused(rights, usedRight);
      if (leftPart) setSide(line.left, leftPart.dim);
      if (rightPart) setSide(line.right, rightPart.dim);

      boxRows.push(line);
      return;
    }

    sortFrontParts(fronts).forEach((lead) => {
      const line = buildBoxLineFromFront(lead, bucket);
      pairDrawerSides(line, lead, backs, lefts, rights, usedBack, usedLeft, usedRight);
      boxRows.push(line);
    });
  });

  boxRows.sort((a, b) => {
    const orderA = getNumericSortValue(a.order);
    const orderB = getNumericSortValue(b.order);
    if (orderA !== orderB) return orderA - orderB;
    if (a.order !== b.order) return a.order.localeCompare(b.order);
    const groupCmp = compareGroupIds(a, b);
    if (groupCmp !== 0) return groupCmp;
    if (b.stackWidthSort !== a.stackWidthSort) return b.stackWidthSort - a.stackWidthSort;
    const aLen = getFractionalSortValue(a.front.length || a.left.length);
    const bLen = getFractionalSortValue(b.front.length || b.left.length);
    return bLen - aLen;
  });

  const mergedBoxRows = mergeIdenticalBoxRows(boxRows);

  const sections = [];
  mergedBoxRows.forEach((row) => {
    const last = sections[sections.length - 1];
    if (!last || last.order !== row.order) {
      sections.push({ order: row.order, special: false, rows: [] });
    }
    const section = sections[sections.length - 1];
    const frontOnlyDfm = Boolean(row.dfm) && !row.left.length && !row.right.length;
    // Front-only *DFM: each front is one drawer box (sides live on another cut list).
    const boxes = frontOnlyDfm ? row.parts : boxesForParts(row.parts);
    section.rows.push({
      parts: row.parts,
      boxes,
      groupId: row.groupId,
      special: row.special,
      dfm: Boolean(row.dfm),
      frontOnlyDfm,
      width: row.width,
      fbLength: row.front.length || row.back.length,
      lrLength: row.left.length || row.right.length,
    });
    if (row.special) section.special = true;
  });

  return sections;
}
