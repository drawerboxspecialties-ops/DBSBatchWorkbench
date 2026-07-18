import './styles.css';
import { parseCSV, convertToCSV, escapeHTML, escapeAttr } from './logic/csv.js';
import { mapHeaders, filterForExport } from './logic/headers.js';
import { cleanMaterialName } from './logic/materialNames.js';
import { normalizeTopEdgeName } from './logic/topEdges.js';
import {
  splitDataIntoGroups,
  defaultFrontTopEdgesFromBacks,
  normalizeTopEdges,
  applyExclusions,
} from './logic/grouping.js';
import { applyBatchOrderExclusions, batchOrderKey } from './logic/batchOrders.js';
import { formatShipDateLabel } from './logic/shipDate.js';
import { getCutListRowsForExport, getBatchExportRows } from './logic/exportRows.js';
import { formatDecimalForDisplay } from './logic/widths.js';
import {
  loadSettings,
  saveSettings,
  rememberFile,
  clearStoredSettings,
} from './logic/settingsStore.js';
import { DEMO_CSV } from './logic/demoData.js';
import { buildCutListPrintCard, buildBatchOrdersIndex } from './ui/cutListPrintView.js';
import { publishStationJob, purgeExpiredStationJobs, isStationHash } from './logic/stationSync.js';
import { mountStationView } from './ui/stationView.js';
import { summarizeOpticutState } from './batch/compareBatchImports.js';
import { setPrintPageStyle, clearPrintPageStyle } from './printPageStyle.js';

const $ = (id) => document.getElementById(id);

const TOAST_ICONS = {
  success: '✅',
  info: 'ℹ️',
  warning: '⚠️',
  danger: '⛔',
};

/**
 * Show a non-blocking toast notification. Falls back to no-op if the container
 * is missing (e.g. during tests). Errors and required-acknowledgment warnings
 * still use alert() so the user must see them.
 *
 * @param {string} message
 * @param {'success'|'info'|'warning'|'danger'} [type='info']
 * @param {number} [duration=3500] milliseconds before auto-dismiss
 */
function showToast(message, type = 'info', duration = 3500) {
  const container = $('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.setAttribute('role', type === 'danger' ? 'alert' : 'status');
  toast.innerHTML = `
    <span class="toast-icon" aria-hidden="true">${TOAST_ICONS[type] || 'ℹ️'}</span>
    <span class="toast-message"></span>
    <button type="button" class="toast-close" aria-label="Dismiss notification">×</button>
  `;
  toast.querySelector('.toast-message').textContent = message;
  container.appendChild(toast);

  const close = () => {
    if (!toast.parentNode) return;
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 250);
  };
  toast.querySelector('.toast-close').addEventListener('click', close);
  if (duration > 0) setTimeout(close, duration);
}

const state = {
  parsedHeaders: [],
  parsedRows: [],
  originalParsedRows: [],
  splitGroups: {},
  activeGroupKey: '',
  validationErrors: [],
  excludedOrders: [],
  excludedMaterials: [],
  excludedTopEdges: [],
  maxOrdersPerBatch: 999,
  groupSplitLimits: {},
  batchOrderExclusions: new Set(),
  expandedBatches: new Set(),
  colIndices: null,
  currentFileName: '',
  appSettings: loadSettings(),
};

state.maxOrdersPerBatch = parseInt(state.appSettings.maxOrdersPerBatch) || state.maxOrdersPerBatch;

function persistSettings(updates = {}) {
  state.appSettings = {
    ...state.appSettings,
    maxOrdersPerBatch: state.maxOrdersPerBatch,
    ...updates,
  };
  saveSettings(state.appSettings);
}

function rowMaterialName(row) {
  return cleanMaterialName(row[state.colIndices.materialName] || '');
}

function rowTopEdgeName(row) {
  return normalizeTopEdgeName(row[state.colIndices.topEdge] || '');
}

function shouldRoundExportWidths() {
  return !!$('chk-round-export-widths')?.checked;
}

function shouldSeparateSpecialOrders() {
  const el = $('chk-separate-special-orders');
  return el ? !!el.checked : true;
}

function shouldCombineShipDates() {
  return !!$('chk-combine-ship-dates')?.checked;
}

function processFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const fileName = file.name || '';
        state.currentFileName = fileName;
        state.appSettings = rememberFile(fileName, state.appSettings);
        persistSettings();
        parseAndLoad(e.target.result);
        // rebuild() (via parseAndLoad) dispatches dbs-batch-data-changed
        resolve(getOpticutBatchSummary());
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => {
      alert('Could not read the selected file.');
      reject(new Error('Could not read the selected file.'));
    };
    reader.readAsText(file);
  });
}

