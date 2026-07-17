import './styles.css';
import './batchShell.css';
import { mountTopEdgeApp } from './topEdge/app.js';
import {
  initOpticutApp,
  loadOpticutFile,
  mountStation,
  isStationHash,
  getOpticutBatchSummary,
} from './opticutApp.js';
import { compareBatchImports } from './batch/compareBatchImports.js';

const STORAGE_KEY = 'dbs-batch-workbench-v1';

const batchState = {
  name: '',
  topEdgeFileName: '',
  opticutFileName: '',
  topEdgeLoaded: false,
  opticutLoaded: false,
};

/** @type {ReturnType<typeof mountTopEdgeApp> | null} */
let topEdgeApi = null;
let opticutWired = false;

function $(id) {
  return document.getElementById(id);
}

function escapeHTML(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function loadPersistedBatch() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (data?.name) {
      batchState.name = String(data.name);
      const input = $('batch-name-input');
      if (input) input.value = batchState.name;
    }
  } catch {
    /* ignore */
  }
}

function persistBatch() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        name: batchState.name,
        topEdgeFileName: batchState.topEdgeFileName,
        opticutFileName: batchState.opticutFileName,
      })
    );
  } catch {
    /* ignore */
  }
}

function ensureTopEdgeMounted() {
  if (topEdgeApi) return topEdgeApi;
  const root = $('top-edge-root');
  if (!root) return null;
  topEdgeApi = mountTopEdgeApp(root);
  return topEdgeApi;
}

function ensureOpticutWired() {
  if (opticutWired) return;
  try {
    initOpticutApp();
  } catch (err) {
    console.error('Failed to initialize OptiCut tool', err);
  } finally {
    opticutWired = true;
  }
}

function setSlotStatus(slot, { loaded, fileName }) {
  const statusEl = $(`status-${slot}`);
  const fileEl = $(`file-name-${slot}`);
  const checkEl = document.querySelector(`.batch-check[data-check="${slot}"]`);
  const slotEl = $(`slot-${slot}`);

  if (statusEl) {
    statusEl.textContent = loaded ? 'Ready' : 'Waiting';
    statusEl.classList.toggle('is-ready', loaded);
  }
  if (fileEl) fileEl.textContent = loaded && fileName ? fileName : '';
  if (checkEl) {
    checkEl.classList.toggle('is-done', loaded);
    const icon = checkEl.querySelector('.batch-check-icon');
    if (icon) icon.textContent = loaded ? '●' : '○';
  }
  if (slotEl) slotEl.classList.toggle('is-ready', loaded);
}

function collectSummaries() {
  const api = ensureTopEdgeMounted();
  const topEdge = batchState.topEdgeLoaded
    ? {
        ...(api?.getSummary?.() || { loaded: false, orders: [], totalParts: 0, totalBoxes: 0, byOrder: {} }),
        loaded: !!(api?.getSummary?.()?.loaded || batchState.topEdgeLoaded),
        fileName: batchState.topEdgeFileName,
      }
    : { loaded: false, orders: [], totalParts: 0, totalBoxes: 0, byOrder: {} };

  // If Top Edge was marked loaded but summary is empty, keep loaded flag false for compare messaging.
  if (batchState.topEdgeLoaded && topEdge.orders?.length) {
    topEdge.loaded = true;
  }

  const opticut = batchState.opticutLoaded
    ? {
        ...getOpticutBatchSummary(),
        fileName: batchState.opticutFileName,
      }
    : { loaded: false, orders: [], totalParts: 0, totalBoxes: 0, byOrder: {} };

  if (batchState.opticutLoaded && opticut.orders?.length) {
    opticut.loaded = true;
  }

  return { opticut, topEdge };
}

