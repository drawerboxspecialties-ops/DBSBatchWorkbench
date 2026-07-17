import { escapeHTML, escapeAttr } from '../logic/csv.js';
import { getExportMaterialName } from '../logic/materialNames.js';
import { formatShipDateLabel } from '../logic/shipDate.js';
import { formatOrderCutListBoxSummary, formatOrderGroupBoxLabel } from '../logic/groupBoxes.js';
import { getCutListPrintSections, DFM_MARK } from '../logic/cutListPrint.js';
import { buildCode128Svg } from '../logic/code128.js';

/** Max order numbers shown in the print header before summarizing. */
export const PRINT_HEADER_ORDER_LIMIT = 10;

/** Stable id for a cut-list line (station checkbox persistence). */
export function cutListRowId(row) {
  return [
    String(row?.order ?? '').trim(),
    String(row?.groupId ?? '').trim(),
    String(row?.width ?? '').trim(),
    String(row?.fbLength ?? '').trim(),
    String(row?.lrLength ?? '').trim(),
  ].join('|');
}

/**
 * Compact order list for the print banner so large batches do not steal
 * vertical space from the 3-column flow.
 */
export function formatPrintBatchOrders(batch, limit = PRINT_HEADER_ORDER_LIMIT) {
  const orders = (batch?.sortedOrders || []).map((o) => String(o).trim()).filter(Boolean);
  if (!orders.length) return '';
  if (orders.length <= limit) {
    return orders.map((o) => escapeHTML(o)).join(', ');
  }
  const shown = orders
    .slice(0, limit)
    .map((o) => escapeHTML(o))
    .join(', ');
  const more = orders.length - limit;
  return `${shown} <span class="print-batch-orders-more">+${more} more</span>`;
}

function buildPrintHeaderBanner(batchKey, batch, colIndices, position = null) {
  const safeBatchKey = escapeHTML(batchKey);
  const safePrintedAt = escapeHTML(
    new Date().toLocaleString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    })
  );
  const materialDisplay = batch.materialName
    ? `<b>${escapeHTML(getExportMaterialName(batch.materialName))}</b>`
    : `<span class="badge badge--danger">⚠️ MISSING MATERIAL</span>`;
  const topEdgeDisplay = batch.topEdge
    ? `<b>${escapeHTML(batch.topEdge)}</b>`
    : `<span class="badge badge--danger">⚠️ MISSING TOP EDGE</span>`;
  const batchTag =
    position && position.count > 1
      ? `<span class="print-batch-index">Batch ${position.index} of ${position.count}</span>`
      : '';
  const specialTag = batch.isSpecial ? `<span class="print-batch-special">★ SPECIAL</span>` : '';
  const shipDateLabel = formatShipDateLabel(batch.shipDate, colIndices);
  const shipDateChip = shipDateLabel
    ? `
        <div class="print-meta-chip">
          <div class="print-meta-label">Ship Date</div>
          <div><b>${escapeHTML(shipDateLabel)}</b></div>
        </div>`
    : '';
  const barcodeSvg = buildCode128Svg(batchKey, {
    height: 32,
    moduleWidth: 1.25,
    includeLabel: false,
  });
  const barcodeBlock = barcodeSvg
    ? `<div class="print-batch-barcode" title="${escapeAttr(batchKey)}">${barcodeSvg}</div>`
    : '';

  return `
    <div class="print-batch-header">
      <div class="print-batch-header-row">
        <div class="print-batch-title">
          ${safeBatchKey}.csv${batchTag}${specialTag}
          <span class="print-batch-boxes-total">${batch.totalBoxes} Boxes</span>
          <span class="print-batch-orders-list">${formatPrintBatchOrders(batch)}</span>
        </div>
        <div class="print-batch-header-aside">
          ${barcodeBlock}
          <div class="print-batch-time">Printed: ${safePrintedAt}</div>
        </div>
      </div>
      <div class="print-batch-meta">
        <div class="print-meta-chip">
          <div class="print-meta-label">Material</div>
          <div>${materialDisplay}</div>
        </div>
        <div class="print-meta-chip">
          <div class="print-meta-label">Top Edge</div>
          <div>${topEdgeDisplay}</div>
        </div>
        ${shipDateChip}
      </div>
    </div>
  `;
}