function parseAndLoad(text) {
  const { headers, rows } = parseCSV(text);
  if (headers.length === 0) {
    alert('The CSV file seems to be empty or invalid.');
    return;
  }
  state.parsedHeaders = headers;
  state.parsedRows = rows;
  state.colIndices = mapHeaders(headers);
  normalizeTopEdges(state.parsedRows, state.colIndices);
  defaultFrontTopEdgesFromBacks(state.parsedRows, state.colIndices);
  state.originalParsedRows = state.parsedRows.map((r) => [...r]);
  state.excludedOrders = [];
  state.excludedMaterials = [];
  state.excludedTopEdges = [];
  state.groupSplitLimits = {};
  state.batchOrderExclusions = new Set();
  state.expandedBatches = new Set();
  validateRows();
  rebuild();
  const batchCount = Object.keys(state.splitGroups).length;
  if (batchCount > 0) {
    showToast(
      `Loaded ${rows.length} rows into ${batchCount} batch${batchCount === 1 ? '' : 'es'}.`,
      'success'
    );
  }
}

function validateRows() {
  state.validationErrors = [];
  const ci = state.colIndices;
  state.parsedRows.forEach((row, idx) => {
    const lineNum = idx + 2;
    const orderNum = row[ci.orderNumber] || 'Unknown';
    const mat = row[ci.materialName] || '';
    const edge = row[ci.topEdge] || '';
    if (!mat.trim()) {
      state.validationErrors.push(
        `Row ${lineNum} (Order #${orderNum}) is missing a Material Name.`
      );
    }
    if (!edge.trim()) {
      state.validationErrors.push(`Row ${lineNum} (Order #${orderNum}) is missing a Top Edge.`);
    }
  });
  renderErrorBanner();
}

function renderErrorBanner() {
  const banner = $('side-error-notification');
  const list = $('error-list');
  if (state.validationErrors.length > 0) {
    list.innerHTML = state.validationErrors.map((e) => `<li>${escapeHTML(e)}</li>`).join('');
    banner.hidden = false;
    list.hidden = true;
  } else {
    banner.hidden = true;
    list.innerHTML = '';
  }
}

function computeSplitGroups(rows) {
  const groups = splitDataIntoGroups(
    rows,
    state.colIndices,
    state.maxOrdersPerBatch,
    state.groupSplitLimits,
    shouldSeparateSpecialOrders(),
    shouldCombineShipDates()
  );
  return applyBatchOrderExclusions(groups, state.batchOrderExclusions, state.colIndices);
}

function rebuild() {
  state.splitGroups = computeSplitGroups(state.parsedRows);
  showWorkspace();
  window.dispatchEvent(new CustomEvent('dbs-batch-data-changed', { detail: { source: 'opticut' } }));
}

async function hardResetApp() {
  clearStoredSettings();
  if ('caches' in window) {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    } catch {
      // ignore cache API errors
    }
  }
  window.location.reload();
}

function showWorkspace() {
  $('workspace-placeholder').style.display = 'none';
  $('active-workspace').hidden = false;
  $('stats-section').hidden = false;
  $('demo-section').style.display = 'none';
  $('controls-sidebar-card').hidden = false;
  $('batches-sidebar-card').hidden = false;

  let totalQty = 0;
  state.parsedRows.forEach((row) => {
    totalQty += parseInt(row[state.colIndices.quantity]) || 0;
  });
  $('stat-total-rows').innerText = totalQty;
  const uniqueOrders = new Set(state.parsedRows.map((r) => r[state.colIndices.orderNumber]));
  $('stat-orders').innerText = uniqueOrders.size;
  const totalBoxes = Object.values(state.splitGroups).reduce(
    (sum, g) => sum + (g.totalBoxes || 0),
    0
  );
  $('stat-total-boxes').innerText = totalBoxes;

  updateExclusionOptions();
  updateRestoreAllButton();
  renderBatchTabs();

  const keys = Object.keys(state.splitGroups).sort();
  if (keys.length > 0) {
    const first =
      state.activeGroupKey && state.splitGroups[state.activeGroupKey]
        ? state.activeGroupKey
        : keys[0];
    selectGroup(first);
  } else {
    state.activeGroupKey = '';
    $('current-view-title').innerText = 'No Batches Available';
    $('table-head').innerHTML = '';
    $('table-body').innerHTML = '';
  }
}

function toggleBatchExpanded(batchKey) {
  if (state.expandedBatches.has(batchKey)) {
    state.expandedBatches.delete(batchKey);
  } else {
    state.expandedBatches.add(batchKey);
  }
  renderBatchTabs();
}

function excludeOrderFromBatch(batchKey, order) {
  const batch = state.splitGroups[batchKey];
  if (!batch?.sourceGroupKey) return;
  state.batchOrderExclusions.add(batchOrderKey(batch.sourceGroupKey, order));
  rebuild();
  updateRestoreAllButton();
  if (state.activeGroupKey === batchKey && !state.splitGroups[batchKey]) {
    const keys = Object.keys(state.splitGroups).sort();
    if (keys.length > 0) selectGroup(keys[0]);
  }
}

function restoreOrderToBatch(batchKey, order) {
  const batch = state.splitGroups[batchKey];
  if (!batch?.sourceGroupKey) return;
  state.batchOrderExclusions.delete(batchOrderKey(batch.sourceGroupKey, order));
  rebuild();
  selectGroup(batchKey);
}

function getRestorableOrdersForBatch(batch) {
  if (!batch?.sourceGroupKey) return [];
  const restored = [];
  state.batchOrderExclusions.forEach((key) => {
    const sep = key.indexOf('|');
    if (sep === -1) return;
    const sourceGroupKey = key.slice(0, sep);
    const order = key.slice(sep + 1);
    if (sourceGroupKey === batch.sourceGroupKey && order) {
      restored.push(order);
    }
  });
  return restored.sort(orderSortComparator);
}

