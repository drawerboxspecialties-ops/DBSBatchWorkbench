import {
  getCutOptimizationGroups,
  getOptimizedSheetTotal,
  formatInches,
} from '../logic/calculatorLogic.js';
import { getCategoryDisplayName } from '../logic/buildReportData.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

function escapeAttr(value) {
  return escapeHTML(value);
}

export function formatTimestamp(date = new Date()) {
  const weekday = date.toLocaleDateString('en-US', { weekday: 'long' });
  const month   = String(date.getMonth() + 1).padStart(2, '0');
  const day     = String(date.getDate()).padStart(2, '0');
  const year    = date.getFullYear();
  let hours     = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const ampm    = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  const hoursStr = String(hours).padStart(2, '0');
  return `${weekday}, ${month}/${day}/${year} ${hoursStr}:${minutes} ${ampm}`;
}

// ---------------------------------------------------------------------------
// Cut Optimization
// ---------------------------------------------------------------------------

/**
 * Build the cut optimization HTML panel for a category list.
 * Returns empty string for categories that skip optimization (SOLID / FAA).
 *
 * @param {object[]} list     Category group rows (from groupedCategories[catName])
 * @param {string}   catName  Category key
 * @returns {string}
 */
export function renderCutOptimization(list, catName) {
  const groups = getCutOptimizationGroups(list, catName);
  if (groups.length === 0) return '';

  let html = '<div class="cut-optimization"><div class="cut-optimization-title">Cut Optimization</div>';

  groups.forEach(group => {
    html += `
      <div class="cut-optimization-group">
        <div class="cut-optimization-group-header">
          <div class="cut-optimization-group-title">${escapeHTML(group.material)}</div>
          <div class="cut-optimization-group-spec">
            Top Edge: ${escapeHTML(group.topEdge)} &bull; ${group.sheets.length} sheet${group.sheets.length === 1 ? '' : 's'} &bull; ${group.sheetWidth}" sheet &bull; usable ${formatInches(group.usableWidth)}" &bull; kerf ${group.kerf}"
          </div>
        </div>
        <div class="cut-optimization-group-body">
          <div class="cut-pattern-list">
    `;

    group.patterns.forEach(pattern => {
      const ripHtml = pattern.ripCounts
        .map(rip => `<span class="cut-rip-chip">${escapeHTML(rip.height)}&quot; &ndash; ${rip.count} rip${rip.count === 1 ? '' : 's'}</span>`)
        .join('');

      html += `
        <div class="cut-pattern">
          <div class="cut-pattern-count">${pattern.count} sheet${pattern.count === 1 ? '' : 's'}</div>
          <div class="cut-rip-list">${ripHtml}</div>
          <div class="cut-waste">Waste ${escapeHTML(pattern.waste)}&quot;</div>
        </div>
      `;
    });

    html += `
          </div>
        </div>
      </div>
    `;
  });

  html += '</div>';
  return html;
}

// ---------------------------------------------------------------------------
// Category tables + grand total
// ---------------------------------------------------------------------------

/**
 * Build the full report HTML string (all category tables + grand total).
 * Matches the original calculateReport DOM output exactly.
 *
 * @param {object} groupedCategories  { [catName]: groupRow[] }
 * @param {object} [options]
 * @param {string} [options.notes]     Active orders / notes text (for print-header subtitle)
 * @param {string} [options.timestamp] Pre-formatted timestamp; defaults to current time
 * @returns {string}  HTML to inject into the report container
 */
