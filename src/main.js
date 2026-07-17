import './styles.css';
import './batchShell.css';
import { mountTopEdgeApp } from './topEdge/app.js';
import {
  initOpticutApp,
  loadOpticutFile,
  mountStation,
  isStationHash,
} from './opticutApp.js';

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
    // Avoid retry loops that re-attach partial listeners.
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
    onFile: (file) => {
      const api = ensureTopEdgeMounted();
      api?.loadFile(file, { replace: true });
      batchState.topEdgeFileName = file.name;
      batchState.topEdgeLoaded = true;
      refreshBatchUi();
      location.hash = '#top-edge';
    },
  });

  wireBatchDrop('opticut', {
    onFile: (file) => {
      ensureOpticutWired();
      loadOpticutFile(file);
      batchState.opticutFileName = file.name;
      batchState.opticutLoaded = true;
      refreshBatchUi();
      location.hash = '#opticut';
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
      api?.loadFile(teFile, { replace: true });
      batchState.topEdgeFileName = teFile.name;
      batchState.topEdgeLoaded = true;

      ensureOpticutWired();
      loadOpticutFile(ocFile);
      batchState.opticutFileName = ocFile.name;
      batchState.opticutLoaded = true;

      if (!$('batch-name-input')?.value) {
        batchState.name = 'Sample batch';
        if ($('batch-name-input')) $('batch-name-input').value = batchState.name;
      }
      refreshBatchUi();
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
  refreshBatchUi();
  routeFromHash();

  // Prefetch mounts so batch-home drops are instant after first paint
  ensureTopEdgeMounted();
  ensureOpticutWired();
}

document.addEventListener('DOMContentLoaded', wireShell);