function formatBatchShipMeta(batch) {
  const label = formatShipDateLabel(batch.shipDate, state.colIndices);
  return label ? ` · Ship ${label}` : '';
}

function renderBatchOrdersPanel(batchKey, batch) {
  const panel = document.createElement('div');
  panel.className = 'batch-orders-panel';
  panel.hidden = !state.expandedBatches.has(batchKey);

  const list = document.createElement('ul');
  list.className = 'batch-orders-list';

  (batch.sortedOrders || []).forEach((order) => {
    const boxes = batch.orderColTotals?.[order] ?? 0;
    const li = document.createElement('li');
    li.className = 'batch-order-row';
    li.innerHTML = `
      <span class="batch-order-label">
        <span class="batch-order-num">#${escapeHTML(order)}</span>
        <span class="batch-order-qty">${boxes} bx</span>
      </span>
      <button type="button" class="batch-order-remove" title="Remove from this batch">−</button>
    `;
    li.querySelector('.batch-order-remove').addEventListener('click', (e) => {
      e.stopPropagation();
      excludeOrderFromBatch(batchKey, order);
    });
    list.appendChild(li);
  });

  panel.appendChild(list);

  const restorable = getRestorableOrdersForBatch(batch);
  if (restorable.length > 0) {
    const addRow = document.createElement('div');
    addRow.className = 'batch-orders-add';
    const addLabel = document.createElement('div');
    addLabel.className = 'batch-orders-add-label';
    addLabel.textContent = 'Add back:';
    addRow.appendChild(addLabel);
    const chipRow = document.createElement('div');
    chipRow.className = 'batch-orders-restore-row';
    restorable.forEach((order) => {
      const restoreBtn = document.createElement('button');
      restoreBtn.type = 'button';
      restoreBtn.className = 'batch-order-restore';
      restoreBtn.textContent = `#${order}`;
      restoreBtn.title = `Add order #${order} back to this batch`;
      restoreBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        restoreOrderToBatch(batchKey, order);
      });
      chipRow.appendChild(restoreBtn);
    });
    addRow.appendChild(chipRow);
    panel.appendChild(addRow);
  }

  return panel;
}

function renderBatchTabs() {
  const container = $('category-tabs');
  container.innerHTML = '';
  const batchKeys = Object.keys(state.splitGroups).sort();
  if (batchKeys.length === 0) {
    container.innerHTML = `<div class="batch-empty-state">No batches match the current filters or exclusions.<br>Adjust filters above or load a different CSV.</div>`;
    return;
  }
  batchKeys.forEach((batchKey) => {
    const batch = state.splitGroups[batchKey];
    const wrapper = document.createElement('div');
    wrapper.className = 'batch-item';
    wrapper.id = `batch-item-${batchKey}`;
    if (batchKey === state.activeGroupKey) wrapper.classList.add('active');
    if (state.expandedBatches.has(batchKey)) wrapper.classList.add('expanded');

    const row = document.createElement('div');
    row.className = 'batch-item-row';

    const expandBtn = document.createElement('button');
    expandBtn.type = 'button';
    expandBtn.className = 'batch-expand-btn';
    expandBtn.innerText = state.expandedBatches.has(batchKey) ? '▾' : '▸';
    expandBtn.title = 'Show orders in this batch';
    expandBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleBatchExpanded(batchKey);
    });

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'batch-btn';
    btn.id = `tab-${batchKey}`;
    const specialBadge = batch.isSpecial ? '<span class="batch-special-badge">SPECIAL</span>' : '';
    const shipMeta = formatBatchShipMeta(batch);
    const orderCount = batch.sortedOrders.length;
    const boxLabel = `${batch.totalBoxes} ${batch.totalBoxes === 1 ? 'Box' : 'Boxes'}`;
    const orderLabel = `${orderCount} ${orderCount === 1 ? 'Order' : 'Orders'}`;
    btn.innerHTML = `<span class="batch-name">${escapeHTML(batchKey)}${specialBadge}</span><span class="batch-meta">${boxLabel} • ${orderLabel}${escapeHTML(shipMeta)}</span>`;
    btn.addEventListener('click', () => selectGroup(batchKey));

    const splitBtn = document.createElement('button');
    splitBtn.type = 'button';
    splitBtn.className = 'batch-del-btn';
    splitBtn.innerText = '✂';
    splitBtn.title = 'Split this material/top-edge group by max orders';
    splitBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      splitSingleBatch(batchKey);
    });

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'batch-del-btn';
    delBtn.innerText = '✕';
    delBtn.title = 'Delete this batch';
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteBatch(batchKey);
    });

    row.appendChild(expandBtn);
    row.appendChild(btn);
    row.appendChild(splitBtn);
    row.appendChild(delBtn);
    wrapper.appendChild(row);
    wrapper.appendChild(renderBatchOrdersPanel(batchKey, batch));
    container.appendChild(wrapper);
  });
}

