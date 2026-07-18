import { escapeHTML, escapeAttr } from '../logic/csv.js';
import {
  filterStationJobs,
  uniqueStationMaterials,
  subscribeStationJobs,
  stationHashBatchKey,
  updateStationJobCheck,
  mergeStationChecks,
  softDeleteStationJob,
  softDeleteStationJobs,
  restoreStationJob,
  clearStationJobChecks,
  clearStationJobsChecks,
  isStationJobDeleted,
  findStationJobByScan,
  wipeAllStationJobs,
  verifyStationWipePassword,
} from '../logic/stationSync.js';
import { setPrintPageStyle, clearPrintPageStyle } from '../printPageStyle.js';

const ZOOM_STORAGE_KEY = 'opticut-station-zoom';
const ZOOM_STEPS = [0.7, 0.85, 1, 1.15, 1.3, 1.5];

function formatSentAt(ms) {
  if (!ms) return '';
  try {
    return new Date(ms).toLocaleString('en-US', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return '';
  }
}

/** Compact "5m ago" style label for queue cards. */
function formatRelativeTime(ms, now = Date.now()) {
  if (!ms) return '';
  const diff = Math.max(0, now - ms);
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return formatSentAt(ms);
}

function formatClock(now = new Date()) {
  return now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function setStationHash(batchKey) {
  const next = batchKey ? `#station/${encodeURIComponent(batchKey)}` : '#station';
  if (globalThis.location?.hash !== next) {
    globalThis.history?.replaceState(null, '', next);
  }
}

function sheetRenderKey(job) {
  if (!job?.batchKey) return '';
  return `${job.batchKey}|${job.sentAt || ''}|${String(job.html || '').length}`;
}

function loadZoom() {
  try {
    const saved = parseFloat(globalThis.localStorage?.getItem(ZOOM_STORAGE_KEY));
    if (ZOOM_STEPS.includes(saved)) return saved;
  } catch {
    /* private mode */
  }
  return 1;
}

function saveZoom(zoom) {
  try {
    globalThis.localStorage?.setItem(ZOOM_STORAGE_KEY, String(zoom));
  } catch {
    /* private mode */
  }
}

const EMPTY_ICON = `
  <svg class="station-empty-icon" viewBox="0 0 48 48" fill="none" aria-hidden="true">
    <rect x="7" y="10" width="34" height="28" rx="3" stroke="currentColor" stroke-width="2.5" opacity="0.45"/>
    <path d="M14 19h20M14 25h20M14 31h12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" opacity="0.7"/>
  </svg>`;

/**
 * Mount the fullscreen station queue UI (search + material filter + multi-batch
 * + live synced checkboxes + zoom).
 * @param {HTMLElement} root
 * @returns {() => void} teardown
 */
export function mountStationView(root) {
  if (!root) return () => {};

  document.body.classList.add('station-live');
  root.hidden = false;
  root.innerHTML = `
    <header class="station-live-header">
      <div class="station-live-brand">
        <span class="station-brand-mark" aria-hidden="true">
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <rect width="28" height="28" rx="9" fill="currentColor" opacity="0.12" />
            <path
              d="M8 10.5h12M8 14h12M8 17.5h8"
              stroke="currentColor"
              stroke-width="2.2"
              stroke-linecap="round"
            />
          </svg>
        </span>
        <div class="station-brand-text">
          <strong>DBS Station</strong>
          <span class="station-live-status" id="station-live-status" data-state="connecting">
            <span class="station-status-dot" aria-hidden="true"></span>
            <span id="station-status-text">Connecting…</span>
          </span>
        </div>
      </div>
      <div class="station-live-clock" id="station-clock">${escapeHTML(formatClock())}</div>
    </header>
    <div class="station-live-layout">
      <aside class="station-queue" aria-label="Sent batches">
        <div class="station-queue-filters">
          <div class="station-search-wrap">
            <svg class="station-search-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <circle cx="9" cy="9" r="5.5" stroke="currentColor" stroke-width="1.8"/>
              <path d="M13.5 13.5 17 17" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
            </svg>
            <label class="sr-only" for="station-search">Search batch or order</label>
            <input
              id="station-search"
              class="input station-search"
              type="search"
              placeholder="Search or scan barcode…"
              autocomplete="off"
            />
            <button type="button" class="station-search-clear" id="station-search-clear" aria-label="Clear search" hidden>×</button>
          </div>
          <p class="station-scan-hint" id="station-scan-hint">Scan a batch barcode to open it</p>
          <label class="sr-only" for="station-material">Material</label>
          <select id="station-material" class="input station-material">
            <option value="">All materials</option>
          </select>
        </div>
        <div class="station-queue-count" id="station-queue-count"></div>
        <div class="station-queue-actions" id="station-queue-actions" hidden>
          <div class="station-queue-actions-main">
            <label class="station-queue-select-all" title="Select active batches">
              <input type="checkbox" id="station-select-all" />
              <span>Select</span>
            </label>
            <button
              type="button"
              class="station-queue-action-btn"
              id="station-remove-selected"
              disabled
              title="Remove checked batches"
            >
              Remove
            </button>
            <button
              type="button"
              class="station-queue-action-btn station-queue-action-btn--danger"
              id="station-remove-all"
              title="Remove every active batch"
            >
              Remove all
            </button>
          </div>
          <button
            type="button"
            class="station-queue-action-btn station-queue-action-btn--block"
            id="station-clear-all-checks-btn"
            title="Clear checkboxes for every active batch"
          >
            Clear all checks
          </button>
          <button
            type="button"
            class="station-queue-action-btn station-queue-action-btn--block station-queue-action-btn--danger"
            id="station-wipe-all"
            title="Permanently delete every batch (password required)"
          >
            Wipe database
          </button>
        </div>
        <div class="station-queue-list" id="station-queue-list" role="listbox"></div>
      </aside>
      <main class="station-live-main">
        <div class="station-batch-bar" id="station-batch-bar" hidden>
          <div class="station-batch-info">
            <h2 class="station-batch-title" id="station-batch-title"></h2>
            <div class="station-batch-chips" id="station-batch-chips"></div>
          </div>
          <div class="station-batch-tools">
            <div class="station-progress" id="station-progress" hidden>
              <div class="station-progress-track"><div class="station-progress-fill" id="station-progress-fill"></div></div>
              <span class="station-progress-label" id="station-progress-label"></span>
            </div>
            <div class="station-zoom" role="group" aria-label="Zoom cut list">
              <button type="button" class="station-zoom-btn" id="station-zoom-out" aria-label="Zoom out">−</button>
              <span class="station-zoom-label" id="station-zoom-label">100%</span>
              <button type="button" class="station-zoom-btn" id="station-zoom-in" aria-label="Zoom in">+</button>
            </div>
            <button
              type="button"
              class="station-print-btn"
              id="station-print-btn"
              title="Print or save as PDF"
            >
              Print / PDF
            </button>
            <button
              type="button"
              class="station-tool-btn"
              id="station-clear-checks-btn"
              title="Clear checkboxes for this batch"
            >
              Clear checks
            </button>
            <button
              type="button"
              class="station-tool-btn station-tool-btn--danger"
              id="station-remove-btn"
              title="Remove this batch from the station queue"
            >
              Remove
            </button>
          </div>
        </div>
        <div class="station-live-body" id="station-live-body">
          <div class="station-live-empty">
            ${EMPTY_ICON}
            <p class="station-empty-title">Waiting for batches</p>
            <p class="station-empty-hint">Send one from the prep computer with <b>Send to station</b>.</p>
          </div>
        </div>
      </main>
    </div>
  `;

  const statusEl = root.querySelector('#station-live-status');
  const statusTextEl = root.querySelector('#station-status-text');
  const clockEl = root.querySelector('#station-clock');
  const bodyEl = root.querySelector('#station-live-body');
  const listEl = root.querySelector('#station-queue-list');
  const countEl = root.querySelector('#station-queue-count');
  const queueActionsEl = root.querySelector('#station-queue-actions');
  const selectAllEl = root.querySelector('#station-select-all');
  const removeSelectedBtnEl = root.querySelector('#station-remove-selected');
  const removeAllBtnEl = root.querySelector('#station-remove-all');
  const wipeAllBtnEl = root.querySelector('#station-wipe-all');
  const clearAllChecksBtnEl = root.querySelector('#station-clear-all-checks-btn');
  const searchEl = root.querySelector('#station-search');
  const searchClearEl = root.querySelector('#station-search-clear');
  const scanHintEl = root.querySelector('#station-scan-hint');
  const materialEl = root.querySelector('#station-material');
  const batchBarEl = root.querySelector('#station-batch-bar');
  const batchTitleEl = root.querySelector('#station-batch-title');
  const batchChipsEl = root.querySelector('#station-batch-chips');
  const progressEl = root.querySelector('#station-progress');
  const progressFillEl = root.querySelector('#station-progress-fill');
  const progressLabelEl = root.querySelector('#station-progress-label');
  const zoomOutEl = root.querySelector('#station-zoom-out');
  const zoomInEl = root.querySelector('#station-zoom-in');
  const zoomLabelEl = root.querySelector('#station-zoom-label');
  const printBtnEl = root.querySelector('#station-print-btn');
  const clearChecksBtnEl = root.querySelector('#station-clear-checks-btn');
  const removeBtnEl = root.querySelector('#station-remove-btn');

  /** @type {object[]} */
  let allJobs = [];
  let selectedKey = stationHashBatchKey();
  /** @type {Set<string>} multi-select for remove */
  const checkedKeys = new Set();
  let renderedKey = '';
  let unsub = () => {};
  let cancelled = false;
  let zoom = loadZoom();
  /** @type {Map<string, Record<string, boolean>>} batchKey → rowId → wanted checked */
  const pendingByBatch = new Map();

  const clockTimer = setInterval(() => {
    clockEl.textContent = formatClock();
  }, 15000);

  function setStatus(state, text) {
    statusEl.dataset.state = state;
    statusTextEl.textContent = text;
  }

  function activeJobs() {
    return allJobs.filter((j) => !isStationJobDeleted(j));
  }

  function removedJobs() {
    return allJobs.filter((j) => isStationJobDeleted(j));
  }

  /** Print via the shared print container so @media print rules work (not a blank page). */
  function printSelectedBatch() {
    const job = activeJobs().find((j) => j.batchKey === selectedKey);
    if (!job?.html) {
      setStatus('error', 'Select a batch to print');
      return;
    }
    const printContainer = document.getElementById('all-print-container');
    if (!printContainer) {
      setStatus('error', 'Print container missing');
      return;
    }

    const card = document.createElement('div');
    card.className = 'print-batch-card';
    card.innerHTML = job.html;
    const checks = effectiveChecks(job);
    card.querySelectorAll('.station-check[data-row-id]').forEach((input) => {
      const id = input.getAttribute('data-row-id') || '';
      input.checked = Boolean(checks[id]);
    });

    printContainer.innerHTML = '';
    printContainer.appendChild(card);

    const bodyClasses = ['print-active', 'print-cutlist-active', 'station-print-active'];
    bodyClasses.forEach((cls) => document.body.classList.add(cls));
    setPrintPageStyle('opticut');

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      bodyClasses.forEach((cls) => document.body.classList.remove(cls));
      printContainer.innerHTML = '';
      clearPrintPageStyle();
    };
    window.addEventListener('afterprint', cleanup, { once: true });
    setTimeout(cleanup, 120_000);
    window.print();
  }

  async function clearSelectedChecks() {
    const batchKey = selectedKey;
    const job = activeJobs().find((j) => j.batchKey === batchKey);
    if (!job) return;
    if (!confirm(`Clear all checkboxes for ${batchKey}?`)) return;
    pendingByBatch.delete(batchKey);
    job.checks = {};
    applyStationChecks(bodyEl, job);
    renderBatchBar(job);
    updateQueueItemProgress(batchKey, job);
    try {
      await clearStationJobChecks(batchKey);
      setStatus('live', 'Checks cleared');
    } catch (err) {
      console.error(err);
      setStatus('error', 'Could not clear checks');
    }
  }

  async function clearAllChecks() {
    const keys = activeJobs()
      .map((j) => j.batchKey)
      .filter(Boolean);
    if (!keys.length) return;
    if (
      !confirm(`Clear checkboxes for all ${keys.length} batch${keys.length === 1 ? '' : 'es'}?`)
    ) {
      return;
    }
    keys.forEach((key) => {
      pendingByBatch.delete(key);
      const job = allJobs.find((j) => j.batchKey === key);
      if (job) job.checks = {};
    });
    const selected = activeJobs().find((j) => j.batchKey === selectedKey);
    if (selected) {
      applyStationChecks(bodyEl, selected);
      renderBatchBar(selected);
    }
    try {
      await clearStationJobsChecks(keys);
      setStatus('live', 'All checks cleared');
      renderQueue();
    } catch (err) {
      console.error(err);
      setStatus('error', 'Could not clear all checks');
    }
  }

  async function removeSelectedBatch() {
    const batchKey = selectedKey;
    if (!batchKey) return;
    if (!confirm(`Remove ${batchKey} from station?\nIt stays in the list — tap Add back to restore.`)) return;
    try {
      await softDeleteStationJob(batchKey);
      pendingByBatch.delete(batchKey);
      checkedKeys.delete(batchKey);
      selectedKey = '';
      renderedKey = '';
      setStationHash('');
      setStatus('live', 'Batch removed');
    } catch (err) {
      console.error(err);
      setStatus('error', 'Could not remove batch');
    }
  }

  async function removeCheckedBatches() {
    const keys = [...checkedKeys].filter((key) => activeJobs().some((j) => j.batchKey === key));
    if (!keys.length) return;
    if (
      !confirm(
        `Remove ${keys.length} selected batch${keys.length === 1 ? '' : 'es'} from station?\nThey stay in the list — tap Add back to restore.`
      )
    ) {
      return;
    }
    try {
      await softDeleteStationJobs(keys);
      keys.forEach((key) => {
        pendingByBatch.delete(key);
        checkedKeys.delete(key);
      });
      if (keys.includes(selectedKey)) {
        selectedKey = '';
        renderedKey = '';
        setStationHash('');
      }
      setStatus('live', `${keys.length} batch${keys.length === 1 ? '' : 'es'} removed`);
    } catch (err) {
      console.error(err);
      setStatus('error', 'Could not remove selected batches');
    }
  }

  async function removeAllBatches() {
    const keys = activeJobs()
      .map((j) => j.batchKey)
      .filter(Boolean);
    if (!keys.length) return;
    if (
      !confirm(
        `Remove all ${keys.length} batch${keys.length === 1 ? '' : 'es'} from station?\nThey stay in the list — tap Add back to restore.`
      )
    ) {
      return;
    }
    try {
      await softDeleteStationJobs(keys);
      keys.forEach((key) => {
        pendingByBatch.delete(key);
        checkedKeys.delete(key);
      });
      selectedKey = '';
      renderedKey = '';
      setStationHash('');
      setStatus('live', 'All batches removed');
    } catch (err) {
      console.error(err);
      setStatus('error', 'Could not remove all batches');
    }
  }

  async function wipeAllBatchesFromDatabase() {
    const total = allJobs.length;
    if (!total) return;

    const password = prompt(
      `Permanently wipe ALL ${total} batch${total === 1 ? '' : 'es'} from the station database?\nThis cannot be undone. Enter password:`
    );
    if (password === null) return;
    if (!verifyStationWipePassword(password)) {
      alert('Incorrect password.');
      return;
    }
    if (
      !confirm(
        `Delete all ${total} batch${total === 1 ? '' : 'es'} forever?\nActive and removed batches will disappear. Re-send from prep to bring them back.`
      )
    ) {
      return;
    }

    wipeAllBtnEl.disabled = true;
    try {
      const deleted = await wipeAllStationJobs();
      pendingByBatch.clear();
      checkedKeys.clear();
      allJobs = [];
      selectedKey = '';
      renderedKey = '';
      setStationHash('');
      renderQueue();
      batchBarEl.hidden = true;
      bodyEl.innerHTML = `
        <div class="station-live-empty">
          ${EMPTY_ICON}
          <p class="station-empty-title">Database wiped</p>
          <p class="station-empty-hint">Send batches from prep to start again</p>
        </div>`;
      setStatus('live', `Wiped ${deleted} batch${deleted === 1 ? '' : 'es'}`);
    } catch (err) {
      console.error(err);
      setStatus('error', 'Could not wipe database');
    } finally {
      wipeAllBtnEl.disabled = allJobs.length === 0;
    }
  }

  function updateQueueActionButtons(filteredActiveKeys) {
    const activeCount = activeJobs().length;
    const totalCount = allJobs.length;
    queueActionsEl.hidden = totalCount === 0;
    const selectedCount = filteredActiveKeys.filter((k) => checkedKeys.has(k)).length;
    removeSelectedBtnEl.disabled = selectedCount === 0;
    removeSelectedBtnEl.textContent = selectedCount > 0 ? `Remove (${selectedCount})` : 'Remove';
    removeAllBtnEl.disabled = activeCount === 0;
    clearAllChecksBtnEl.disabled = activeCount === 0;
    wipeAllBtnEl.disabled = totalCount === 0;
    selectAllEl.disabled = filteredActiveKeys.length === 0;
    const allFilteredChecked =
      filteredActiveKeys.length > 0 && filteredActiveKeys.every((k) => checkedKeys.has(k));
    selectAllEl.checked = allFilteredChecked;
    selectAllEl.indeterminate = selectedCount > 0 && selectedCount < filteredActiveKeys.length;
  }

  async function restoreBatch(batchKey) {
    try {
      await restoreStationJob(batchKey);
      selectedKey = batchKey;
      setStationHash(batchKey);
      renderedKey = '';
      setStatus('live', 'Batch added back');
    } catch (err) {
      console.error(err);
      setStatus('error', 'Could not add batch back');
    }
  }

  function effectiveChecks(job) {
    if (!job) return {};
    return mergeStationChecks(job.checks, pendingByBatch.get(job.batchKey));
  }

  function setPending(batchKey, rowId, checked) {
    let map = pendingByBatch.get(batchKey);
    if (!map) {
      map = {};
      pendingByBatch.set(batchKey, map);
    }
    map[rowId] = checked;
  }

  function clearPendingRow(batchKey, rowId) {
    const map = pendingByBatch.get(batchKey);
    if (!map) return;
    delete map[rowId];
    if (!Object.keys(map).length) pendingByBatch.delete(batchKey);
  }

  /** Drop pending entries once the server matches what we wanted. */
  function clearPendingIfSynced(batchKey, serverChecks) {
    const pending = pendingByBatch.get(batchKey);
    if (!pending) return;
    const merged = mergeStationChecks(serverChecks, null);
    Object.keys(pending).forEach((rowId) => {
      const want = Boolean(pending[rowId]);
      const has = Boolean(merged[rowId]);
      if (want === has) delete pending[rowId];
    });
    if (!Object.keys(pending).length) pendingByBatch.delete(batchKey);
  }

  function countChecks(job) {
    const checks = effectiveChecks(job);
    const checked = Object.keys(checks).length;
    const total = job?.html ? (job.html.match(/class="station-check"/g) || []).length : 0;
    return { checked, total };
  }

  function applyStationChecks(rootEl, job) {
    const map = effectiveChecks(job);
    rootEl.querySelectorAll('.station-check[data-row-id]').forEach((input) => {
      const id = input.getAttribute('data-row-id') || '';
      const on = Boolean(map[id]);
      if (input.checked !== on) input.checked = on;
      input.closest('tr')?.classList.toggle('cutlist-row-done', on);
    });
  }

  function updateQueueItemProgress(batchKey, job) {
    const item = [...listEl.querySelectorAll('.station-queue-row')].find(
      (el) => el.getAttribute('data-batch-key') === batchKey
    );
    if (!item || !job) return;
    const { checked: c, total } = countChecks(job);
    const pct = total ? Math.round((c / total) * 100) : 0;
    const done = total > 0 && c === total;
    item.classList.toggle('is-done', done);
    const bar = item.querySelector('.station-queue-progress');
    const fill = item.querySelector('.station-queue-progress i');
    if (bar && fill) {
      bar.classList.toggle('is-complete', done);
      fill.style.width = `${pct}%`;
    }
    const badge = item.querySelector('.station-queue-done-badge');
    if (done && !badge) {
      const top = item.querySelector('.station-queue-item-top');
      if (top) {
        top.querySelector('.station-queue-item-time')?.remove();
        top.insertAdjacentHTML('beforeend', '<span class="station-queue-done-badge">✓</span>');
      }
    } else if (!done && badge) {
      badge.remove();
    }
  }

  function filters() {
    return {
      query: searchEl.value || '',
      material: materialEl.value || '',
    };
  }

  /**
   * Open a batch from a scanned / typed barcode (exact batch key).
   * @param {string} code
   * @returns {boolean}
   */
  function openBatchFromScan(code) {
    const job = findStationJobByScan(allJobs, code);
    if (!job?.batchKey) {
      if (scanHintEl) {
        scanHintEl.textContent = 'No batch matched that scan';
        scanHintEl.classList.add('is-miss');
        scanHintEl.classList.remove('is-hit');
        setTimeout(() => {
          if (cancelled) return;
          scanHintEl.textContent = 'Scan a batch barcode to open it';
          scanHintEl.classList.remove('is-miss');
        }, 2200);
      }
      return false;
    }
    selectedKey = job.batchKey;
    setStationHash(selectedKey);
    searchEl.value = '';
    searchClearEl.hidden = true;
    materialEl.value = '';
    if (scanHintEl) {
      scanHintEl.textContent = `Opened ${job.batchKey}`;
      scanHintEl.classList.add('is-hit');
      scanHintEl.classList.remove('is-miss');
      setTimeout(() => {
        if (cancelled) return;
        scanHintEl.textContent = 'Scan a batch barcode to open it';
        scanHintEl.classList.remove('is-hit');
      }, 2200);
    }
    renderMaterialOptions(activeJobs());
    renderQueue();
    const item = [...listEl.querySelectorAll('.station-queue-row')].find(
      (el) => el.getAttribute('data-batch-key') === job.batchKey
    );
    item?.scrollIntoView({ block: 'nearest' });
    return true;
  }

  function applyZoom() {
    zoomLabelEl.textContent = `${Math.round(zoom * 100)}%`;
    zoomOutEl.disabled = ZOOM_STEPS.indexOf(zoom) <= 0;
    zoomInEl.disabled = ZOOM_STEPS.indexOf(zoom) >= ZOOM_STEPS.length - 1;
    const sheet = bodyEl.querySelector('.station-live-sheet');
    if (sheet) sheet.style.zoom = String(zoom);
  }

  function stepZoom(direction) {
    const idx = ZOOM_STEPS.indexOf(zoom);
    const next = ZOOM_STEPS[idx + direction];
    if (!next) return;
    zoom = next;
    saveZoom(zoom);
    applyZoom();
  }

  function renderMaterialOptions(jobs) {
    const current = materialEl.value;
    const materials = uniqueStationMaterials(jobs);
    materialEl.innerHTML =
      `<option value="">All materials</option>` +
      materials
        .map(
          (name) =>
            `<option value="${escapeAttr(name)}"${name === current ? ' selected' : ''}>${escapeHTML(name)}</option>`
        )
        .join('');
    if (current && !materials.includes(current)) {
      materialEl.value = '';
    }
  }

  function renderBatchBar(job) {
    if (!job?.html || isStationJobDeleted(job)) {
      batchBarEl.hidden = true;
      printBtnEl.disabled = true;
      clearChecksBtnEl.disabled = true;
      removeBtnEl.disabled = true;
      return;
    }
    batchBarEl.hidden = false;
    printBtnEl.disabled = false;
    clearChecksBtnEl.disabled = false;
    removeBtnEl.disabled = false;
    batchTitleEl.textContent = job.batchKey || '';

    const orderCount = Array.isArray(job.orders) ? job.orders.length : 0;
    const chips = [
      job.isSpecial ? { text: '★ Special', cls: ' station-chip--special' } : null,
      job.materialName ? { text: job.materialName, cls: '' } : null,
      job.totalBoxes ? { text: `${job.totalBoxes} boxes`, cls: '' } : null,
      orderCount ? { text: `${orderCount} order${orderCount === 1 ? '' : 's'}`, cls: '' } : null,
      job.sentAt ? { text: `Sent ${formatSentAt(job.sentAt)}`, cls: ' station-chip--muted' } : null,
    ].filter(Boolean);
    batchChipsEl.innerHTML = chips
      .map((c) => `<span class="station-chip${c.cls}">${escapeHTML(c.text)}</span>`)
      .join('');

    const { checked, total } = countChecks(job);
    if (total > 0) {
      progressEl.hidden = false;
      const pct = Math.round((checked / total) * 100);
      progressFillEl.style.width = `${pct}%`;
      progressEl.classList.toggle('is-complete', checked === total);
      progressLabelEl.textContent =
        checked === total ? `All ${total} done` : `${checked} / ${total}`;
    } else {
      progressEl.hidden = true;
    }
  }

  function renderSelected(job) {
    renderBatchBar(job);
    if (!job?.html) {
      renderedKey = '';
      bodyEl.innerHTML = `
        <div class="station-live-empty">
          ${EMPTY_ICON}
          <p class="station-empty-title">No batch selected</p>
          <p class="station-empty-hint">Pick a batch from the list, or send one with <b>Send to station</b>.</p>
        </div>`;
      return;
    }

    const nextKey = sheetRenderKey(job);
    if (nextKey === renderedKey && bodyEl.querySelector('.station-check')) {
      applyStationChecks(bodyEl, job);
      return;
    }

    renderedKey = nextKey;
    bodyEl.innerHTML = `<div class="station-live-sheet">${job.html}</div>`;
    applyStationChecks(bodyEl, job);
    applyZoom();
  }

  function renderQueueItem(job, { removed = false } = {}) {
    const isActive = !removed && job.batchKey === selectedKey;
    const isChecked = !removed && checkedKeys.has(job.batchKey);
    const { checked, total } = countChecks(job);
    const pct = total ? Math.round((checked / total) * 100) : 0;
    const done = !removed && total > 0 && checked === total;
    const orderCount = Array.isArray(job.orders) ? job.orders.length : 0;
    const materialShort = String(job.materialName || '—')
      .replace(/^PF:\s*/i, '')
      .trim();

    if (removed) {
      return `
        <div class="station-queue-row is-removed" data-batch-key="${escapeAttr(job.batchKey)}">
          <span class="station-queue-check-spacer" aria-hidden="true"></span>
          <div class="station-queue-item station-queue-item--removed">
            <span class="station-queue-item-top">
              <span class="station-queue-item-title">${escapeHTML(job.batchKey)}${job.isSpecial ? ' <span class="station-queue-star">★</span>' : ''}</span>
              <span class="station-queue-removed-badge">Removed</span>
            </span>
            <span class="station-queue-item-bottom">
              <span class="station-queue-item-meta">${escapeHTML(materialShort)} · ${job.totalBoxes || 0} bx${orderCount ? ` · ${orderCount} ord` : ''}</span>
              <button type="button" class="station-queue-restore-btn" data-restore-key="${escapeAttr(job.batchKey)}">Add back</button>
            </span>
          </div>
        </div>`;
    }

    return `
      <div class="station-queue-row${isActive ? ' is-active' : ''}${done ? ' is-done' : ''}${isChecked ? ' is-checked' : ''}" data-batch-key="${escapeAttr(job.batchKey)}">
        <label class="station-queue-check-wrap" title="Select for remove">
          <input
            type="checkbox"
            class="station-queue-check"
            data-batch-key="${escapeAttr(job.batchKey)}"
            ${isChecked ? 'checked' : ''}
            aria-label="Select ${escapeAttr(job.batchKey)}"
          />
        </label>
        <button
          type="button"
          class="station-queue-item"
          role="option"
          aria-selected="${isActive ? 'true' : 'false'}"
          data-batch-key="${escapeAttr(job.batchKey)}"
        >
          <span class="station-queue-item-top">
            <span class="station-queue-item-title">${escapeHTML(job.batchKey)}${job.isSpecial ? ' <span class="station-queue-star">★</span>' : ''}</span>
            ${done ? '<span class="station-queue-done-badge">✓</span>' : `<span class="station-queue-item-time">${escapeHTML(formatRelativeTime(job.sentAt))}</span>`}
          </span>
          <span class="station-queue-item-bottom">
            <span class="station-queue-item-meta">${escapeHTML(materialShort)} · ${job.totalBoxes || 0} bx${orderCount ? ` · ${orderCount} ord` : ''}</span>
            <span class="station-queue-progress${done ? ' is-complete' : ''}"><i style="width:${pct}%"></i></span>
          </span>
        </button>
      </div>`;
  }

  function renderQueue() {
    const active = activeJobs();
    const removed = removedJobs();
    const filteredActive = filterStationJobs(active, filters());
    const filteredRemoved = filterStationJobs(removed, filters());
    const activeKeySet = new Set(active.map((j) => j.batchKey));
    [...checkedKeys].forEach((key) => {
      if (!activeKeySet.has(key)) checkedKeys.delete(key);
    });

    const parts = [];
    if (filteredActive.length || filteredRemoved.length) {
      if (filteredRemoved.length && filteredActive.length) {
        countEl.textContent = `${filteredActive.length} active · ${filteredRemoved.length} removed`;
      } else if (filteredRemoved.length) {
        countEl.textContent = `${filteredRemoved.length} removed`;
      } else {
        countEl.textContent = `${filteredActive.length} of ${active.length} batch${active.length === 1 ? '' : 'es'}`;
      }
    } else if (active.length || removed.length) {
      countEl.textContent = 'No batches match';
    } else {
      countEl.textContent = 'No batches sent yet';
    }

    if (selectedKey && isStationJobDeleted(allJobs.find((j) => j.batchKey === selectedKey))) {
      selectedKey = '';
      renderedKey = '';
      setStationHash('');
    }

    if (!selectedKey && filteredActive.length) {
      selectedKey = filteredActive[0].batchKey;
      setStationHash(selectedKey);
    } else if (selectedKey && !active.some((j) => j.batchKey === selectedKey)) {
      selectedKey = filteredActive[0]?.batchKey || '';
      setStationHash(selectedKey);
    }

    const filteredActiveKeys = filteredActive.map((j) => j.batchKey);

    if (filteredActive.length) {
      parts.push(...filteredActive.map((job) => renderQueueItem(job)));
    }
    if (filteredRemoved.length) {
      if (filteredActive.length) {
        parts.push(`<div class="station-queue-divider">Removed · tap Add back</div>`);
      }
      parts.push(...filteredRemoved.map((job) => renderQueueItem(job, { removed: true })));
    }

    listEl.innerHTML = parts.length
      ? parts.join('')
      : `<div class="station-queue-empty">No matching batches</div>`;

    updateQueueActionButtons(filteredActiveKeys);
    const selected = active.find((j) => j.batchKey === selectedKey) || null;
    renderSelected(selected);
  }

  function onJobs(jobs) {
    if (cancelled) return;
    jobs.forEach((j) => clearPendingIfSynced(j.batchKey, j.checks));
    allJobs = jobs;
    const active = activeJobs();
    setStatus(
      'live',
      active.length
        ? `Live · ${active.length} batch${active.length === 1 ? '' : 'es'}`
        : 'Live · waiting'
    );
    renderMaterialOptions(active);
    renderQueue();
  }

  listEl.addEventListener('click', (e) => {
    const restoreBtn = e.target.closest('[data-restore-key]');
    if (restoreBtn) {
      e.preventDefault();
      const key = restoreBtn.getAttribute('data-restore-key') || '';
      if (key) void restoreBatch(key);
      return;
    }
    if (e.target.closest('.station-queue-check-wrap')) return;
    if (e.target.closest('.station-queue-row.is-removed')) return;
    const btn = e.target.closest('button.station-queue-item');
    if (!btn) return;
    selectedKey = btn.getAttribute('data-batch-key') || '';
    setStationHash(selectedKey);
    renderedKey = '';
    renderQueue();
  });

  listEl.addEventListener('change', (e) => {
    const input = e.target.closest('.station-queue-check');
    if (!input || !(input instanceof HTMLInputElement)) return;
    const key = input.getAttribute('data-batch-key') || '';
    if (!key) return;
    if (input.checked) checkedKeys.add(key);
    else checkedKeys.delete(key);
    const filteredActiveKeys = filterStationJobs(activeJobs(), filters()).map((j) => j.batchKey);
    updateQueueActionButtons(filteredActiveKeys);
    input.closest('.station-queue-row')?.classList.toggle('is-checked', input.checked);
  });

  selectAllEl.addEventListener('change', () => {
    const filteredActiveKeys = filterStationJobs(activeJobs(), filters()).map((j) => j.batchKey);
    if (selectAllEl.checked) {
      filteredActiveKeys.forEach((key) => checkedKeys.add(key));
    } else {
      filteredActiveKeys.forEach((key) => checkedKeys.delete(key));
    }
    renderQueue();
  });

  bodyEl.addEventListener('change', (e) => {
    const input = e.target.closest('.station-check');
    if (!input || !(input instanceof HTMLInputElement)) return;
    const rowId = input.getAttribute('data-row-id') || '';
    const batchKey = selectedKey;
    if (!rowId || !batchKey) return;

    const checked = input.checked;
    input.closest('tr')?.classList.toggle('cutlist-row-done', checked);
    setPending(batchKey, rowId, checked);

    const job = allJobs.find((j) => j.batchKey === batchKey);
    if (job) {
      renderBatchBar(job);
      updateQueueItemProgress(batchKey, job);
    }

    void updateStationJobCheck(batchKey, rowId, checked)
      .then(() => {
        // Keep pending until a snapshot confirms; avoids flicker if another
        // snapshot arrives mid-flight.
      })
      .catch((err) => {
        console.error(err);
        clearPendingRow(batchKey, rowId);
        input.checked = !checked;
        input.closest('tr')?.classList.toggle('cutlist-row-done', !checked);
        if (job) {
          renderBatchBar(job);
          updateQueueItemProgress(batchKey, job);
        }
        setStatus('error', 'Check save failed — try again');
      });
  });

  // Larger tap target: clicking the check cell (not the input) toggles the box.
  bodyEl.addEventListener('click', (e) => {
    if (e.target.closest('.station-check')) return;
    const cell = e.target.closest('td.cutlist-check');
    if (!cell) return;
    const input = cell.querySelector('.station-check');
    if (!input) return;
    e.preventDefault();
    input.checked = !input.checked;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });

  searchEl.addEventListener('input', () => {
    searchClearEl.hidden = !searchEl.value;
    renderQueue();
  });
  searchClearEl.addEventListener('click', () => {
    searchEl.value = '';
    searchClearEl.hidden = true;
    renderQueue();
    searchEl.focus();
  });
  searchEl.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      searchEl.value = '';
      searchClearEl.hidden = true;
      renderQueue();
    }
    if (e.key === 'Enter') {
      const code = searchEl.value.trim();
      if (code && openBatchFromScan(code)) {
        e.preventDefault();
      }
    }
  });

  // USB / Bluetooth wedge scanners type fast then send Enter.
  let scanBuffer = '';
  let scanLastAt = 0;
  const onScanKeydown = (e) => {
    if (cancelled) return;
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;

    // Never steal from real form fields (except station search, handled below).
    if (target.closest('textarea, select')) return;
    if (target instanceof HTMLInputElement && target !== searchEl) return;
    if (target.isContentEditable) return;

    const inSearch = target === searchEl;
    const now = Date.now();
    if (e.key === 'Enter') {
      if (!inSearch && scanBuffer.length >= 3) {
        e.preventDefault();
        e.stopPropagation();
        openBatchFromScan(scanBuffer);
      }
      scanBuffer = '';
      return;
    }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (inSearch) {
        scanBuffer = '';
        return;
      }
      if (now - scanLastAt > 80) scanBuffer = '';
      scanLastAt = now;
      scanBuffer += e.key;
      if (scanBuffer.length > 80) scanBuffer = scanBuffer.slice(-80);
    } else if (e.key === 'Backspace' || e.key === 'Escape') {
      scanBuffer = '';
    }
  };
  document.addEventListener('keydown', onScanKeydown, true);
  materialEl.addEventListener('change', () => renderQueue());
  zoomOutEl.addEventListener('click', () => stepZoom(-1));
  zoomInEl.addEventListener('click', () => stepZoom(1));
  printBtnEl.addEventListener('click', () => printSelectedBatch());
  clearChecksBtnEl.addEventListener('click', () => {
    void clearSelectedChecks();
  });
  clearAllChecksBtnEl.addEventListener('click', () => {
    void clearAllChecks();
  });
  removeBtnEl.addEventListener('click', () => {
    void removeSelectedBatch();
  });
  removeSelectedBtnEl.addEventListener('click', () => {
    void removeCheckedBatches();
  });
  removeAllBtnEl.addEventListener('click', () => {
    void removeAllBatches();
  });
  wipeAllBtnEl.addEventListener('click', () => {
    void wipeAllBatchesFromDatabase();
  });

  void subscribeStationJobs(onJobs, (err) => {
    if (cancelled) return;
    setStatus('error', 'Connection error');
    batchBarEl.hidden = true;
    bodyEl.innerHTML = `
      <div class="station-live-empty station-live-empty--error">
        ${EMPTY_ICON}
        <p class="station-empty-title">Could not connect</p>
        <p class="station-empty-hint">${escapeHTML(err?.message || 'Unknown error')}</p>
      </div>`;
  }).then((stop) => {
    if (cancelled) {
      stop();
      return;
    }
    unsub = stop;
  });

  return () => {
    cancelled = true;
    clearInterval(clockTimer);
    document.removeEventListener('keydown', onScanKeydown, true);
    unsub();
    document.body.classList.remove('station-live');
    root.hidden = true;
    root.innerHTML = '';
  };
}