function renderBatchValidation(result) {
  const panel = $('batch-validation');
  const title = $('batch-validation-title');
  const badge = $('batch-validation-badge');
  const totalsEl = $('batch-validation-totals');
  const list = $('batch-validation-list');
  if (!panel || !badge || !totalsEl || !list) return;

  const show = batchState.topEdgeLoaded || batchState.opticutLoaded;
  panel.hidden = !show;
  if (!show) return;

  panel.classList.remove('is-ok', 'is-error', 'is-warning');
  badge.classList.remove('is-ok', 'is-error', 'is-warning', 'is-info');

  let tone = 'info';
  let badgeText = 'Waiting';
  if (result.ready && result.ok && result.errorCount === 0 && result.warningCount === 0) {
    tone = 'ok';
    badgeText = 'Match OK';
  } else if (result.errorCount > 0) {
    tone = 'error';
    badgeText = `${result.errorCount} error${result.errorCount === 1 ? '' : 's'}`;
  } else if (result.warningCount > 0) {
    tone = 'warning';
    badgeText = `${result.warningCount} warning${result.warningCount === 1 ? '' : 's'}`;
  } else if (result.ready) {
    tone = 'ok';
    badgeText = 'Match OK';
  }

  if (tone === 'ok') {
    panel.classList.add('is-ok');
    badge.classList.add('is-ok');
  } else if (tone === 'error') {
    panel.classList.add('is-error');
    badge.classList.add('is-error');
  } else if (tone === 'warning') {
    panel.classList.add('is-warning');
    badge.classList.add('is-warning');
  } else {
    badge.classList.add('is-info');
  }

  badge.textContent = badgeText;
  if (title) title.textContent = 'Batch match check';

  const t = result.totals || {};
  totalsEl.innerHTML = `
    <div><span>Shared orders</span><strong>${t.orderCountShared ?? 0}</strong></div>
    <div><span>OptiCut / Top Edge orders</span><strong>${t.orderCountOpticut ?? 0} / ${t.orderCountTopEdge ?? 0}</strong></div>
    <div><span>Parts (OC / TE)</span><strong>${(t.opticutParts ?? 0).toLocaleString()} / ${(t.topEdgeParts ?? 0).toLocaleString()}</strong></div>
    <div><span>Boxes (OC / TE)</span><strong>${(t.opticutBoxes ?? 0).toLocaleString()} / ${(t.topEdgeBoxes ?? 0).toLocaleString()}</strong></div>
  `;

  list.innerHTML = (result.issues || [])
    .map(
      (issue) =>
        `<li data-severity="${escapeHTML(issue.severity)}">${escapeHTML(issue.message)}</li>`
    )
    .join('');
}

function runBatchValidation() {
  // Sync loaded flags from live tool state when possible.
  const api = ensureTopEdgeMounted();
  const teSummary = api?.getSummary?.();
  if (teSummary?.loaded) {
    batchState.topEdgeLoaded = true;
  }
  const ocSummary = getOpticutBatchSummary();
  if (ocSummary?.loaded) {
    batchState.opticutLoaded = true;
  }

  const { opticut, topEdge } = collectSummaries();
  const result = compareBatchImports(opticut, topEdge);
  renderBatchValidation(result);
  refreshBatchUi();
  return result;
}

function refreshBatchUi() {
  setSlotStatus('top-edge', {
    loaded: batchState.topEdgeLoaded,
    fileName: batchState.topEdgeFileName,
  });
  setSlotStatus('opticut', {
    loaded: batchState.opticutLoaded,
    fileName: batchState.opticutFileName,
  });
  persistBatch();
}