function selectGroup(batchKey) {
  state.activeGroupKey = batchKey;
  document.querySelectorAll('.batch-item').forEach((item) => item.classList.remove('active'));
  const activeItem = $(`batch-item-${batchKey}`);
  if (activeItem) activeItem.classList.add('active');
  renderCurrentView();
}

function getBatchPreviewRows(batch) {
  if (batch?.sourceRows?.length) return batch.sourceRows;
  if (batch?.rows?.length) return batch.rows;
  return [];
}

function setPreviewTab(which) {
  const printTab = $('tab-preview-print');
  const importTab = $('tab-preview-import');
  const printPanel = $('preview-print');
  const importPanel = $('preview-import');
  if (!printTab || !importTab || !printPanel || !importPanel) return;

  const showPrint = which !== 'import';
  printTab.classList.toggle('active', showPrint);
  importTab.classList.toggle('active', !showPrint);
  printTab.setAttribute('aria-selected', showPrint ? 'true' : 'false');
  importTab.setAttribute('aria-selected', showPrint ? 'false' : 'true');
  printPanel.hidden = !showPrint;
  importPanel.hidden = showPrint;
  printPanel.classList.toggle('active', showPrint);
  importPanel.classList.toggle('active', !showPrint);
}

function renderCurrentView() {
  const ci = state.colIndices;
  const batch = state.splitGroups[state.activeGroupKey];
  const tableHead = $('table-head');
  const tableBody = $('table-body');
  const printPreview = $('cutlist-print-preview');
  if (tableHead) tableHead.innerHTML = '';
  if (tableBody) tableBody.innerHTML = '';
  if (printPreview) printPreview.innerHTML = '';

  if (!batch) {
    $('current-view-title').innerText = 'No Batches Available';
    return;
  }

  $('current-view-title').innerText = `${state.activeGroupKey}.csv`;

  if (printPreview) {
    printPreview.innerHTML = buildCutListPrintCard(
      state.activeGroupKey,
      batch,
      state.colIndices,
      null,
      {
        allRows: state.parsedRows,
      }
    );
  }

  const previewRows = getBatchPreviewRows(batch);

  if (tableHead) {
    tableHead.innerHTML = `<tr>${state.parsedHeaders
      .map((h) => `<th>${escapeHTML(h)}</th>`)
      .join('')}</tr>`;
  }

  if (tableBody) {
    let bodyHTML = '';
    previewRows.forEach((row) => {
      bodyHTML += '<tr>';
      row.forEach((cell, idx) => {
        if (idx === ci.materialName) {
          const matName = cleanMaterialName(cell);
          bodyHTML += matName
            ? `<td><span class="badge">${escapeHTML(matName)}</span></td>`
            : `<td><span class="badge badge--danger">⚠️ MISSING MATERIAL</span></td>`;
        } else if (idx === ci.topEdge) {
          const edgeName = (cell || '').trim();
          bodyHTML += edgeName
            ? `<td>${escapeHTML(formatDecimalForDisplay(cell))}</td>`
            : `<td><span class="badge badge--danger">⚠️ MISSING TOP EDGE</span></td>`;
        } else {
          bodyHTML += `<td>${escapeHTML(formatDecimalForDisplay(cell))}</td>`;
        }
      });
      bodyHTML += '</tr>';
    });
    tableBody.innerHTML = bodyHTML;
  }
}

function isOrderExcluded(order) {
  return state.excludedOrders.includes(order);
}

function isMaterialExcluded(material) {
  return state.excludedMaterials.some(
    (excluded) => excluded.toLowerCase() === material.toLowerCase()
  );
}

function isTopEdgeExcluded(edge) {
  return state.excludedTopEdges.some((excluded) => excluded.toLowerCase() === edge.toLowerCase());
}

function populateUnifiedFilterSelect(select, values, isExcludedFn, formatLabel = (value) => value) {
  if (!select) return;
  const previouslySelected = new Set(
    Array.from(select.selectedOptions).map((option) => option.value)
  );
  if (values.length === 0) {
    select.innerHTML = '<option value="" disabled>No items in file</option>';
    select.disabled = true;
    return;
  }
  select.disabled = false;
  select.innerHTML = values
    .map((value) => {
      const removed = isExcludedFn(value);
      const label = removed ? `${formatLabel(value)} (removed)` : formatLabel(value);
      const removedClass = removed ? ' class="filter-option--removed"' : '';
      return `<option value="${escapeAttr(value)}"${removedClass}>${escapeHTML(label)}</option>`;
    })
    .join('');
  Array.from(select.options).forEach((option) => {
    if (previouslySelected.has(option.value)) option.selected = true;
  });
}

function updateExclusionOptions() {
  const orderSelect = $('order-filter-select');
  const materialSelect = $('material-filter-select');
  const topEdgeSelect = $('top-edge-filter-select');
  const allOrders = Array.from(
    new Set(
      state.originalParsedRows
        .map((row) => String(row[state.colIndices.orderNumber] || '').trim())
        .filter(Boolean)
    )
  ).sort(orderSortComparator);
  const allMaterials = Array.from(
    new Set(state.originalParsedRows.map(rowMaterialName).filter(Boolean))
  ).sort();
  const allTopEdges = Array.from(
    new Set(state.originalParsedRows.map(rowTopEdgeName).filter(Boolean))
  ).sort();

  populateUnifiedFilterSelect(
    orderSelect,
    allOrders,
    isOrderExcluded,
    (order) => `Order #${order}`
  );
  populateUnifiedFilterSelect(materialSelect, allMaterials, isMaterialExcluded);
  populateUnifiedFilterSelect(topEdgeSelect, allTopEdges, isTopEdgeExcluded);
}

