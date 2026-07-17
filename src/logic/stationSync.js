import { firebaseConfig, STATION_JOBS_COLLECTION } from './firebaseConfig.js';

/** Keep station jobs for 14 days, then delete automatically. */
export const STATION_JOB_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;

/** Password required to permanently wipe every station batch. */
export const STATION_WIPE_PASSWORD = 'dbs';

/** @param {string} password */
export function verifyStationWipePassword(password) {
  return String(password ?? '') === STATION_WIPE_PASSWORD;
}

let dbPromise = null;
let purgeInFlight = null;

async function getDb() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const { initializeApp, getApps } = await import('firebase/app');
      const { getFirestore } = await import('firebase/firestore');
      const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
      return getFirestore(app);
    })();
  }
  return dbPromise;
}

/** Safe Firestore document id from a batch key. */
export function stationJobId(batchKey) {
  return String(batchKey || '')
    .trim()
    .replace(/[/#[\]]/g, '_')
    .slice(0, 700);
}

/** Cutoff timestamp: jobs with sentAt older than this are expired. */
export function stationJobExpiryCutoff(now = Date.now()) {
  return now - STATION_JOB_RETENTION_MS;
}

/** True if a job is still within the 14-day retention window. */
export function isStationJobActive(job, now = Date.now()) {
  const sentAt = Number(job?.sentAt) || 0;
  return sentAt >= stationJobExpiryCutoff(now);
}

/** Drop expired jobs from an in-memory list. */
export function retainActiveStationJobs(jobs, now = Date.now()) {
  return (Array.isArray(jobs) ? jobs : []).filter((job) => isStationJobActive(job, now));
}

/** Normalize batch key for duplicate detection. */
export function normalizeStationBatchKey(batchKey) {
  return String(batchKey || '')
    .trim()
    .toLowerCase();
}

/**
 * Keep one job per batch key (case-insensitive).
 * Prefers active over soft-deleted, then newest sentAt.
 * @param {object[]} jobs
 * @returns {object[]}
 */
export function dedupeStationJobs(jobs) {
  const list = Array.isArray(jobs) ? jobs : [];
  /** @type {Map<string, object>} */
  const best = new Map();

  list.forEach((job) => {
    const key = normalizeStationBatchKey(job?.batchKey);
    if (!key) return;
    const prev = best.get(key);
    if (!prev) {
      best.set(key, job);
      return;
    }
    const prevDeleted = isStationJobDeleted(prev);
    const jobDeleted = isStationJobDeleted(job);
    if (prevDeleted !== jobDeleted) {
      if (!jobDeleted) best.set(key, job);
      return;
    }
    const prevSent = Number(prev.sentAt) || 0;
    const jobSent = Number(job.sentAt) || 0;
    if (jobSent > prevSent) {
      best.set(key, job);
      return;
    }
    if (jobSent === prevSent && String(job.id || '') > String(prev.id || '')) {
      best.set(key, job);
    }
  });

  return [...best.values()].sort((a, b) => (Number(b.sentAt) || 0) - (Number(a.sentAt) || 0));
}

/**
 * Document ids that lose dedupe (safe to delete from Firestore).
 * @param {object[]} jobs
 * @returns {string[]}
 */
export function duplicateStationJobIds(jobs) {
  const list = Array.isArray(jobs) ? jobs : [];
  const winners = new Set(
    dedupeStationJobs(list)
      .map((j) => j.id)
      .filter(Boolean)
  );
  return [...new Set(list.map((j) => j?.id).filter((id) => id && !winners.has(id)))];
}

/**
 * Delete station jobs older than 14 days.
 * Safe to call often; concurrent calls share one in-flight purge.
 * @returns {Promise<number>} number of docs deleted
 */
export async function purgeExpiredStationJobs(now = Date.now()) {
  if (purgeInFlight) return purgeInFlight;

  purgeInFlight = (async () => {
    const cutoff = stationJobExpiryCutoff(now);
    const { collection, query, where, getDocs, writeBatch, limit } =
      await import('firebase/firestore');
    const db = await getDb();
    let deleted = 0;

    // Chunked deletes (Firestore batch max 500).
    for (;;) {
      const snap = await getDocs(
        query(collection(db, STATION_JOBS_COLLECTION), where('sentAt', '<', cutoff), limit(400))
      );
      if (snap.empty) break;

      const batch = writeBatch(db);
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      deleted += snap.size;
      if (snap.size < 400) break;
    }

    return deleted;
  })().finally(() => {
    purgeInFlight = null;
  });

  return purgeInFlight;
}

function scheduleStationPurge() {
  void purgeExpiredStationJobs().catch((err) => {
    console.warn('Station job purge failed:', err);
  });
}

let dedupeCleanupInFlight = null;

/**
 * Delete Firestore docs that duplicate another job's batch key.
 * @param {object[]} jobs
 * @returns {Promise<number>}
 */
export async function cleanupDuplicateStationJobs(jobs) {
  const loserIds = duplicateStationJobIds(jobs);
  if (!loserIds.length) return 0;
  if (dedupeCleanupInFlight) return dedupeCleanupInFlight;

  dedupeCleanupInFlight = (async () => {
    const { doc, writeBatch } = await import('firebase/firestore');
    const db = await getDb();
    let deleted = 0;
    for (let i = 0; i < loserIds.length; i += 400) {
      const chunk = loserIds.slice(i, i + 400);
      const batch = writeBatch(db);
      chunk.forEach((id) => batch.delete(doc(db, STATION_JOBS_COLLECTION, id)));
      await batch.commit();
      deleted += chunk.length;
    }
    return deleted;
  })().finally(() => {
    dedupeCleanupInFlight = null;
  });

  return dedupeCleanupInFlight;
}

function scheduleDuplicateCleanup(jobs) {
  void cleanupDuplicateStationJobs(jobs).catch((err) => {
    console.warn('Station duplicate cleanup failed:', err);
  });
}

/**
 * Filter station jobs by free-text (batch key / order #) and material.
 * @param {object[]} jobs
 * @param {{ query?: string, material?: string }} [filters]
 */
export function filterStationJobs(jobs, filters = {}) {
  const list = Array.isArray(jobs) ? jobs : [];
  const q = String(filters.query || '')
    .trim()
    .toLowerCase();
  const mat = String(filters.material || '')
    .trim()
    .toLowerCase();

  return list.filter((job) => {
    if (mat) {
      const jobMat = String(job.materialName || '')
        .trim()
        .toLowerCase();
      if (jobMat !== mat) return false;
    }
    if (!q) return true;
    const key = String(job.batchKey || '').toLowerCase();
    if (key.includes(q)) return true;
    const orders = Array.isArray(job.orders) ? job.orders : [];
    return orders.some((order) => String(order).toLowerCase().includes(q));
  });
}

/** Unique material names from jobs, sorted. */
export function uniqueStationMaterials(jobs) {
  const set = new Set();
  (Array.isArray(jobs) ? jobs : []).forEach((job) => {
    const name = String(job.materialName || '').trim();
    if (name) set.add(name);
  });
  return [...set].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

/**
 * Push / update a batch cut list in the station queue.
 * Re-sending the same batchKey replaces that job.
 * @param {{
 *   batchKey: string,
 *   fileName?: string,
 *   materialName?: string,
 *   totalBoxes?: number,
 *   orders?: string[],
 *   isSpecial?: boolean,
 *   html: string,
 * }} job
 * @param {{ skipPurge?: boolean }} [options]
 */
export async function publishStationJob(job, options = {}) {
  if (!job?.batchKey || !job?.html) {
    throw new Error('Missing batch cut list to send.');
  }

  const id = stationJobId(job.batchKey);
  if (!id) throw new Error('Invalid batch key.');

  const { doc, setDoc } = await import('firebase/firestore');
  const orders = (Array.isArray(job.orders) ? job.orders : [])
    .map((o) => String(o).trim())
    .filter(Boolean);

  const batchKey = String(job.batchKey).trim();
  const payload = {
    id,
    batchKey,
    fileName: String(job.fileName || ''),
    materialName: String(job.materialName || ''),
    totalBoxes: Number(job.totalBoxes) || 0,
    orders,
    isSpecial: Boolean(job.isSpecial),
    html: String(job.html),
    sentAt: Date.now(),
  };

  // merge: true keeps existing checkbox state when the same batch is re-sent.
  // Clear deletedAt so a re-send brings a removed batch back.
  await setDoc(
    doc(await getDb(), STATION_JOBS_COLLECTION, id),
    { ...payload, deletedAt: null },
    { merge: true }
  );
  if (!options.skipPurge) scheduleStationPurge();
  return payload;
}

/**
 * Permanently delete every station job document (active and soft-removed).
 * @returns {Promise<number>} number of docs deleted
 */
export async function wipeAllStationJobs() {
  const { collection, getDocs, writeBatch, limit, query } = await import('firebase/firestore');
  const db = await getDb();
  let deleted = 0;

  for (;;) {
    const snap = await getDocs(query(collection(db, STATION_JOBS_COLLECTION), limit(400)));
    if (snap.empty) break;

    const batch = writeBatch(db);
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    deleted += snap.size;
    if (snap.size < 400) break;
  }

  return deleted;
}

/**
 * Soft-remove a batch from the active station queue (can restore later).
 * @param {string} batchKey
 */
export async function softDeleteStationJob(batchKey) {
  const id = stationJobId(batchKey);
  if (!id) throw new Error('Invalid batch key.');
  const { doc, updateDoc } = await import('firebase/firestore');
  await updateDoc(doc(await getDb(), STATION_JOBS_COLLECTION, id), {
    deletedAt: Date.now(),
  });
}

/**
 * Soft-remove several station batches.
 * @param {string[]} batchKeys
 */
export async function softDeleteStationJobs(batchKeys) {
  const keys = [
    ...new Set(
      (Array.isArray(batchKeys) ? batchKeys : []).map((k) => String(k || '').trim()).filter(Boolean)
    ),
  ];
  if (!keys.length) return;
  await Promise.all(keys.map((key) => softDeleteStationJob(key)));
}

/**
 * Restore a soft-removed station batch.
 * @param {string} batchKey
 */
export async function restoreStationJob(batchKey) {
  const id = stationJobId(batchKey);
  if (!id) throw new Error('Invalid batch key.');
  const { doc, updateDoc, deleteField } = await import('firebase/firestore');
  await updateDoc(doc(await getDb(), STATION_JOBS_COLLECTION, id), {
    deletedAt: deleteField(),
  });
}

/**
 * Clear all saved checkboxes for a batch (persisted).
 * @param {string} batchKey
 */
export async function clearStationJobChecks(batchKey) {
  const id = stationJobId(batchKey);
  if (!id) throw new Error('Invalid batch key.');
  const { doc, updateDoc } = await import('firebase/firestore');
  await updateDoc(doc(await getDb(), STATION_JOBS_COLLECTION, id), { checks: {} });
}

/**
 * Clear checkboxes for several station batches.
 * @param {string[]} batchKeys
 */
export async function clearStationJobsChecks(batchKeys) {
  const keys = [
    ...new Set(
      (Array.isArray(batchKeys) ? batchKeys : []).map((k) => String(k || '').trim()).filter(Boolean)
    ),
  ];
  if (!keys.length) return;
  await Promise.all(keys.map((key) => clearStationJobChecks(key)));
}

/** True when a job is soft-removed from the active queue. */
export function isStationJobDeleted(job) {
  return Boolean(job?.deletedAt);
}

/**
 * Resolve a scanned barcode / typed code to a station job.
 * Exact batchKey match only (case-insensitive) among active jobs.
 * @param {object[]} jobs
 * @param {string} code
 * @returns {object | null}
 */
export function findStationJobByScan(jobs, code) {
  const needle = String(code || '')
    .trim()
    .replace(/[\r\n]+$/g, '');
  if (!needle) return null;
  const lower = needle.toLowerCase();
  return (
    (Array.isArray(jobs) ? jobs : []).find(
      (j) => !isStationJobDeleted(j) && String(j.batchKey || '').toLowerCase() === lower
    ) || null
  );
}

/**
 * Keep only real checkbox keys (boolean true). Drops nested junk left by older
 * dotted-path writes that split decimal lengths like "15.875".
 * @param {unknown} checks
 * @returns {Record<string, true>}
 */
export function normalizeStationChecks(checks) {
  if (!checks || typeof checks !== 'object' || Array.isArray(checks)) return {};
  const out = {};
  Object.entries(checks).forEach(([key, value]) => {
    if (value === true && String(key).includes('|')) out[String(key)] = true;
  });
  return out;
}

/**
 * Merge server checks with in-flight local toggles so the UI does not snap back
 * when a snapshot arrives before the write is visible.
 * @param {unknown} serverChecks
 * @param {Record<string, boolean>|null|undefined} pending rowId → wanted checked
 */
export function mergeStationChecks(serverChecks, pending) {
  const out = normalizeStationChecks(serverChecks);
  if (!pending || typeof pending !== 'object') return out;
  Object.entries(pending).forEach(([rowId, want]) => {
    if (!rowId) return;
    if (want) out[rowId] = true;
    else delete out[rowId];
  });
  return out;
}

/** @type {Map<string, Promise<unknown>>} */
const checkWriteChains = new Map();

/**
 * Toggle a station cut-list line checkbox (synced live via Firestore).
 * Serializes writes per batch and replaces the whole `checks` map so:
 * - keys with "." (decimal lengths) stay literal
 * - rapid toggles cannot overwrite each other
 * - old nested dotted-path junk is cleaned on write
 * @param {string} batchKey
 * @param {string} rowId
 * @param {boolean} checked
 */
export async function updateStationJobCheck(batchKey, rowId, checked) {
  const id = stationJobId(batchKey);
  const key = String(rowId || '').trim();
  if (!id || !key) throw new Error('Missing batch or row id.');

  const prev = checkWriteChains.get(id) || Promise.resolve();
  const next = prev
    .catch(() => {})
    .then(async () => {
      const { doc, getDoc, updateDoc } = await import('firebase/firestore');
      const ref = doc(await getDb(), STATION_JOBS_COLLECTION, id);
      const snap = await getDoc(ref);
      if (!snap.exists()) throw new Error('Batch not found on station.');
      const checks = normalizeStationChecks(snap.data()?.checks);
      if (checked) checks[key] = true;
      else delete checks[key];
      await updateDoc(ref, { checks });
    });

  checkWriteChains.set(id, next);
  try {
    await next;
  } finally {
    if (checkWriteChains.get(id) === next) checkWriteChains.delete(id);
  }
}

/**
 * Subscribe to all station jobs (newest first).
 * Expired jobs (>14 days) are hidden and deleted in the background.
 * @param {(jobs: object[]) => void} onJobs
 * @param {(err: Error) => void} [onError]
 * @returns {Promise<() => void>} unsubscribe
 */
export async function subscribeStationJobs(onJobs, onError) {
  scheduleStationPurge();
  const { collection, onSnapshot, orderBy, query } = await import('firebase/firestore');
  const q = query(collection(await getDb(), STATION_JOBS_COLLECTION), orderBy('sentAt', 'desc'));
  return onSnapshot(
    q,
    (snap) => {
      const jobs = snap.docs.map((d) => {
        const data = d.data() || {};
        return {
          id: d.id,
          ...data,
          batchKey: String(data.batchKey || d.id || '').trim(),
          checks: normalizeStationChecks(data.checks),
        };
      });
      const active = retainActiveStationJobs(jobs);
      if (duplicateStationJobIds(active).length) {
        scheduleDuplicateCleanup(active);
      }
      onJobs(dedupeStationJobs(active));
    },
    (err) => {
      if (typeof onError === 'function') onError(err);
    }
  );
}

export function isStationHash(hash = globalThis.location?.hash || '') {
  return hash === '#station' || hash.startsWith('#station/');
}

/** Selected batch key from `#station` or `#station/BATCH_KEY`. */
export function stationHashBatchKey(hash = globalThis.location?.hash || '') {
  if (!isStationHash(hash)) return '';
  const raw = hash.replace(/^#station\/?/, '');
  return raw ? decodeURIComponent(raw) : '';
}
