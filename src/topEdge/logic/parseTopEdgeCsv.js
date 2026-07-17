import { parseFraction, getCutHeight } from './calculatorLogic.js';

/**
 * Parse an Allmoxy CSV export into an array of top-edge report items.
 *
 * Preserves exact behavior from the original index.html parseCSV:
 *  - Inch-quote quirk: a closing quote not followed by delimiter/EOL is kept as
 *    a literal character (handles cells like 5.25" in non-quoted fields).
 *  - Adaptive column detection: when header-based detection fails for key columns,
 *    samples up to 5 data rows to find consistently-numeric columns.
 *  - preCalculated path: rows with parts/lf/rips already provided skip dimension math.
 *  - Dimensional path: rows with qty+width+depth+height get perimeter computed later.
 *  - getCutHeight is applied to the raw height value for every row.
 *
 * @param {string} text  Raw CSV file contents
 * @returns {{ items: object[], orderIds: string[], materials: string[], skippedRows: number }}
 */
export function parseTopEdgeCSV(text) {
  let delimiter = ',';
  if (text.includes('\t') && text.split('\t').length > text.split(',').length) {
    delimiter = '\t';
  }

  const lines = text.split(/\r?\n/);
  if (lines.length < 2) return { items: [], orderIds: [], materials: [], skippedRows: 0 };

  function parseCSVLine(line) {
    const cells = [];
    let cell = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (char === '"' && inQuotes && nextChar === '"') {
        // Escaped double-quote inside quoted field
        cell += '"';
        i++;
      } else if (char === '"' && inQuotes) {
        const nextIsDelimiter = nextChar === delimiter || nextChar === undefined;
        if (nextIsDelimiter) {
          inQuotes = false;
        } else {
          // Inch-quote quirk: closing quote not at end of field treated as literal
          cell += char;
        }
      } else if (char === '"' && cell.trim() === '') {
        inQuotes = true;
      } else if (char === '"') {
        cell += char;
      } else if (char === delimiter && !inQuotes) {
        cells.push(cell.trim());
        cell = '';
      } else {
        cell += char;
      }
    }
    cells.push(cell.trim());
    return cells;
  }

  const firstLineCells = parseCSVLine(lines[0]);
  const headers = firstLineCells.map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''));

  let qtyIdx    = headers.findIndex(h => h.includes('qty') || h.includes('quant') || h.includes('pieces') || h.includes('piece') || h.includes('count'));
  let widthIdx  = headers.findIndex(h => h === 'w' || h === 'width' || h.includes('width'));
  let depthIdx  = headers.findIndex(h => h === 'd' || h === 'depth' || h.includes('depth') || h.includes('length') || h === 'len');
  let heightIdx = headers.findIndex(h => h === 'h' || h === 'height' || h.includes('height'));
  let matIdx    = headers.findIndex(h => h.includes('material') || h.includes('species') || h.includes('wood') || h === 'mat');
  let edgeIdx   = headers.findIndex(h => h.includes('edge') || h.includes('banding') || h.includes('foil') || h.includes('tape'));
  let orderIdx  = headers.findIndex(h => h.includes('order') || h.includes('invoice') || h.includes('quote'));

  // Pre-calculated column detection
  let lfIdx    = headers.findIndex(h => h === 'lf' || h.includes('linearfeet') || h.includes('linearfoot'));
  let ripsIdx  = headers.findIndex(h => h === 'rips' || h.includes('ripcount') || h.includes('rip'));
  let partsIdx = headers.findIndex(h => h === 'parts' || h.includes('partcount'));

  function getCell(cells, idx, fallback = '') {
    return idx !== -1 && idx < cells.length ? cells[idx] : fallback;
  }

  function inferMaterial(cells) {
    const direct = getCell(cells, matIdx).trim();
    if (direct) return direct;

    const materialTerms = /(?:\b(?:faa|mdf|pbc|melamine|particle|plywood|ply|birch|maple|oak|cherry|walnut|alder|mahogany|cedar|beech|fir|solid)\b|pf:|uf:)/i;
    const edgeTerms = /\b(edge|foil|bullnose|banding|pvc|tape)\b/i;
    const match =
      cells.find(cell => materialTerms.test(cell) && !edgeTerms.test(cell)) ||
      cells.find(cell => materialTerms.test(cell));
    return match ? match.trim() : 'PF: 12MM Baltic Birch Ply';
  }

  function inferTopEdge(cells) {
    const direct = getCell(cells, edgeIdx).trim();
    if (direct) return direct;

    const edgeTerms = /\b(edge|foil|bullnose|banding|pvc|tape)\b/i;
    const match = cells.find(cell => edgeTerms.test(cell));
    return match ? match.trim() : 'Clear Foil Bullnose';
  }

  // Adaptive fallback when header-based detection fails for key dimension columns
  if (qtyIdx === -1 || widthIdx === -1 || depthIdx === -1 || heightIdx === -1) {
    const colNumericStats = {};
    let sampleRowsCount = 0;

    for (let i = 1; i < Math.min(lines.length, 6); i++) {
      if (!lines[i].trim()) continue;
      const cells = parseCSVLine(lines[i]);
      sampleRowsCount++;
      cells.forEach((cell, idx) => {
        const parsed = parseFraction(cell);
        if (!isNaN(parsed) && parsed > 0) {
          colNumericStats[idx] = (colNumericStats[idx] || 0) + 1;
        }
      });
    }

    const detectedNumCols = [];
    for (const idx in colNumericStats) {
      if (colNumericStats[idx] === sampleRowsCount) {
        detectedNumCols.push(parseInt(idx));
      }
    }
    detectedNumCols.sort((a, b) => a - b);

    if (detectedNumCols.length >= 4) {
      if (detectedNumCols.length >= 5) {
        if (qtyIdx === -1)    qtyIdx    = detectedNumCols[1];
        if (widthIdx === -1)  widthIdx  = detectedNumCols[2];
        if (depthIdx === -1)  depthIdx  = detectedNumCols[3];
        if (heightIdx === -1) heightIdx = detectedNumCols[4];
      } else {
        if (qtyIdx === -1)    qtyIdx    = detectedNumCols[0];
        if (widthIdx === -1)  widthIdx  = detectedNumCols[1];
        if (depthIdx === -1)  depthIdx  = detectedNumCols[2];
        if (heightIdx === -1) heightIdx = detectedNumCols[3];
      }
    } else if (detectedNumCols.length === 3) {
      if (widthIdx === -1)  widthIdx  = detectedNumCols[0];
      if (depthIdx === -1)  depthIdx  = detectedNumCols[1];
      if (heightIdx === -1) heightIdx = detectedNumCols[2];
    }
  }

  // Hard fallbacks
  if (qtyIdx === -1)    qtyIdx    = 1;
  if (widthIdx === -1)  widthIdx  = 2;
  if (depthIdx === -1)  depthIdx  = 3;
  if (heightIdx === -1) heightIdx = 4;

  const parsedItems = [];
  const orderIds = [];
  const materials = [];
  let skippedRows = 0;

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cells = parseCSVLine(lines[i]);

    const qty      = qtyIdx !== -1 && qtyIdx < cells.length ? Math.round(parseFraction(cells[qtyIdx])) : 1;
    const width    = widthIdx !== -1 && widthIdx < cells.length ? parseFraction(cells[widthIdx]) : 0;
    const depth    = depthIdx !== -1 && depthIdx < cells.length ? parseFraction(cells[depthIdx]) : 0;
    const material = inferMaterial(cells).trim();
    const topEdge  = inferTopEdge(cells).trim();
    const rawHeight = heightIdx !== -1 && heightIdx < cells.length ? parseFraction(cells[heightIdx]) : 0;
    const height   = getCutHeight(rawHeight, topEdge, material);
    const parts    = partsIdx !== -1 && partsIdx < cells.length ? Math.round(parseFraction(cells[partsIdx])) : 0;
    const lf       = lfIdx !== -1 && lfIdx < cells.length ? parseFraction(cells[lfIdx]) : 0;
    const rips     = ripsIdx !== -1 && ripsIdx < cells.length ? parseFraction(cells[ripsIdx]) : 0;
    let itemAdded  = false;

    let oId = '';
    if (orderIdx !== -1 && orderIdx < cells.length && cells[orderIdx]) {
      oId = cells[orderIdx].replace(/[^0-9]/g, '');
      if (oId && !orderIds.includes(oId)) {
        orderIds.push(oId);
      }
    }

    if (parts > 0 || lf > 0 || rips > 0) {
      // preCalculated path
      const boxes = parts > 0 ? Math.max(1, Math.ceil(parts / 4)) : Math.max(1, qty);

      parsedItems.push({
        qty: boxes,
        width: 0,
        depth: 0,
        height: height || 4,
        topEdge: topEdge || 'Clear Foil Bullnose',
        material: material || 'PF: 12MM Baltic Birch Ply',
        parts: parts || boxes * 4,
        lf,
        rips,
        preCalculated: true,
        orderId: oId
      });
      itemAdded = true;
    } else if (qty > 0 && width > 0 && depth > 0 && height > 0) {
      // Dimensional path
      parsedItems.push({
        qty,
        width,
        depth,
        height,
        topEdge: topEdge || 'Clear Foil Bullnose',
        material: material || 'PF: 12MM Baltic Birch Ply',
        orderId: oId
      });
      itemAdded = true;
    }

    if (itemAdded) {
      const materialName = material || 'PF: 12MM Baltic Birch Ply';
      if (!materials.includes(materialName)) {
        materials.push(materialName);
      }
    } else {
      skippedRows++;
    }
  }

  return { items: parsedItems, orderIds, materials, skippedRows };
}