function orderSortComparator(a, b) {
  const na = parseFloat(a);
  const nb = parseFloat(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb;
  return String(a).localeCompare(String(b));
}

function applyExclusionsAndRebuild() {
  state.parsedRows = applyExclusions(state.originalParsedRows, state.colIndices, {
    orders: state.excludedOrders,
    materials: state.excludedMaterials,
    topEdges: state.excludedTopEdges,
  });
  rebuild();
  updateRestoreAllButton();
}

function updateRestoreAllButton() {
  const btn = $('btn-restore-all-exclusions');
  if (!btn) return;
  const hasExclusions =
    state.excludedOrders.length > 0 ||
    state.excludedMaterials.length > 0 ||
    state.excludedTopEdges.length > 0 ||
    state.batchOrderExclusions.size > 0;
  btn.hidden = !hasExclusions;
}

function restoreAllExclusions() {
  const hasExclusions =
    state.excludedOrders.length > 0 ||
    state.excludedMaterials.length > 0 ||
    state.excludedTopEdges.length > 0 ||
    state.batchOrderExclusions.size > 0;
  if (!hasExclusions) return;

  state.excludedOrders = [];
  state.excludedMaterials = [];
  state.excludedTopEdges = [];
  state.batchOrderExclusions.clear();
  applyExclusionsAndRebuild();
  showToast('All removed items restored.', 'success');
}

function excludeOrder() {
  const select = $('order-filter-select');
  if (!select || select.disabled) {
    alert('No orders in the loaded file.');
    return;
  }
  const selected = Array.from(select.selectedOptions)
    .map((option) => option.value.trim())
    .filter(Boolean)
    .filter((order) => !isOrderExcluded(order));
  if (!selected.length) {
    alert('Select active orders to remove (not marked removed).');
    return;
  }

  let added = false;
  selected.forEach((orderToExclude) => {
    const exists = state.originalParsedRows.some(
      (row) => String(row[state.colIndices.orderNumber] || '').trim() === orderToExclude
    );
    if (!exists || isOrderExcluded(orderToExclude)) return;
    state.excludedOrders.push(orderToExclude);
    added = true;
  });

  if (added) applyExclusionsAndRebuild();
}

function restoreOrders() {
  const select = $('order-filter-select');
  if (!select || select.disabled) return;
  const selected = Array.from(select.selectedOptions)
    .map((option) => option.value)
    .filter(Boolean)
    .filter((order) => isOrderExcluded(order));
  if (!selected.length) {
    alert('Select removed orders to restore (marked removed).');
    return;
  }

  state.excludedOrders = state.excludedOrders.filter((order) => !selected.includes(order));
  applyExclusionsAndRebuild();
}

function excludeMaterial() {
  const select = $('material-filter-select');
  if (!select || select.disabled) {
    alert('No materials in the loaded file.');
    return;
  }
  const selected = Array.from(select.selectedOptions)
    .map((option) => cleanMaterialName(option.value.trim()))
    .filter(Boolean)
    .filter((material) => !isMaterialExcluded(material));
  if (!selected.length) {
    alert('Select active materials to remove (not marked removed).');
    return;
  }

  let added = false;
  selected.forEach((materialToExclude) => {
    const exists = state.originalParsedRows.some(
      (row) => rowMaterialName(row).toLowerCase() === materialToExclude.toLowerCase()
    );
    if (!exists || isMaterialExcluded(materialToExclude)) return;
    state.excludedMaterials.push(materialToExclude);
    added = true;
  });

  if (added) applyExclusionsAndRebuild();
}

function restoreMaterials() {
  const select = $('material-filter-select');
  if (!select || select.disabled) return;
  const selected = Array.from(select.selectedOptions)
    .map((option) => option.value)
    .filter(Boolean)
    .filter((material) => isMaterialExcluded(material));
  if (!selected.length) {
    alert('Select removed materials to restore (marked removed).');
    return;
  }

  state.excludedMaterials = state.excludedMaterials.filter(
    (material) => !selected.some((value) => value.toLowerCase() === material.toLowerCase())
  );
  applyExclusionsAndRebuild();
}

function excludeTopEdge() {
  const select = $('top-edge-filter-select');
  if (!select || select.disabled) {
    alert('No top edges in the loaded file.');
    return;
  }
  const selected = Array.from(select.selectedOptions)
    .map((option) => normalizeTopEdgeName(option.value.trim()))
    .filter(Boolean)
    .filter((edge) => !isTopEdgeExcluded(edge));
  if (!selected.length) {
    alert('Select active top edges to remove (not marked removed).');
    return;
  }

  let added = false;
  selected.forEach((edgeToExclude) => {
    const exists = state.originalParsedRows.some(
      (row) => rowTopEdgeName(row).toLowerCase() === edgeToExclude.toLowerCase()
    );
    if (!exists || isTopEdgeExcluded(edgeToExclude)) return;
    state.excludedTopEdges.push(edgeToExclude);
    added = true;
  });

  if (added) applyExclusionsAndRebuild();
}

function restoreTopEdges() {
  const select = $('top-edge-filter-select');
  if (!select || select.disabled) return;
  const selected = Array.from(select.selectedOptions)
    .map((option) => option.value)
    .filter(Boolean)
    .filter((edge) => isTopEdgeExcluded(edge));
  if (!selected.length) {
    alert('Select removed top edges to restore (marked removed).');
    return;
  }

  state.excludedTopEdges = state.excludedTopEdges.filter(
    (edge) => !selected.some((value) => value.toLowerCase() === edge.toLowerCase())
  );
  applyExclusionsAndRebuild();
}

function updateMaxOrdersSplit() {
  const inputVal = parseInt($('max-orders-input').value);
  if (Number.isNaN(inputVal) || inputVal < 1) {
    alert('Please enter a valid number of orders (minimum 1).');
    return;
  }
  state.maxOrdersPerBatch = inputVal;
  persistSettings();
  rebuild();
}

function splitSingleBatch(batchKey) {
  const batch = state.splitGroups[batchKey];
  if (!batch || !batch.sourceGroupKey) return;
  const currentLimit = state.groupSplitLimits[batch.sourceGroupKey] || state.maxOrdersPerBatch;
  const response = prompt(`Split ${batchKey} by max orders per batch:`, currentLimit);
  if (response === null) return;
  const inputVal = parseInt(response);
  if (Number.isNaN(inputVal) || inputVal < 1) {
    alert('Please enter a valid number of orders (minimum 1).');
    return;
  }
  state.groupSplitLimits[batch.sourceGroupKey] = inputVal;
  persistSettings();
  state.activeGroupKey = '';
  rebuild();
}

function deleteBatch(batchKey) {
  const batch = state.splitGroups[batchKey];
  if (!batch) return;
  if (
    confirm(
      `Are you sure you want to delete the batch "${batchKey}"? This will exclude all orders in this batch.`
    )
  ) {
    const orders = batch.sortedOrders || [];
    orders.forEach((order) => {
      const orderStr = String(order).trim();
      if (!state.excludedOrders.includes(orderStr)) {
        state.excludedOrders.push(orderStr);
      }
    });
    applyExclusionsAndRebuild();
    showToast(
      `Batch "${batchKey}" deleted. ${orders.length} order${orders.length === 1 ? '' : 's'} excluded.`,
      'success'
    );
  }
}

function filterBatches() {
  const query = $('batch-search-input').value.trim().toLowerCase();
  Object.keys(state.splitGroups).forEach((batchKey) => {
    const batch = state.splitGroups[batchKey];
    const btn = $(`tab-${batchKey}`);
    if (!btn) return;
    const wrapper = btn.parentElement;
    const matchKey = batchKey.toLowerCase().includes(query);
    const matchOrder = batch.sortedOrders.some((order) =>
      String(order).toLowerCase().includes(query)
    );
    wrapper.style.display = matchKey || matchOrder ? 'flex' : 'none';
  });
}

function downloadCurrentFile() {
  const batch = state.splitGroups[state.activeGroupKey];
  if (!batch) {
    alert('Batch not found for export.');
    return;
  }
  const cutRows = getCutListRowsForExport(
    getBatchExportRows(batch),
    state.colIndices,
    shouldRoundExportWidths(),
    state.parsedHeaders
  );
  const { headers, rows } = filterForExport(state.parsedHeaders, cutRows);
  const csv = convertToCSV(headers, rows);
  triggerDownload(csv, `${state.activeGroupKey}.csv`);
}

function triggerDownload(content, filename) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.setAttribute('download', filename);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function downloadAllZip() {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  let added = false;
  Object.keys(state.splitGroups).forEach((batchKey) => {
    const batch = state.splitGroups[batchKey];
    const cutRows = getCutListRowsForExport(
      getBatchExportRows(batch),
      state.colIndices,
      shouldRoundExportWidths(),
      state.parsedHeaders
    );
    const { headers, rows } = filterForExport(state.parsedHeaders, cutRows);
    zip.file(`${batchKey}.csv`, convertToCSV(headers, rows));
    added = true;
  });
  if (added) {
    const content = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.setAttribute('download', `opticut_splits_${new Date().toISOString().slice(0, 10)}.zip`);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

function runPrintJob(buildMarkup, bodyClasses) {
  const printContainer = $('all-print-container');
  if (!printContainer) return;
  printContainer.innerHTML = '';
  printContainer.appendChild(buildMarkup());
  bodyClasses.forEach((cls) => document.body.classList.add(cls));
  setPrintPageStyle('opticut');
  const previousTitle = document.title;
  document.title = ' ';

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    bodyClasses.forEach((cls) => document.body.classList.remove(cls));
    printContainer.innerHTML = '';
    document.title = previousTitle;
    clearPrintPageStyle();
  };

  window.addEventListener('afterprint', cleanup, { once: true });
  // Long fallback only — short timers can wipe the sheet while the dialog is open.
  setTimeout(cleanup, 120_000);
  window.print();
}

function triggerPrintCutList() {
  const batch = state.splitGroups[state.activeGroupKey];
  if (!batch) return;
  runPrintJob(() => {
    const cardDiv = document.createElement('div');
    cardDiv.className = 'print-batch-card';
    cardDiv.innerHTML = buildCutListPrintCard(state.activeGroupKey, batch, state.colIndices, null, {
      allRows: state.parsedRows,
    });
    return cardDiv;
  }, ['print-active', 'print-cutlist-active']);
}

function printAllCutLists() {
  const keys = Object.keys(state.splitGroups).sort();
  if (!keys.length) return;
  runPrintJob(() => {
    const fragment = document.createDocumentFragment();
    keys.forEach((batchKey, idx) => {
      const batch = state.splitGroups[batchKey];
      const cardDiv = document.createElement('div');
      cardDiv.className = 'print-batch-card';
      cardDiv.innerHTML = buildCutListPrintCard(
        batchKey,
        batch,
        state.colIndices,
        {
          index: idx + 1,
          count: keys.length,
        },
        { allRows: state.parsedRows }
      );
      fragment.appendChild(cardDiv);
    });
    return fragment;
  }, ['print-active', 'print-cutlist-active', 'print-all-cutlists-active']);
}

function printBatchOrdersIndex() {
  const keys = Object.keys(state.splitGroups);
  if (!keys.length) return;
  runPrintJob(() => {
    const wrap = document.createElement('div');
    wrap.className = 'print-batch-card print-batch-index-card';
    wrap.innerHTML = buildBatchOrdersIndex(state.splitGroups, state.colIndices);
    return wrap;
  }, ['print-active', 'print-batch-index-active']);
}

function toggleErrorDetails() {
  const details = $('error-list');
  const icon = $('error-toggle-icon');
  const button = $('error-toggle');
  if (details.hidden) {
    details.hidden = false;
    icon.innerText = '▲';
    button.setAttribute('aria-expanded', 'true');
  } else {
    details.hidden = true;
    icon.innerText = '▼';
    button.setAttribute('aria-expanded', 'false');
  }
}

function shareApplication() {
  const url = window.location.href;
  navigator.clipboard
    .writeText(url)
    .then(() => showToast('Application URL copied to clipboard!', 'success'))
    .catch((err) => {
      console.error('Could not copy text: ', err);
      showToast('Could not copy URL automatically. Link: ' + url, 'warning', 6000);
    });
}

function handleRoundExportWidthToggle(checkbox) {
  if (!checkbox?.checked) {
    alert(
      'Warning: export Width rounding is now OFF. CSV exports will keep original Width values, matching rows may not merge, and the file can have more rows.'
    );
  }
}

function loadDemoData() {
  state.currentFileName = 'demo.csv';
  parseAndLoad(DEMO_CSV);
}

async function sendActiveBatchToStation() {
  const batchKey = state.activeGroupKey;
  const batch = state.splitGroups[batchKey];
  if (!batchKey || !batch) {
    showToast('Select a batch first.', 'warning');
    return;
  }

  const btn = $('btn-send-station');
  const allBtn = $('btn-send-all-station');
  if (btn) btn.disabled = true;
  if (allBtn) allBtn.disabled = true;
  try {
    await publishStationJob(buildStationJobPayload(batchKey, batch));
    showToast(`Sent ${batchKey} to station queue.`, 'success');
  } catch (err) {
    console.error(err);
    showToast(err?.message || 'Could not send to station.', 'danger', 6000);
  } finally {
    if (btn) btn.disabled = false;
    if (allBtn) allBtn.disabled = false;
  }
}

function buildStationJobPayload(batchKey, batch) {
  return {
    batchKey,
    fileName: state.currentFileName || state.appSettings?.recentFiles?.[0] || '',
    materialName: batch.materialName || '',
    totalBoxes: batch.totalBoxes || 0,
    orders: batch.sortedOrders || [],
    isSpecial: Boolean(batch.isSpecial),
    html: buildCutListPrintCard(batchKey, batch, state.colIndices, null, {
      allRows: state.parsedRows,
      mode: 'station',
    }),
  };
}

async function sendAllBatchesToStation() {
  const keys = Object.keys(state.splitGroups).sort();
  if (!keys.length) {
    showToast('No batches to send.', 'warning');
    return;
  }

  const btn = $('btn-send-station');
  const allBtn = $('btn-send-all-station');
  if (btn) btn.disabled = true;
  if (allBtn) allBtn.disabled = true;

  let sent = 0;
  let failed = 0;
  try {
    showToast(`Sending ${keys.length} batches to station…`, 'info', 2500);
    for (const batchKey of keys) {
      const batch = state.splitGroups[batchKey];
      if (!batch) continue;
      try {
        await publishStationJob(buildStationJobPayload(batchKey, batch), { skipPurge: true });
        sent += 1;
      } catch (err) {
        console.error(batchKey, err);
        failed += 1;
      }
    }
    void purgeExpiredStationJobs().catch((err) => console.warn('Station purge failed:', err));
    if (failed === 0) {
      showToast(`Sent all ${sent} batches to station.`, 'success', 4500);
    } else {
      showToast(`Sent ${sent} batches; ${failed} failed.`, 'warning', 6000);
    }
  } finally {
    if (btn) btn.disabled = false;
    if (allBtn) allBtn.disabled = false;
  }
}

function scrollSidebarDetailsIntoView(details) {
  const controls = $('controls-sidebar-card');
  if (!controls || !details.open) return;
  requestAnimationFrame(() => {
    const summary = details.querySelector('.sidebar-details-summary');
    if (!summary) return;
    const parentRect = controls.getBoundingClientRect();
    const summaryRect = summary.getBoundingClientRect();
    if (summaryRect.top < parentRect.top) {
      controls.scrollTop += summaryRect.top - parentRect.top - 6;
    } else if (summaryRect.bottom > parentRect.bottom) {
      controls.scrollTop += summaryRect.bottom - parentRect.bottom + 6;
    }
  });
}

function wireSidebarDetailsScroll() {
  const controls = $('controls-sidebar-card');
  if (!controls) return;
  controls.querySelectorAll('.sidebar-details').forEach((details) => {
    details.addEventListener('toggle', () => scrollSidebarDetailsIntoView(details));
  });
}

function wireEvents() {
  const dropZone = $('drop-zone');
  const fileInput = $('file-input');
  if (!dropZone || !fileInput) {
    console.error('OptiCut import controls missing from DOM (#drop-zone / #file-input).');
    return;
  }

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) processFile(e.dataTransfer.files[0]);
  });
  dropZone.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) processFile(e.target.files[0]);
  });

  $('btn-reset')?.addEventListener('click', () => {
    void hardResetApp();
  });
  $('btn-download-all')?.addEventListener('click', downloadAllZip);
  $('btn-export-current')?.addEventListener('click', downloadCurrentFile);
  $('btn-print-cutlist')?.addEventListener('click', triggerPrintCutList);
  $('btn-print-all-cutlists')?.addEventListener('click', printAllCutLists);
  $('btn-print-batch-index')?.addEventListener('click', printBatchOrdersIndex);
  $('btn-send-station')?.addEventListener('click', () => {
    void sendActiveBatchToStation();
  });
  $('btn-send-all-station')?.addEventListener('click', () => {
    void sendAllBatchesToStation();
  });
  $('tab-preview-print')?.addEventListener('click', () => setPreviewTab('print'));
  $('tab-preview-import')?.addEventListener('click', () => setPreviewTab('import'));
  $('btn-share')?.addEventListener('click', shareApplication);
  $('demo-link')?.addEventListener('click', loadDemoData);
  $('btn-apply-max-orders')?.addEventListener('click', updateMaxOrdersSplit);
  if ($('max-orders-input')) {
    $('max-orders-input').value = String(state.maxOrdersPerBatch);
    $('max-orders-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        updateMaxOrdersSplit();
      }
    });
  }
  $('batch-search-input')?.addEventListener('input', filterBatches);
  $('batch-search-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.target.value = '';
      filterBatches();
      e.target.blur();
    }
  });

  $('btn-exclude-order')?.addEventListener('click', excludeOrder);
  $('btn-restore-order')?.addEventListener('click', restoreOrders);
  $('btn-exclude-material')?.addEventListener('click', excludeMaterial);
  $('btn-restore-material')?.addEventListener('click', restoreMaterials);
  $('btn-exclude-top-edge')?.addEventListener('click', excludeTopEdge);
  $('btn-restore-top-edge')?.addEventListener('click', restoreTopEdges);
  $('btn-restore-all-exclusions')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    restoreAllExclusions();
  });

  $('chk-round-export-widths')?.addEventListener('change', (e) =>
    handleRoundExportWidthToggle(e.target)
  );

  $('chk-separate-special-orders')?.addEventListener('change', () => {
    if (state.colIndices) rebuild();
  });

  $('chk-combine-ship-dates')?.addEventListener('change', () => {
    if (state.colIndices) rebuild();
  });

  $('error-toggle')?.addEventListener('click', toggleErrorDetails);
  wireSidebarDetailsScroll();
}

/**
 * Initialize the OptiCut tool UI (expects OptiCut DOM IDs already in the page).
 * Station hash is handled by the batch shell router — call mountStation() instead.
 */
export function initOpticutApp() {
  wireEvents();
}

/** Mount the live Station queue into #station-root. */
export function mountStation() {
  const shell = document.querySelector('.app-shell');
  if (shell) shell.hidden = true;
  const root = $('station-root');
  if (root) {
    root.hidden = false;
    mountStationView(root);
  }
}

/** Load an OptiCut/Allmoxy cut-list CSV File into the OptiCut tool. */
export function loadOpticutFile(file) {
  if (!file) return Promise.resolve(null);
  return processFile(file);
}

/** Snapshot for batch cross-validation against the Top Edge CSV. */
export function getOpticutBatchSummary() {
  const summary = summarizeOpticutState({
    splitGroups: state.splitGroups,
    parsedRows: state.parsedRows,
    colIndices: state.colIndices,
  });
  return {
    ...summary,
    fileName: state.currentFileName || '',
  };
}

/** True when the URL hash is the station route. */
export { isStationHash };
