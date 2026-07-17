import { getExportMaterialName } from './materialNames.js';
import { roundWidthUpToWhole, formatDecimalForDisplay, formatWidthQtyNote } from './widths.js';
import { getBatchingOnlyColumnIndices } from './headers.js';

/**
 * Build a base export row: clean material name, optionally round Width up,
 * blank W, blank Label. Returns a new array (does not mutate input).
 *
 * @param {string[]} row
 * @param {object} colIndices
 * @param {boolean} roundWidth
 * @returns {string[]}
 */
export function prepareBaseExportRow(row, colIndices, roundWidth = false) {
  const exportRow = [...row];
  if (colIndices.materialName !== -1 && colIndices.materialName < exportRow.length) {
    exportRow[colIndices.materialName] = getExportMaterialName(exportRow[colIndices.materialName]);
  }
  if (roundWidth && colIndices.width !== -1 && colIndices.width < exportRow.length) {
    exportRow[colIndices.width] = roundWidthUpToWhole(exportRow[colIndices.width]);
  }
  if (colIndices.w !== -1 && colIndices.w < exportRow.length) {
    exportRow[colIndices.w] = '';
  }
  if (colIndices.label !== -1 && colIndices.label < exportRow.length) {
    exportRow[colIndices.label] = '';
  }
  return exportRow;
}

/**
 * Merge key for rounded-width export: all columns except Quantity and Label.
 * @param {string[]} exportRow
 * @param {object} colIndices
 * @param {number[]} [excludedIndices=[]] column indices omitted from the merge key
 * @returns {string}
 */
export function getRoundedExportMergeKey(exportRow, colIndices, excludedIndices = []) {
  const excluded = new Set(excludedIndices);
  return exportRow
    .map((value, idx) => {
      if (
        idx === colIndices.quantity ||
        idx === colIndices.label ||
        excluded.has(idx)
      ) {
        return '';
      }
      return String(value ?? '').trim();
    })
    .join('|');
}

function addCountToMap(map, key, qty) {
  if (!key) return;
  map[key] = (map[key] || 0) + qty;
}

/**
 * Merge key for pairing opposite sides: all columns except PartName, Quantity, and Label.
 * @param {string[]} exportRow
 * @param {object} colIndices
 * @param {number[]} [excludedIndices=[]]
 * @returns {string}
 */
export function getExportCombineKey(exportRow, colIndices, excludedIndices = []) {
  const excluded = new Set([
    ...excludedIndices,
    colIndices.partName,
    colIndices.quantity,
    colIndices.label,
  ]);
  return exportRow
    .map((value, idx) => {
      if (excluded.has(idx)) return '';
      return String(value ?? '').trim();
    })
    .join('|');
}

function normalizeExportPartSide(partName) {
  const part = String(partName ?? '').trim().toUpperCase();
  if (part.startsWith('F') || part.includes('FRONT')) return 'F';
  if (part.startsWith('B') || part.includes('BACK')) return 'B';
  if (part.startsWith('L') || part.includes('LEFT')) return 'L';
  if (part.startsWith('R') || part.includes('RIGHT')) return 'R';
  return part;
}

function mergeLabelValues(labelA, labelB) {
  const a = String(labelA ?? '').trim();
  const b = String(labelB ?? '').trim();
  if (!a) return b;
  if (!b || a === b) return a;
  return a;
}

/**
 * When F and B (or L and R) share the same exported Width and Length, emit one row
 * with PartName F (front/back) or L (left/right) and summed Quantity.
 *
 * @param {string[][]} rows
 * @param {object} colIndices
 * @param {number[]} [excludedIndices=[]]
 * @returns {string[][]}
 */