export function buildCategoryTablesHtml(groupedCategories, { notes = '', timestamp = '' } = {}) {
  const ts = timestamp || formatTimestamp();
  let html = '';

  let grandBoxes = 0;
  let grandParts = 0;
  let grandLF    = 0;
  let grandRips  = 0;

  const CATEGORY_ORDER = ['PLYWOOD SIDES', 'FAA SIDES', 'SOLID SIDES', 'MDF / PBC / PVC & TAPE SIDES'];

  CATEGORY_ORDER.forEach(catName => {
    const list = groupedCategories[catName];
    if (!list || list.length === 0) return;

    const displayCatName = getCategoryDisplayName(catName);

    // Sort: top edge → material → height (matching original calculateReport sort)
    const sorted = [...list].sort((a, b) => {
      const edgeA = a.topEdge.toLowerCase();
      const edgeB = b.topEdge.toLowerCase();
      if (edgeA < edgeB) return -1;
      if (edgeA > edgeB) return 1;
      const matA = a.material.toLowerCase();
      const matB = b.material.toLowerCase();
      if (matA < matB) return -1;
      if (matA > matB) return 1;
      return a.height - b.height;
    });

    // Collect order IDs for this category
    const categoryOrderIds = [];
    sorted.forEach(g => {
      (g.orderIds || []).forEach(id => {
        if (id && !categoryOrderIds.includes(id)) categoryOrderIds.push(id);
      });
    });
    categoryOrderIds.sort();

    const subtext = categoryOrderIds.length > 0 ? ` (Orders: ${categoryOrderIds.join(', ')})` : '';

    // Badge class for material column
    let badgeClass = 'badge-mdf';
    if (catName === 'PLYWOOD SIDES') badgeClass = 'badge-birch';
    if (catName === 'SOLID SIDES')   badgeClass = 'badge-maple';
    if (catName === 'FAA SIDES')     badgeClass = 'badge-faa';

    let catBoxes = 0;
    let catParts = 0;
    let catLF    = 0;
    let catRips  = 0;

    let rowsHtml = '';
    sorted.forEach(g => {
      catBoxes += g.boxes;
      catParts += g.parts;
      catLF    += g.lf;
      catRips  += g.rips;

      const isHighlighted = g.height >= 13;
      const rowClass      = isHighlighted ? ' class="highlight-row"' : '';
      const displayHeight = isHighlighted ? `⚠️ ${g.height}"` : `${g.height}"`;
      const topEdgeWarning = g.unsupportedTopEdge
        ? '<br><span class="validation-warning">Unsupported for MDF/PBC</span>'
        : '';

      rowsHtml += `
        <tr${rowClass}>
          <td><b>${escapeHTML(g.topEdge)}</b>${topEdgeWarning}</td>
          <td><span class="badge ${escapeAttr(badgeClass)}">${escapeHTML(g.material)}</span></td>
          <td style="text-align:center;">${g.boxes}</td>
          <td style="text-align:center;">${g.parts}</td>
          <td style="text-align:center;">${escapeHTML(displayHeight)}</td>
          <td style="text-align:center;font-weight:bold;">${g.lf}</td>
          <td style="text-align:center;font-weight:bold;color:#0284c7;">${g.rips}</td>
          <td style="text-align:center;color:var(--text-muted,#4b5563);font-size:0.85rem;">${escapeHTML(g.ripSize)}</td>
          <td style="text-align:center;"><input type="checkbox" style="width:16px;height:16px;cursor:pointer;"></td>
        </tr>
      `;
    });

    grandBoxes += catBoxes;
    grandParts += catParts;
    grandLF    += catLF;
    grandRips  += catRips;

    const optimizedSheetTotal = getOptimizedSheetTotal(sorted, catName);
    let ripsDisplay = String(catRips);
    if (optimizedSheetTotal > 0) {
      ripsDisplay = `${catRips} <span style="font-size:0.85rem;font-weight:normal;color:#475569;">(${optimizedSheetTotal} Sheet${optimizedSheetTotal === 1 ? '' : 's'})</span>`;
    }

    const optimizationHtml = renderCutOptimization(sorted, catName);

    html += `
      <div class="category-print-group">
        <div class="print-header">
          <span>
            <span class="print-title">Allmoxy Top Edge Report</span>
            <span class="print-subtitle">${escapeHTML(displayCatName)}</span>
          </span>
          <span class="print-timestamp">${escapeHTML(ts)}</span>
        </div>
        <div class="report-category-header">${escapeHTML(displayCatName + subtext)}</div>
        <div class="grid-container">
          <table class="report-table">
            <thead>
              <tr>
                <th style="width:20%;">Top Edge</th>
                <th style="width:26%;">Material</th>
                <th style="text-align:center;width:10%;">Drawer Boxes</th>
                <th style="text-align:center;width:8%;">Parts</th>
                <th style="text-align:center;width:8%;">Height</th>
                <th style="text-align:center;width:8%;">LF</th>
                <th style="text-align:center;width:10%;">Rips</th>
                <th style="text-align:center;width:8%;">Rip Size</th>
                <th style="text-align:center;width:2%;">Done</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
              <tr class="total-row">
                <td colspan="2">TOTAL ${escapeHTML(displayCatName)}</td>
                <td style="text-align:center;">${catBoxes}</td>
                <td style="text-align:center;">${catParts}</td>
                <td></td>
                <td style="text-align:center;">${catLF}</td>
                <td style="text-align:center;color:#0284c7;">${ripsDisplay}</td>
                <td></td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
        ${optimizationHtml}
      </div>
    `;
  });

  html += `
    <div class="grand-total-box">
      <span>Total Boxes: ${grandBoxes}</span>
      <span>Total Parts: ${grandParts}</span>
      <span>Total LF: ${grandLF}</span>
      <span>Total Rips: ${grandRips}</span>
    </div>
  `;

  return html;
}

/**
 * Render the report into a DOM container element.
 * Convenience wrapper around buildCategoryTablesHtml.
 *
 * @param {HTMLElement} containerEl
 * @param {object}      groupedCategories
 * @param {object}      [options]
 */
export function renderReportInto(containerEl, groupedCategories, options = {}) {
  containerEl.innerHTML = buildCategoryTablesHtml(groupedCategories, options);
}