function routeFromHash() {
  const hash = (location.hash || '#batch').replace(/^#/, '').toLowerCase();
  if (hash === 'station' || isStationHash()) {
    showView('station');
    return;
  }
  if (hash === 'top-edge' || hash === 'topedge') {
    showView('top-edge');
    return;
  }
  if (hash === 'opticut' || hash === 'opti-cut') {
    showView('opticut');
    return;
  }
  showView('batch');
}

function showView(view) {
  const chrome = $('batch-chrome');
  const views = {
    batch: $('view-batch'),
    'top-edge': $('view-topedge'),
    opticut: $('view-opticut'),
  };
  const stationRoot = $('station-root');

  Object.entries(views).forEach(([key, el]) => {
    if (!el) return;
    el.hidden = key !== view;
  });

  if (chrome) chrome.hidden = view === 'station';

  if (stationRoot) {
    if (view === 'station') {
      stationRoot.hidden = false;
      mountStation();
    } else {
      stationRoot.hidden = true;
      const shell = document.querySelector('#view-opticut .app-shell');
      if (shell) shell.hidden = false;
    }
  }

  document.body.dataset.view = view;
  document.body.classList.toggle('view-topedge', view === 'top-edge');
  document.body.classList.toggle('view-opticut', view === 'opticut');
  document.body.classList.toggle('view-batch', view === 'batch');
  document.body.classList.toggle('view-station', view === 'station');

  document.querySelectorAll('.batch-nav-link').forEach((link) => {
    link.classList.toggle('is-active', link.dataset.route === view);
  });

  if (view === 'top-edge') ensureTopEdgeMounted();
  if (view === 'opticut') ensureOpticutWired();
  if (view === 'batch') runBatchValidation();
}

function wireBatchDrop(slot, { onFile }) {
  const drop = $(`batch-drop-${slot}`);
  const input = $(`batch-file-${slot}`);
  if (!drop || !input) return;

  const takeFile = (file) => {
    if (!file) return;
    if (!String(file.name).toLowerCase().endsWith('.csv')) {
      alert('Please choose a .csv file.');
      return;
    }
    onFile(file);
  };

  drop.addEventListener('click', () => input.click());
  drop.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      input.click();
    }
  });
  input.addEventListener('change', () => {
    takeFile(input.files?.[0]);
    input.value = '';
  });
  drop.addEventListener('dragover', (e) => {
    e.preventDefault();
    drop.classList.add('is-dragover');
  });
  drop.addEventListener('dragleave', () => drop.classList.remove('is-dragover'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('is-dragover');
    takeFile(e.dataTransfer?.files?.[0]);
  });
}

function wireShell() {
  loadPersistedBatch();

  $('batch-name-input')?.addEventListener('input', (e) => {
    batchState.name = e.target.value.trim();
    persistBatch();
  });

  wireBatchDrop('top-edge', {
    onFile: async (file) => {
      const api = ensureTopEdgeMounted();
      await api?.loadFile(file, { replace: true });
      batchState.topEdgeFileName = file.name;
      batchState.topEdgeLoaded = true;
      runBatchValidation();
      location.hash = '#batch';
    },
  });

  wireBatchDrop('opticut', {
    onFile: async (file) => {
      ensureOpticutWired();
      await loadOpticutFile(file);
      batchState.opticutFileName = file.name;
      batchState.opticutLoaded = true;
      runBatchValidation();
      location.hash = '#batch';
    },
  });

  $('btn-load-sample-batch')?.addEventListener('click', async () => {
    const btn = $('btn-load-sample-batch');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Loading sample…';
    }
    try {
      const [teRes, ocRes] = await Promise.all([
        fetch('./samples/Top%20Edge%20Report.csv'),
        fetch('./samples/OPTICUT.csv'),
      ]);
      if (!teRes.ok || !ocRes.ok) {
        throw new Error('Could not fetch sample CSV files.');
      }
      const [teText, ocText] = await Promise.all([teRes.text(), ocRes.text()]);
      const teFile = new File([teText], 'Top Edge Report.csv', { type: 'text/csv' });
      const ocFile = new File([ocText], 'OPTICUT.csv', { type: 'text/csv' });

      const api = ensureTopEdgeMounted();
      await api?.loadFile(teFile, { replace: true });
      batchState.topEdgeFileName = teFile.name;
      batchState.topEdgeLoaded = true;

      ensureOpticutWired();
      await loadOpticutFile(ocFile);
      batchState.opticutFileName = ocFile.name;
      batchState.opticutLoaded = true;

      if (!$('batch-name-input')?.value) {
        batchState.name = 'Sample batch';
        if ($('batch-name-input')) $('batch-name-input').value = batchState.name;
      }
      runBatchValidation();
      location.hash = '#batch';
    } catch (err) {
      console.error(err);
      alert('Could not load sample batch files. Check that public/samples CSVs are present.');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Load sample batch';
      }
    }
  });

  window.addEventListener('hashchange', routeFromHash);
  window.addEventListener('dbs-batch-data-changed', () => {
    runBatchValidation();
  });

  refreshBatchUi();
  routeFromHash();

  ensureTopEdgeMounted();
  ensureOpticutWired();
  runBatchValidation();
}

document.addEventListener('DOMContentLoaded', wireShell);