export function combineOppositePartSides(rows, colIndices, excludedIndices = []) {
  if (colIndices.partName === -1 || colIndices.length === -1) return rows;

  const mergePair = (inputRows, sideA, sideB, combinedName) => {
    const passthrough = [];
    /** @type {Map<string, { row: string[], [key: string]: string[] }>} */
    const groups = new Map();

    inputRows.forEach((row) => {
      const side = normalizeExportPartSide(row[colIndices.partName]);
      if (side !== sideA && side !== sideB) {
        passthrough.push(row);
        return;
      }

      const key = getExportCombineKey(row, colIndices, excludedIndices);
      if (!groups.has(key)) {
        groups.set(key, { row: [...row] });
      }
      groups.get(key)[side] = row;
    });

    const combined = [];
    groups.forEach((bucket) => {
      const rowA = bucket[sideA];
      const rowB = bucket[sideB];
      if (rowA && rowB) {
        const mergedRow = [...bucket.row];
        mergedRow[colIndices.partName] = combinedName;
        const qtyA = parseInt(rowA[colIndices.quantity]) || 0;
        const qtyB = parseInt(rowB[colIndices.quantity]) || 0;
        mergedRow[colIndices.quantity] = String(qtyA + qtyB);
        if (colIndices.label !== -1 && colIndices.label < mergedRow.length) {
          mergedRow[colIndices.label] = mergeLabelValues(
            rowA[colIndices.label],
            rowB[colIndices.label]
          );
        }
        combined.push(mergedRow);
        return;
      }
      if (rowA) combined.push(rowA);
      if (rowB) combined.push(rowB);
    });

    return [...passthrough, ...combined];
  };

  let result = mergePair(rows, 'F', 'B', 'F');
  result = mergePair(result, 'L', 'R', 'L');
  return result;
}

/**
 * Rows to feed into export: always prefer unmerged source rows so part sides and
 * distinct drawer sizes are not lost before rounded-width merging.
 *
 * @param {{ sourceRows?: string[][], rows?: string[][] }} batch
 * @returns {string[][]}
 */
export function getBatchExportRows(batch) {
  if (batch?.sourceRows?.length) return batch.sourceRows;
  return batch?.rows || [];
}

/**
 * Build the cut-list rows for export.
 *
 * When roundExportWidths is true:
 *   - round Width up to whole numbers
 *   - merge rows that become identical (all columns except Qty/Label)
 *   - sum quantities
 *   - record original width quantities in Label as "Rounded from Width: <w> x<n>, ..."
 *     only when the original widths differ from the rounded width.
 *
 * When false: just prepare each row (clean material, blank W, blank Label).
 *
 * @param {string[][]} rows
 * @param {object} colIndices
 * @param {boolean} roundExportWidths
 * @param {string[]} [headers] when provided, batching-only columns are excluded from merge keys
 * @returns {string[][]}
 */
export function getCutListRowsForExport(rows, colIndices, roundExportWidths, headers = null) {
  if (colIndices.materialName === -1) return rows;

  const excludedIndices = headers ? getBatchingOnlyColumnIndices(headers) : [];

  if (roundExportWidths && colIndices.width !== -1) {
    const merged = {};
    rows.forEach((row) => {
      const exportRow = prepareBaseExportRow(row, colIndices, true);
      const key = getRoundedExportMergeKey(exportRow, colIndices, excludedIndices);
      const qty = parseInt(row[colIndices.quantity]) || 0;
      const originalWidth =
        colIndices.width !== -1 && colIndices.width < row.length
          ? String(row[colIndices.width] || '').trim()
          : '';

      if (!merged[key]) {
        merged[key] = { row: exportRow, qty: 0, originalWidths: {} };
      }
      merged[key].qty += qty;
      addCountToMap(merged[key].originalWidths, originalWidth, qty);
    });

    const roundedRows = Object.values(merged).map((group) => {
      const exportRow = group.row;
      if (colIndices.quantity !== -1 && colIndices.quantity < exportRow.length) {
        exportRow[colIndices.quantity] = String(group.qty);
      }
      if (colIndices.label !== -1 && colIndices.label < exportRow.length) {
        const roundedWidth =
          colIndices.width !== -1 && colIndices.width < exportRow.length
            ? formatDecimalForDisplay(exportRow[colIndices.width])
            : '';
        const originalWidths = Object.keys(group.originalWidths).map(formatDecimalForDisplay);
        const changed =
          originalWidths.length > 1 ||
          originalWidths.some((width) => width && width !== roundedWidth);
        exportRow[colIndices.label] = changed
          ? `Rounded from Width: ${formatWidthQtyNote(group.originalWidths)}`
          : '';
      }
      return exportRow;
    });
    return combineOppositePartSides(roundedRows, colIndices, excludedIndices);
  }

  const preparedRows = rows.map((row) => prepareBaseExportRow(row, colIndices, false));
  return combineOppositePartSides(preparedRows, colIndices, excludedIndices);
}
