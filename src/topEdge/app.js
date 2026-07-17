import './styles.css';
import { parseTopEdgeCSV } from './logic/parseTopEdgeCsv.js';
import { buildReportData, getCategoryDisplayName } from './logic/buildReportData.js';
import { buildExportCsvString } from './logic/exportReportCsv.js';
import { getActiveItems } from './logic/filters.js';
import { getCutOptimizationGroups, getOptimizedSheetTotal } from './logic/calculatorLogic.js';
import { buildCategoryTablesHtml, formatTimestamp } from './ui/renderReport.js';
import { syncReportToSaw } from './ui/sawSync.js';
import { summarizeTopEdgeItems } from '../batch/compareBatchImports.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));
}

function escapeAttr(value) { return escapeHTML(value); }

function sortTextList(values) {
  return values.sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' }));
}

function normalizeFilterValue(value) {
  return String(value ?? '').trim().toLowerCase();
}

// ---------------------------------------------------------------------------
// Saw report HTML builder (matches original buildSawReportHtml)
// ---------------------------------------------------------------------------
function buildSawReportHtml(reportCardEl) {
  const clone = reportCardEl.cloneNode(true);
  clone.querySelectorAll('button').forEach(btn => btn.remove());
  clone.querySelectorAll('input[type="checkbox"]').forEach(cb => { cb.disabled = true; });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Allmoxy Top Edge Report</title>
  <style>
    body { font-family: Arial, sans-serif; color: #0f172a; padding: 24px; line-height: 1.4; }
    .te-card { box-shadow: none !important; border: none !important; display: block !important; }
    .grid-header-actions { display: none !important; }
    .print-header { display: flex; justify-content: space-between; border-bottom: 2px solid #0f172a; margin-bottom: 12px; padding-bottom: 8px; }
    .print-title { font-size: 20px; font-weight: 700; text-transform: uppercase; }
    .print-subtitle { display: block; color: #475569; margin-top: 2px; }
    .print-timestamp { font-weight: 700; text-align: right; }
    .report-category-header { background: #cbd5e1; border-bottom: 2px solid #0f172a; border-radius: 8px 8px 0 0; font-weight: 700; padding: 7px 9px; margin-top: 16px; }
    .grid-container { overflow: visible; border: none; margin-bottom: 12px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border-bottom: 1px solid #cbd5e1; padding: 5px; text-align: left; }
    th { background: #f1f5f9; font-weight: 700; }
    .badge { border: 1px solid #0f172a; border-radius: 5px; padding: 1px 4px; font-weight: 700; }
    .total-row { background: #f1f5f9; font-weight: 700; }
    .highlight-row { background: #fee2e2; color: #991b1b; }
    .cut-optimization { border: 1px solid #cbd5e1; border-radius: 8px; background: #f8fafc; padding: 8px; margin: 8px 0 16px; }
    .cut-optimization-title { font-weight: 700; margin-bottom: 4px; }
    .cut-optimization-group { background: #ffffff; border: 1px solid #cbd5e1; border-radius: 8px; margin-top: 8px; overflow: hidden; }
    .cut-optimization-group-header { background: #f1f5f9; border-bottom: 1px solid #cbd5e1; display: flex; gap: 10px; justify-content: space-between; padding: 6px 8px; }
    .cut-optimization-group-title { font-weight: 700; }
    .cut-optimization-group-spec { color: #475569; font-size: 11px; font-weight: 700; text-align: right; }
    .cut-optimization-group-body { padding: 3px 8px 8px; }
    .cut-pattern { display: grid; grid-template-columns: 100px 1fr 90px; gap: 8px; border-top: 1px solid #e2e8f0; padding-top: 5px; margin-top: 5px; }
    .cut-rip-chip { display: inline-block; border: 1px solid #cbd5e1; border-radius: 999px; background: #ffffff; font-weight: 700; margin: 2px; padding: 2px 7px; }
    .grand-total-box { border: 1px solid #0f172a; display: flex; gap: 20px; justify-content: center; font-weight: 700; padding: 10px; margin-top: 14px; }
  </style>
</head>
<body>${clone.outerHTML}</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Mount the full Top Edge UI into rootEl.
 * Returns a cleanup/unmount function.
 *
 * All DOM IDs use the "te-" prefix to avoid clashes with other panels.
 *
 * @param {HTMLElement} rootEl
 * @returns {() => void} unmount
 */
export function mountTopEdgeApp(rootEl) {
  // ---- State ----------------------------------------------------------------
  let items          = [];
  let computedGroups = [];
  let activeOrderIds  = [];
  let removedOrderIds = [];
  let removedMaterials = [];
  let removedTopEdges  = [];

  // ---- Build skeleton HTML --------------------------------------------------
  rootEl.innerHTML = `
    <div class="top-edge-app">
      <div class="te-container">

        <!-- Import / control panel -->
        <div class="te-card">
          <h2>1. Import Data</h2>
          <input type="file" id="te-file-import" accept=".csv" style="display:none;">
          <button class="te-btn te-btn-secondary" id="te-btn-upload">📁 Upload Allmoxy CSV</button>
          <div id="te-csv-drop-zone" class="te-drop-zone" role="button" tabindex="0">
            <strong>Drag &amp; drop CSV here</strong>
            or click to browse for an Allmoxy CSV
          </div>
          <button class="te-btn te-btn-danger" id="te-btn-clear-all" style="margin-top:0.5rem;width:100%;">🗑️ Clear All Data</button>
          <div id="te-import-status" class="te-note-box te-status-box" role="status" aria-live="polite"></div>

          <div class="te-form-group" style="margin-top:1rem;">
            <label for="te-order-notes">Involved Orders / Notes</label>
            <input type="text" id="te-order-notes" placeholder="e.g. 601697, 601781">
          </div>

          <div id="te-order-manager" class="te-order-manager" aria-live="polite">
            <div>
              <h3>Delete Orders From Report</h3>
              <details id="te-active-orders-dropdown" class="te-order-dropdown">
                <summary>Select active orders</summary>
                <div id="te-active-orders-options" class="te-order-options"></div>
              </details>
              <div class="te-order-actions">
                <button type="button" class="te-btn te-btn-danger" id="te-btn-remove-selected-orders">Remove Selected</button>
              </div>
              <div class="te-order-help">Select one or more orders, then remove them from the current report.</div>
            </div>
            <div id="te-removed-orders-section" style="display:none;">
              <h3>Restore Removed Orders</h3>
              <details id="te-removed-orders-dropdown" class="te-order-dropdown">
                <summary>Select removed orders</summary>
                <div id="te-removed-orders-options" class="te-order-options"></div>
              </details>
              <div class="te-order-actions">
                <button type="button" class="te-btn te-btn-secondary" id="te-btn-restore-selected-orders">Restore Selected</button>
              </div>
              <div class="te-order-help">Select removed orders here if they need to be added back.</div>
            </div>
          </div>

          <div id="te-filter-panel" class="te-filter-panel" aria-live="polite">
            <div class="te-filter-panel-header">
              <div class="te-filter-panel-title">Filter Out Rows</div>
              <div class="te-filter-panel-action-label">Remove</div>
            </div>
            <div class="te-filter-row">
              <input type="text" id="te-filter-order-input" placeholder="Order #..." list="te-filter-order-options">
              <button type="button" class="te-filter-remove-btn" id="te-btn-filter-order" title="Remove order">&minus;</button>
            </div>
            <div class="te-filter-row">
              <input type="text" id="te-filter-material-input" placeholder="Material..." list="te-filter-material-options">
              <button type="button" class="te-filter-remove-btn" id="te-btn-filter-material" title="Remove material">&minus;</button>
            </div>
            <div class="te-filter-row">
              <input type="text" id="te-filter-top-edge-input" placeholder="Top Edge..." list="te-filter-top-edge-options">
              <button type="button" class="te-filter-remove-btn" id="te-btn-filter-top-edge" title="Remove top edge">&minus;</button>
            </div>
            <datalist id="te-filter-order-options"></datalist>
            <datalist id="te-filter-material-options"></datalist>
            <datalist id="te-filter-top-edge-options"></datalist>
            <label class="te-include-removed-row">
              <input type="checkbox" id="te-chk-include-removed-export">
              <span>Add removed rows back to CSV export</span>
            </label>
            <div id="te-removed-filter-list" class="te-removed-filter-list"></div>
          </div>
        </div>

        <!-- Report card -->
        <div class="te-card" id="te-report-card" style="display:none;flex-grow:1;">
          <div class="grid-header-actions">
            <h2>2. Allmoxy Top Edge Report (Live Preview)</h2>
            <div style="display:flex;gap:0.5rem;">
              <button class="te-btn te-btn-secondary" id="te-btn-print">🖨️ Print Report</button>
              <button class="te-btn te-btn-secondary" id="te-btn-export-csv">📂 Export CSV</button>
              <button class="te-btn te-btn-secondary" id="te-btn-sync-saw">Sync Report to Saw</button>
            </div>
          </div>
          <div id="te-batch-notes-display" class="te-note-box" style="display:none;"></div>
          <div id="te-tables-container"></div>
        </div>

      </div>
    </div>
  `;

  // ---- Element shortcuts ---------------------------------------------------
  const $ = (id) => rootEl.querySelector(`#${id}`);

  // ---- Helpers -------------------------------------------------------------
  function setStatus(message, isError = false) {
    const el = $('te-import-status');
    el.textContent = message;
    el.classList.toggle('error', isError);
    el.style.display = message ? 'block' : 'none';
  }

  function uniqueItemValues(fieldName) {
    return sortTextList([...new Set(items.map(item => item[fieldName]).filter(Boolean))]);
  }

  function updateDatalist(id, values) {
    $(id).innerHTML = values.map(v => `<option value="${escapeAttr(v)}"></option>`).join('');
  }

  function findMatchingValue(inputValue, candidates) {
    const cleaned = String(inputValue ?? '').trim();
    if (!cleaned) return '';
    return candidates.find(v => normalizeFilterValue(v) === normalizeFilterValue(cleaned)) || cleaned;
  }

  function syncOrderNotes() {
    $('te-order-notes').value = activeOrderIds.join(', ');
  }

  function getCheckedValues(containerId) {
    return Array.from(rootEl.querySelectorAll(`#${containerId} input[type="checkbox"]:checked`))
      .map(inp => inp.value);
  }

  // ---- Order management ----------------------------------------------------
  function addActiveOrders(orderIds) {
    orderIds.forEach(id => {
      if (!id) return;
      if (!activeOrderIds.includes(id) && !removedOrderIds.includes(id)) {
        activeOrderIds.push(id);
      }
    });
    activeOrderIds.sort();
  }

  function removeOrder(orderId) {
    activeOrderIds = activeOrderIds.filter(id => id !== orderId);
    if (!removedOrderIds.includes(orderId)) {
      removedOrderIds.push(orderId);
      removedOrderIds.sort();
    }
    syncOrderNotes();
    renderOrderManager();
    renderFilterPanel();
    calculateReport();
  }

  function restoreOrder(orderId) {
    removedOrderIds = removedOrderIds.filter(id => id !== orderId);
    if (!activeOrderIds.includes(orderId)) {
      activeOrderIds.push(orderId);
      activeOrderIds.sort();
    }
    syncOrderNotes();
    renderOrderManager();
    renderFilterPanel();
    calculateReport();
  }

  function renderOrderManager() {
    const manager = $('te-order-manager');
    if (activeOrderIds.length === 0 && removedOrderIds.length === 0) {
      manager.style.display = 'none';
      return;
    }
    manager.style.display = 'flex';

    const activeDropdown = $('te-active-orders-dropdown');
    activeDropdown.querySelector('summary').textContent = activeOrderIds.length
      ? `Select active orders (${activeOrderIds.length})`
      : 'No active orders';
    $('te-active-orders-options').innerHTML = activeOrderIds
      .map(id => `<label class="te-order-option"><input type="checkbox" value="${escapeHTML(id)}"><span>${escapeHTML(id)}</span></label>`)
      .join('');

    const removedSection = $('te-removed-orders-section');
    removedSection.style.display = removedOrderIds.length ? 'block' : 'none';
    $('te-removed-orders-dropdown').querySelector('summary').textContent = `Select removed orders (${removedOrderIds.length})`;
    $('te-removed-orders-options').innerHTML = removedOrderIds
      .map(id => `<label class="te-order-option"><input type="checkbox" value="${escapeHTML(id)}"><span>${escapeHTML(id)}</span></label>`)
      .join('');
  }

  // ---- Filter panel --------------------------------------------------------
  function renderFilterPanel() {
    const panel = $('te-filter-panel');
    if (!panel) return;

    if (items.length === 0) {
      panel.style.display = 'none';
      return;
    }
    panel.style.display = 'flex';

    const removedMaterialKeys = removedMaterials.map(normalizeFilterValue);
    const removedTopEdgeKeys  = removedTopEdges.map(normalizeFilterValue);
    updateDatalist('te-filter-order-options', activeOrderIds);
    updateDatalist('te-filter-material-options', uniqueItemValues('material').filter(v => !removedMaterialKeys.includes(normalizeFilterValue(v))));
    updateDatalist('te-filter-top-edge-options', uniqueItemValues('topEdge').filter(v => !removedTopEdgeKeys.includes(normalizeFilterValue(v))));

    const badges = [
      ...removedOrderIds.map(value => ({ type: 'order',   label: `Order ${value}`,    value })),
      ...removedMaterials.map(value => ({ type: 'material', label: `Material ${value}`, value })),
      ...removedTopEdges.map(value  => ({ type: 'topEdge', label: `Top Edge ${value}`, value })),
    ];

    $('te-removed-filter-list').innerHTML = badges.length
      ? badges.map(badge => `
          <button type="button" class="te-btn te-btn-secondary"
            data-filter-type="${escapeAttr(badge.type)}"
            data-filter-value="${escapeAttr(badge.value)}"
            title="Restore ${escapeAttr(badge.label)}">
            ${escapeHTML(badge.label)} &times;
          </button>
        `).join('')
      : '<span class="te-order-help">No rows are currently removed.</span>';
  }

  function restoreFilterValue(type, value) {
    if (type === 'order') {
      restoreOrder(value);
      setStatus(`Restored order ${value} to the report.`);
      return;
    }
    if (type === 'material') {
      removedMaterials = removedMaterials.filter(item => normalizeFilterValue(item) !== normalizeFilterValue(value));
      setStatus(`Restored material ${value} to the report.`);
    }
    if (type === 'topEdge') {
      removedTopEdges = removedTopEdges.filter(item => normalizeFilterValue(item) !== normalizeFilterValue(value));
      setStatus(`Restored top edge ${value} to the report.`);
    }
    renderFilterPanel();
    calculateReport();
  }

  // ---- Remove / restore actions --------------------------------------------
  function removeOrderFromFilter() {
    const input   = $('te-filter-order-input');
    const orderId = findMatchingValue(input.value, activeOrderIds);
    if (!orderId) { setStatus('Enter an order number to remove.', true); return; }
    if (!activeOrderIds.includes(orderId) && !removedOrderIds.includes(orderId)) {
      setStatus(`Order ${orderId} was not found in the imported rows.`, true); return;
    }
    removeOrder(orderId);
    input.value = '';
    setStatus(`Removed order ${orderId} from the report.`);
  }

  function removeMaterialFromFilter() {
    const input    = $('te-filter-material-input');
    const material = findMatchingValue(input.value, uniqueItemValues('material'));
    if (!material) { setStatus('Enter a material to remove.', true); return; }
    if (!uniqueItemValues('material').some(v => normalizeFilterValue(v) === normalizeFilterValue(material))) {
      setStatus(`Material ${material} was not found.`, true); return;
    }
    if (!removedMaterials.some(v => normalizeFilterValue(v) === normalizeFilterValue(material))) {
      removedMaterials.push(material);
      removedMaterials = sortTextList(removedMaterials);
    }
    input.value = '';
    renderFilterPanel();
    calculateReport();
    setStatus(`Removed material ${material} from the report.`);
  }

  function removeTopEdgeFromFilter() {
    const input   = $('te-filter-top-edge-input');
    const topEdge = findMatchingValue(input.value, uniqueItemValues('topEdge'));
    if (!topEdge) { setStatus('Enter a top edge to remove.', true); return; }
    if (!uniqueItemValues('topEdge').some(v => normalizeFilterValue(v) === normalizeFilterValue(topEdge))) {
      setStatus(`Top edge ${topEdge} was not found.`, true); return;
    }
    if (!removedTopEdges.some(v => normalizeFilterValue(v) === normalizeFilterValue(topEdge))) {
      removedTopEdges.push(topEdge);
      removedTopEdges = sortTextList(removedTopEdges);
    }
    input.value = '';
    renderFilterPanel();
    calculateReport();
    setStatus(`Removed top edge ${topEdge} from the report.`);
  }

  function removeSelectedOrders() {
    const selected = getCheckedValues('te-active-orders-options');
    if (selected.length === 0) { setStatus('Select one or more active orders to remove.', true); return; }
    activeOrderIds = activeOrderIds.filter(id => !selected.includes(id));
    selected.forEach(id => { if (!removedOrderIds.includes(id)) removedOrderIds.push(id); });
    removedOrderIds.sort();
    syncOrderNotes();
    renderOrderManager();
    renderFilterPanel();
    calculateReport();
    setStatus(`Removed ${selected.length} order${selected.length === 1 ? '' : 's'} from the report.`);
  }

  function restoreSelectedOrders() {
    const selected = getCheckedValues('te-removed-orders-options');
    if (selected.length === 0) { setStatus('Select one or more removed orders to restore.', true); return; }
    removedOrderIds = removedOrderIds.filter(id => !selected.includes(id));
    selected.forEach(id => { if (!activeOrderIds.includes(id)) activeOrderIds.push(id); });
    activeOrderIds.sort();
    syncOrderNotes();
    renderOrderManager();
    renderFilterPanel();
    calculateReport();
    setStatus(`Restored ${selected.length} order${selected.length === 1 ? '' : 's'} to the report.`);
  }

  // ---- Report calculation --------------------------------------------------
  function calculateReport() {
    const reportCard  = $('te-report-card');
    const reportItems = getActiveItems(items, { activeOrderIds, removedOrderIds, removedMaterials, removedTopEdges });

    if (items.length === 0 || reportItems.length === 0) {
      reportCard.style.display = 'none';
      computedGroups = [];
      return;
    }

    const reportData       = buildReportData(reportItems);
    const groupedCategories = reportData.groupedCategories;
    computedGroups          = reportData.groups;

    const notesInput = $('te-order-notes').value.trim();
    const container  = $('te-tables-container');
    container.innerHTML = buildCategoryTablesHtml(groupedCategories, { notes: notesInput });

    // Batch notes display
    const notesDisplay = $('te-batch-notes-display');
    if (notesInput) {
      notesDisplay.innerHTML = `📝 <b>Orders Included in Batch:</b> <code>${escapeHTML(notesInput)}</code>`;
      notesDisplay.style.display = 'block';
    } else {
      notesDisplay.style.display = 'none';
    }

    reportCard.style.display = 'block';
    window.dispatchEvent(
      new CustomEvent('dbs-batch-data-changed', { detail: { source: 'top-edge-report' } })
    );
  }

  // ---- Saw sync helpers ---------------------------------------------------
  function getSawSheetTotal() {
    const groupsByCategory = {};
    computedGroups.forEach(group => {
      if (group.category === 'SOLID SIDES' || group.category === 'FAA SIDES') return;
      if (!groupsByCategory[group.category]) groupsByCategory[group.category] = [];
      groupsByCategory[group.category].push(group);
    });
    return Object.keys(groupsByCategory).reduce(
      (total, cat) => total + getOptimizedSheetTotal(groupsByCategory[cat], cat),
      0
    );
  }

  function getSawSummary() {
    return {
      parts:  computedGroups.reduce((s, g) => s + g.parts, 0),
      boxes:  computedGroups.reduce((s, g) => s + g.boxes, 0),
      lf:     computedGroups.reduce((s, g) => s + g.lf, 0),
      rips:   computedGroups.reduce((s, g) => s + g.rips, 0),
      sheets: getSawSheetTotal(),
    };
  }

  // ---- Print ---------------------------------------------------------------
  function printReport() {
    // Stamp current timestamps on print headers
    rootEl.querySelectorAll('.print-timestamp').forEach(el => {
      el.textContent = formatTimestamp();
    });

    document.body.classList.add('printing-top-edge');
    window.print();
    // afterprint event removes the class
  }

  // ---- CSV Export ----------------------------------------------------------
  function exportCSV() {
    const includeRemoved = $('te-chk-include-removed-export')?.checked;
    const exportGroups   = includeRemoved ? buildReportData(items).groups : computedGroups;
    if (exportGroups.length === 0) return;

    const notesInput = $('te-order-notes').value.trim();
    const csvString  = buildExportCsvString(exportGroups, { notesInput, includeRemovedNote: includeRemoved });

    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.setAttribute('download', `top_edge_batch_report_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ---- Saw sync ------------------------------------------------------------
  async function handleSyncSaw() {
    if (computedGroups.length === 0) {
      setStatus('No report to sync.', true);
      return;
    }

    const orders = activeOrderIds.length
      ? activeOrderIds
      : $('te-order-notes').value.split(',').map(x => x.trim()).filter(Boolean);

    try {
      setStatus('Syncing report to saw...');
      const result = await syncReportToSaw({
        title:    'Allmoxy Top Edge Report',
        orders,
        summary:  getSawSummary(),
        html:     buildSawReportHtml($('te-report-card')),
        syncedBy: window.navigator.userAgent.includes('Windows') ? 'Windows User' : 'Office',
      });
      const fileText = result.file ? ` (${result.file})` : '';
      setStatus(`Report synced to saw dashboard${fileText}.`);
    } catch (err) {
      console.error(err);
      setStatus('Could not sync report to saw. Check server24 helper connection.', true);
    }
  }

  // ---- CSV import ---------------------------------------------------------
  function processCsvFile(file, fileInput = null) {
    if (!file) return Promise.resolve(null);
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setStatus('Please upload a CSV file.', true);
      return Promise.resolve(null);
    }

    setStatus(`Importing ${file.name}...`);
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const contents = evt.target.result;
          const parsed = parseTopEdgeCSV(contents);

          if (parsed.items.length > 0) {
            items = items.concat(parsed.items);

            if (parsed.orderIds.length > 0) {
              addActiveOrders(parsed.orderIds);
              syncOrderNotes();
              renderOrderManager();
            }

            renderFilterPanel();
            calculateReport();

            const materialCount = parsed.materials
              ? parsed.materials.length
              : new Set(parsed.items.map((item) => item.material)).size;
            const skippedText =
              parsed.skippedRows > 0
                ? ` Skipped ${parsed.skippedRows} row${parsed.skippedRows === 1 ? '' : 's'} missing usable dimensions or LF/Rips.`
                : '';
            setStatus(
              `Imported ${parsed.items.length} row${parsed.items.length === 1 ? '' : 's'} across ${materialCount} material${materialCount === 1 ? '' : 's'} from ${file.name}.${skippedText}`,
              parsed.skippedRows > 0
            );
          } else {
            const skippedText = parsed.skippedRows
              ? ` ${parsed.skippedRows} row${parsed.skippedRows === 1 ? '' : 's'} were present but missing usable dimensions or LF/Rips.`
              : '';
            setStatus(`Could not extract any valid items from the selected CSV.${skippedText}`, true);
          }
          window.dispatchEvent(
            new CustomEvent('dbs-batch-data-changed', { detail: { source: 'top-edge' } })
          );
          resolve(getPublicSummary());
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => {
        setStatus(`Could not read ${file.name}. Please try the file again.`, true);
        reject(new Error(`Could not read ${file.name}`));
      };
      reader.readAsText(file);
      if (fileInput) fileInput.value = '';
    });
  }

  function getPublicSummary() {
    const active = getActiveItems(items, {
      activeOrderIds,
      removedOrderIds,
      removedMaterials,
      removedTopEdges,
    });
    const report = active.length ? buildReportData(active) : { groups: [] };
    return summarizeTopEdgeItems(active, report.groups);
  }

  function setupDropZone() {
    const dropZone  = $('te-csv-drop-zone');
    const fileInput = $('te-file-import');

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(ev =>
      dropZone.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); })
    );
    ['dragenter', 'dragover'].forEach(ev =>
      dropZone.addEventListener(ev, () => dropZone.classList.add('drag-over'))
    );
    ['dragleave', 'drop'].forEach(ev =>
      dropZone.addEventListener(ev, () => dropZone.classList.remove('drag-over'))
    );
    dropZone.addEventListener('drop', e => processCsvFile(e.dataTransfer.files[0]));
    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
    });
  }

  // ---- Clear all -----------------------------------------------------------
  function clearAll() {
    if (!confirm('Are you sure you want to clear all items?')) return;
    items           = [];
    computedGroups  = [];
    activeOrderIds  = [];
    removedOrderIds = [];
    removedMaterials = [];
    removedTopEdges  = [];
    $('te-order-notes').value = '';
    $('te-chk-include-removed-export').checked = false;
    renderOrderManager();
    renderFilterPanel();
    setStatus('');
    calculateReport();
  }

  // ---- Wire events ---------------------------------------------------------
  $('te-btn-upload').addEventListener('click', () => $('te-file-import').click());
  $('te-file-import').addEventListener('change', e => processCsvFile(e.target.files[0], e.target));
  $('te-btn-clear-all').addEventListener('click', clearAll);
  $('te-btn-print').addEventListener('click', printReport);
  $('te-btn-export-csv').addEventListener('click', exportCSV);
  $('te-btn-sync-saw').addEventListener('click', handleSyncSaw);
  $('te-btn-remove-selected-orders').addEventListener('click', removeSelectedOrders);
  $('te-btn-restore-selected-orders').addEventListener('click', restoreSelectedOrders);
  $('te-btn-filter-order').addEventListener('click', removeOrderFromFilter);
  $('te-btn-filter-material').addEventListener('click', removeMaterialFromFilter);
  $('te-btn-filter-top-edge').addEventListener('click', removeTopEdgeFromFilter);
  $('te-order-notes').addEventListener('input', calculateReport);

  $('te-removed-filter-list').addEventListener('click', e => {
    const btn = e.target.closest('button[data-filter-type]');
    if (!btn) return;
    restoreFilterValue(btn.dataset.filterType, btn.dataset.filterValue);
  });

  setupDropZone();

  // Handle afterprint: remove class added in printReport
  const afterPrintHandler = () => document.body.classList.remove('printing-top-edge');
  window.addEventListener('afterprint', afterPrintHandler);

  function resetData() {
    items = [];
    computedGroups = [];
    activeOrderIds = [];
    removedOrderIds = [];
    removedMaterials = [];
    removedTopEdges = [];
    const notes = $('te-order-notes');
    if (notes) notes.value = '';
    const includeRemoved = $('te-chk-include-removed-export');
    if (includeRemoved) includeRemoved.checked = false;
    renderOrderManager();
    renderFilterPanel();
    setStatus('');
    calculateReport();
  }

  // ---- Public controller API -----------------------------------------------
  return {
    /** Load a CSV. Pass `{ replace: true }` from the batch home so files do not append. */
    loadFile(file, options = {}) {
      if (options.replace) resetData();
      return processCsvFile(file);
    },
    getStatus() {
      return {
        itemCount: items.length,
        groupCount: computedGroups.length,
        orderCount: activeOrderIds.length,
        fileLoaded: items.length > 0,
      };
    },
    /** Snapshot for batch cross-validation against the OptiCut CSV. */
    getSummary() {
      return getPublicSummary();
    },
    unmount() {
      window.removeEventListener('afterprint', afterPrintHandler);
      rootEl.innerHTML = '';
    },
  };
}