function renderCutListTableHead(hasGroup) {
  return `
      <colgroup>
        ${hasGroup ? '<col class="cutlist-col-grp">' : ''}
        <col class="cutlist-col-width">
        <col class="cutlist-col-length">
        <col class="cutlist-col-length">
        <col class="cutlist-col-count">
        <col class="cutlist-col-count">
        <col class="cutlist-col-check">
      </colgroup>
      <thead>
        <tr class="cutlist-columns-row">
          ${hasGroup ? '<th>Grp</th>' : ''}
          <th>W</th>
          <th>F / B</th>
          <th>L / R</th>
          <th>Bx</th>
          <th>Pcs</th>
          <th class="cutlist-check-col" aria-label="Check"></th>
        </tr>
      </thead>`;
}

function renderCutListDataRow(r, hasGroup, altClass, mode = 'print') {
  const dfmMark = r.dfm ? `<span class="cutlist-dfm-mark">${escapeHTML(DFM_MARK)}</span>` : '';
  const groupCell = hasGroup
    ? `<td class="cutlist-group${r.special ? ' cutlist-group-special' : ''}${r.dfm ? ' cutlist-group--dfm' : ''}"><span class="cutlist-group-id">${escapeHTML(r.groupId || '')}${r.special ? ' <span class="cutlist-group-star">★</span>' : ''}</span>${dfmMark}</td>`
    : '';
  const widthCell = hasGroup
    ? `<td class="cutlist-dim">${escapeHTML(r.width)}"</td>`
    : `<td class="cutlist-dim">${escapeHTML(r.width)}"${dfmMark ? ` ${dfmMark}` : ''}</td>`;
  const checkCell =
    mode === 'station'
      ? `<td class="cutlist-check"><input type="checkbox" class="station-check" data-row-id="${escapeAttr(cutListRowId(r))}" aria-label="Mark line complete"></td>`
      : `<td class="cutlist-check"><span class="print-check" aria-hidden="true"></span></td>`;
  return `
      <tr class="cutlist-data-row${altClass}${r.dfm ? ' cutlist-row-dfm' : ''}"${mode === 'station' ? ` data-row-id="${escapeAttr(cutListRowId(r))}"` : ''}>
        ${groupCell}
        ${widthCell}
        <td class="cutlist-dim">${r.fbLength ? `<b>${escapeHTML(r.fbLength)}"</b>` : ''}</td>
        <td class="cutlist-dim">${r.lrLength ? `<b>${escapeHTML(r.lrLength)}"</b>` : ''}</td>
        <td class="cutlist-qty"><b>${r.boxes}</b></td>
        <td class="cutlist-qty"><b>${r.parts}</b></td>
        ${checkCell}
      </tr>`;
}

function renderCutListTableBody(rows, hasGroup, rowStart = 0, mode = 'print') {
  let html = '';
  rows.forEach((r, i) => {
    const altClass = (rowStart + i) % 2 === 1 ? ' cutlist-row-alt' : '';
    html += renderCutListDataRow(r, hasGroup, altClass, mode);
  });
  return html;
}

/** Side-by-side columns on a landscape print page. */
export const PRINT_FLOW_COLUMNS = 3;

/**
 * Landscape letter row-unit budget below page margins, before the batch header.
 * Tuned for current print CSS (compact 9px table rows + title bands).
 */
export const PRINT_PAGE_ROW_BUDGET = 36;

/** Fallback rows-per-column when header size is unknown. */
export const PRINT_ROWS_PER_COLUMN = 28;

/** Order title band cost in row-units (title + table header). */
export const ORDER_TITLE_ROW_COST = 2;

/**
 * Estimate how many row-units fit in one print column after the batch header.
 * Larger headers (many orders, ship date) leave fewer rows per column so
 * packing stays on the page instead of overflowing.
 */
export function estimateRowsPerPrintColumn({
  orderCount = 1,
  hasShipDate = false,
  pageBudget = PRINT_PAGE_ROW_BUDGET,
} = {}) {
  let headerUnits = 5; // title row + material/edge meta chips
  if (hasShipDate) headerUnits += 1;
  if (orderCount > PRINT_HEADER_ORDER_LIMIT) headerUnits += 1;
  if (orderCount > 30) headerUnits += 1;
  return Math.max(14, pageBudget - headerUnits);
}

/**
 * Pack order sections into page bands of columns.
 * Fill column 1 top-to-bottom, then column 2, then column 3.
 * The next order continues in the same column under the previous table
 * when vertical space remains.
 *
 * @returns {Array<Array<Array<{order: string, titleHtml: string, rows: object[], rowStart: number}>>>}
 *   pages → columns → fragments
 */
export function packCutListPrintFlow(
  sections,
  {
    columnCount = PRINT_FLOW_COLUMNS,
    rowsPerColumn = PRINT_ROWS_PER_COLUMN,
    titleCost = ORDER_TITLE_ROW_COST,
  } = {}
) {
  const pages = [];
  let columns = Array.from({ length: columnCount }, () => []);
  let colIndex = 0;
  let used = 0;

  const flushPage = () => {
    if (columns.some((col) => col.length)) {
      pages.push(columns);
      columns = Array.from({ length: columnCount }, () => []);
      colIndex = 0;
      used = 0;
    }
  };

  const advanceColumn = () => {
    colIndex += 1;
    used = 0;
    if (colIndex >= columnCount) flushPage();
  };

  const ensureSpace = (needed) => {
    if (used > 0 && used + needed > rowsPerColumn) {
      advanceColumn();
    }
  };

  for (const section of sections || []) {
    const rows = section.rows || [];
    if (!rows.length) continue;

    let offset = 0;
    let firstFragment = true;

    while (offset < rows.length) {
      // Title (or cont. title) + thead share the same vertical budget.
      const overhead = Math.max(1, titleCost);
      ensureSpace(overhead + 1);
      const spaceForRows = Math.max(1, rowsPerColumn - used - overhead);
      const chunk = rows.slice(offset, offset + spaceForRows);
      const rowStart = offset;
      offset += chunk.length;

      columns[colIndex].push({
        order: section.order,
        titleHtml: firstFragment ? section.titleHtml || '' : section.contTitleHtml || '',
        rows: chunk,
        rowStart,
      });
      used += overhead + chunk.length;
      firstFragment = false;

      if (offset < rows.length) {
        advanceColumn();
      }
    }
  }

  flushPage();
  return pages;
}

function renderCutListColumnTable(rows, hasGroup, rowStart = 0, mode = 'print') {
  return `
      <table class="cutlist-table cutlist-table--flow" cellspacing="0">
        ${renderCutListTableHead(hasGroup)}
        <tbody>${renderCutListTableBody(rows, hasGroup, rowStart, mode)}</tbody>
      </table>`;
}

function renderFlowFragment(fragment, hasGroup, mode = 'print') {
  const title = fragment.titleHtml
    ? `<div class="cutlist-order-title">${fragment.titleHtml}</div>`
    : '';
  return `<div class="cutlist-order-fragment">${title}${renderCutListColumnTable(
    fragment.rows,
    hasGroup,
    fragment.rowStart || 0,
    mode
  )}</div>`;
}

function renderFlowColumn(fragments, hasGroup, mode = 'print') {
  if (!fragments.length) {
    return `<div class="cutlist-order-column cutlist-order-column--empty" aria-hidden="true"></div>`;
  }
  return `<div class="cutlist-order-column">${fragments
    .map((fragment) => renderFlowFragment(fragment, hasGroup, mode))
    .join('')}</div>`;
}

function renderFlowPage(columns, hasGroup, mode = 'print') {
  return `<div class="cutlist-print-columns">${columns
    .map((fragments) => renderFlowColumn(fragments, hasGroup, mode))
    .join('')}</div>`;
}

function formatFrontOnlyDfmBoxSummary(section) {
  const total = section.rows.reduce((sum, r) => sum + (r.boxes || 0), 0);
  if (total <= 0) return '';
  const boxWord = total === 1 ? 'box' : 'boxes';
  const byGroup = new Map();
  section.rows.forEach((r) => {
    const id = String(r.groupId ?? '').trim();
    if (!id) return;
    byGroup.set(id, (byGroup.get(id) || 0) + (r.boxes || 0));
  });
  if (byGroup.size) {
    const breakdown = [...byGroup.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
      .map(([id, boxes]) => `${id}-${boxes}`)
      .join(', ');
    return `${total} ${boxWord} (${breakdown})`;
  }
  return `${total} ${boxWord}`;
}

function buildSectionTitleHtml(section, batch, colIndices, anySpecial) {
  const specialMark =
    section.special && anySpecial ? ' <span class="cutlist-order-special">★ SPECIAL</span>' : '';
  const useFrontOnlyDfmTotal = section.rows.some((r) => r.frontOnlyDfm);
  const boxSummary = useFrontOnlyDfmTotal
    ? formatFrontOnlyDfmBoxSummary(section)
    : formatOrderCutListBoxSummary(section.order, batch, colIndices);
  const boxMark = boxSummary ? ` · ${escapeHTML(boxSummary)}` : '';
  return `Order ${escapeHTML(section.order)}${boxMark}${specialMark}`;
}

function buildSectionContTitleHtml(section) {
  return `Order ${escapeHTML(section.order)} <span class="cutlist-order-cont">(cont.)</span>`;
}

function renderCutListFlowBody(
  sections,
  batch,
  colIndices,
  hasGroup,
  anySpecial,
  colCount,
  rowsPerColumn = PRINT_ROWS_PER_COLUMN,
  mode = 'print'
) {
  if (!sections.length) {
    return `<div class="cutlist-print-columns">
      <div class="cutlist-order-column">
        <div class="cutlist-order-fragment">
          <table class="cutlist-table cutlist-table--flow" cellspacing="0">
            ${renderCutListTableHead(hasGroup)}
            <tbody>
              <tr><td colspan="${colCount}" class="cutlist-cell-empty" style="padding:1rem;">No cut-list rows available.</td></tr>
            </tbody>
          </table>
        </div>
      </div>
      <div class="cutlist-order-column cutlist-order-column--empty" aria-hidden="true"></div>
      <div class="cutlist-order-column cutlist-order-column--empty" aria-hidden="true"></div>
    </div>`;
  }

  const titled = sections.map((section) => ({
    ...section,
    titleHtml: buildSectionTitleHtml(section, batch, colIndices, anySpecial),
    contTitleHtml: buildSectionContTitleHtml(section),
  }));
  const pages = packCutListPrintFlow(titled, { rowsPerColumn });

  return pages.map((columns) => renderFlowPage(columns, hasGroup, mode)).join('');
}

export function buildCutListPrintCard(batchKey, batch, colIndices, position = null, options = {}) {
  const mode = options.mode === 'station' ? 'station' : 'print';
  const headerBanner = buildPrintHeaderBanner(batchKey, batch, colIndices, position);
  const sections = getCutListPrintSections(batch, colIndices, {
    allRows: options.allRows,
    dfmKeys: options.dfmKeys,
  });
  const hasGroup = colIndices.groupId !== -1;
  const anySpecial = sections.some((s) => s.special);
  const colCount = 6 + (hasGroup ? 1 : 0);
  const printRows = estimateRowsPerPrintColumn({
    orderCount: Math.max(sections.length, (batch?.sortedOrders || []).length, 1),
    hasShipDate: Boolean(formatShipDateLabel(batch?.shipDate, colIndices)),
  });
  // Station screen: pack denser so operators scroll less (print stays page-safe).
  const rowsPerColumn = mode === 'station' ? Math.max(72, printRows * 3) : printRows;

  return `<div class="cutlist-print-sheet"${mode === 'station' ? ' data-station-sheet="1"' : ''}>${headerBanner}<div class="cutlist-print-flow">${renderCutListFlowBody(sections, batch, colIndices, hasGroup, anySpecial, colCount, rowsPerColumn, mode)}</div></div>`;
}

/**
 * Printable batch → orders index for shop lookup (computer labeled by batch name).
 * @param {Record<string, object>} splitGroups
 * @param {object} colIndices
 */
export function buildBatchOrdersIndex(splitGroups, colIndices) {
  const keys = Object.keys(splitGroups || {}).sort();
  const printedAt = escapeHTML(
    new Date().toLocaleString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    })
  );

  const batchRows = keys
    .map((batchKey) => {
      const batch = splitGroups[batchKey];
      if (!batch) return '';
      const orders = (batch.sortedOrders || []).map((o) => String(o).trim()).filter(Boolean);
      const material = batch.materialName
        ? escapeHTML(getExportMaterialName(batch.materialName))
        : '—';
      const topEdge = batch.topEdge ? escapeHTML(batch.topEdge) : '—';
      const shipDateLabel = formatShipDateLabel(batch.shipDate, colIndices);
      const special = batch.isSpecial ? '<span class="batch-index-special">★ SPECIAL</span>' : '';
      const ordersHtml = orders.length
        ? orders
            .map((o) => {
              const qtyLabel = formatOrderGroupBoxLabel(o, batch, colIndices);
              const qtyHtml =
                qtyLabel && qtyLabel !== '0'
                  ? ` <span class="batch-index-order-qty">(${escapeHTML(qtyLabel)})</span>`
                  : '';
              return `<span class="batch-index-order">${escapeHTML(o)}${qtyHtml}</span>`;
            })
            .join(' ')
        : '<span class="batch-index-empty">No orders</span>';
      const barcodeSvg = buildCode128Svg(batchKey, {
        height: 40,
        moduleWidth: 1.35,
        includeLabel: false,
      });
      const barcodeCell = barcodeSvg
        ? `<td class="batch-index-barcode">${barcodeSvg}</td>`
        : '<td class="batch-index-barcode batch-index-empty">—</td>';

      return `
      <tr>
        ${barcodeCell}
        <td class="batch-index-name">
          <div class="batch-index-key">${escapeHTML(batchKey)}${special}</div>
          <div class="batch-index-meta">${material} · ${topEdge}${
            shipDateLabel ? ` · ${escapeHTML(shipDateLabel)}` : ''
          }</div>
        </td>
        <td class="batch-index-boxes">${Number(batch.totalBoxes) || 0}</td>
        <td class="batch-index-count">${orders.length}</td>
        <td class="batch-index-orders">${ordersHtml}</td>
      </tr>`;
    })
    .join('');

  return `
    <div class="batch-orders-index">
      <header class="batch-index-header">
        <div>
          <h1 class="batch-index-title">Batch / Order Lookup</h1>
          <p class="batch-index-subtitle">${keys.length} batch${
            keys.length === 1 ? '' : 'es'
          } · scan a barcode at the station, or look up by batch name</p>
        </div>
        <div class="batch-index-printed">Printed: ${printedAt}</div>
      </header>

      <section class="batch-index-section">
        <table class="batch-index-table">
          <thead>
            <tr>
              <th>Barcode</th>
              <th>Batch</th>
              <th>Boxes</th>
              <th>#</th>
              <th>Orders</th>
            </tr>
          </thead>
          <tbody>
            ${batchRows || '<tr><td colspan="5">No batches</td></tr>'}
          </tbody>
        </table>
      </section>
    </div>`;
}
