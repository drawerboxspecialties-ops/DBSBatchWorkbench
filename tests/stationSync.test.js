import { describe, expect, it } from 'vitest';
import {
  isStationHash,
  stationHashBatchKey,
  stationJobId,
  filterStationJobs,
  uniqueStationMaterials,
  retainActiveStationJobs,
  stationJobExpiryCutoff,
  normalizeStationChecks,
  mergeStationChecks,
  isStationJobDeleted,
  findStationJobByScan,
  dedupeStationJobs,
  duplicateStationJobIds,
  STATION_JOB_RETENTION_MS,
  verifyStationWipePassword,
  STATION_WIPE_PASSWORD,
} from '../src/logic/stationSync.js';

describe('isStationHash', () => {
  it('detects station mode hashes', () => {
    expect(isStationHash('#station')).toBe(true);
    expect(isStationHash('#station/')).toBe(true);
    expect(isStationHash('#station/foo')).toBe(true);
    expect(isStationHash('')).toBe(false);
    expect(isStationHash('#print')).toBe(false);
  });
});

describe('stationHashBatchKey', () => {
  it('reads selected batch from hash', () => {
    expect(stationHashBatchKey('#station')).toBe('');
    expect(stationHashBatchKey('#station/FAA_CFB_602648')).toBe('FAA_CFB_602648');
    expect(stationHashBatchKey('#station/' + encodeURIComponent('A/B'))).toBe('A/B');
  });
});

describe('stationJobId', () => {
  it('sanitizes batch keys for Firestore ids', () => {
    expect(stationJobId('FAA_CFB_602648')).toBe('FAA_CFB_602648');
    expect(stationJobId('A/B#C')).toBe('A_B_C');
  });
});

describe('14-day retention', () => {
  it('uses a 14-day window', () => {
    expect(STATION_JOB_RETENTION_MS).toBe(14 * 24 * 60 * 60 * 1000);
  });

  it('keeps recent jobs and drops older than 14 days', () => {
    const now = Date.UTC(2026, 6, 10);
    const jobs = [
      { batchKey: 'new', sentAt: now - 1000 },
      { batchKey: 'edge', sentAt: stationJobExpiryCutoff(now) },
      { batchKey: 'old', sentAt: stationJobExpiryCutoff(now) - 1 },
    ];
    expect(retainActiveStationJobs(jobs, now).map((j) => j.batchKey)).toEqual(['new', 'edge']);
  });
});

describe('normalizeStationChecks', () => {
  it('keeps boolean row ids and drops nested dotted-path junk', () => {
    expect(
      normalizeStationChecks({
        '602614|1|12|15.875|20.626': true,
        '602614|1|12|15': { '875|20': { 626: true } },
        junk: false,
      })
    ).toEqual({
      '602614|1|12|15.875|20.626': true,
    });
  });
});

describe('mergeStationChecks', () => {
  it('keeps pending toggles over stale server state', () => {
    expect(
      mergeStationChecks({ 'a|1|1|1|1': true }, { 'a|1|1|1|1': false, 'b|2|2|2.5|2': true })
    ).toEqual({ 'b|2|2|2.5|2': true });
  });
});

describe('isStationJobDeleted', () => {
  it('treats deletedAt as removed', () => {
    expect(isStationJobDeleted({ deletedAt: 123 })).toBe(true);
    expect(isStationJobDeleted({ deletedAt: null })).toBe(false);
    expect(isStationJobDeleted({})).toBe(false);
  });
});

describe('filterStationJobs', () => {
  const jobs = [
    {
      batchKey: 'FAA_CFB_602648',
      materialName: 'FAA: 3/4" Maple',
      orders: ['602648'],
    },
    {
      batchKey: 'SLD_CFB_602629',
      materialName: 'PF: 1/2" Maple White',
      orders: ['602629'],
    },
    {
      batchKey: 'SPECIAL_PLY_CFB_602627',
      materialName: 'PF: 12MM Baltic Birch Ply',
      orders: ['602627', '602637', '602649'],
    },
  ];

  it('filters by batch key substring', () => {
    expect(filterStationJobs(jobs, { query: '602648' }).map((j) => j.batchKey)).toEqual([
      'FAA_CFB_602648',
    ]);
    expect(filterStationJobs(jobs, { query: 'SPECIAL' })).toHaveLength(1);
  });

  it('filters by order number', () => {
    expect(filterStationJobs(jobs, { query: '602637' }).map((j) => j.batchKey)).toEqual([
      'SPECIAL_PLY_CFB_602627',
    ]);
  });

  it('filters by material dropdown value', () => {
    expect(
      filterStationJobs(jobs, { material: 'PF: 1/2" Maple White' }).map((j) => j.batchKey)
    ).toEqual(['SLD_CFB_602629']);
  });

  it('combines search and material', () => {
    expect(
      filterStationJobs(jobs, {
        query: '602',
        material: 'PF: 12MM Baltic Birch Ply',
      }).map((j) => j.batchKey)
    ).toEqual(['SPECIAL_PLY_CFB_602627']);
  });
});

describe('uniqueStationMaterials', () => {
  it('returns sorted unique materials', () => {
    expect(
      uniqueStationMaterials([
        { materialName: 'B' },
        { materialName: 'A' },
        { materialName: 'B' },
        { materialName: '' },
      ])
    ).toEqual(['A', 'B']);
  });
});

describe('findStationJobByScan', () => {
  const jobs = [
    { batchKey: 'PLY_PVC_602480', deletedAt: null },
    { batchKey: 'PLY_CFB_602470', deletedAt: null },
    { batchKey: 'OLD_BATCH', deletedAt: Date.now() },
  ];

  it('matches exact batch keys case-insensitively', () => {
    expect(findStationJobByScan(jobs, 'ply_pvc_602480')?.batchKey).toBe('PLY_PVC_602480');
  });

  it('ignores removed batches', () => {
    expect(findStationJobByScan(jobs, 'OLD_BATCH')).toBeNull();
  });

  it('requires a full batch key (no prefix match)', () => {
    expect(findStationJobByScan(jobs, 'PLY_PVC')).toBeNull();
  });
});

describe('dedupeStationJobs', () => {
  it('keeps one job per batch key (case-insensitive), preferring newest', () => {
    const jobs = [
      { id: 'a', batchKey: 'PLY_PVC_1', sentAt: 100 },
      { id: 'b', batchKey: 'ply_pvc_1', sentAt: 200 },
      { id: 'c', batchKey: 'PLY_CFB_2', sentAt: 150 },
    ];
    const deduped = dedupeStationJobs(jobs);
    expect(deduped.map((j) => j.id).sort()).toEqual(['b', 'c']);
    expect(duplicateStationJobIds(jobs)).toEqual(['a']);
  });

  it('prefers an active job over a soft-deleted duplicate', () => {
    const jobs = [
      { id: 'old', batchKey: 'PLY_PVC_1', sentAt: 300, deletedAt: 400 },
      { id: 'live', batchKey: 'PLY_PVC_1', sentAt: 200, deletedAt: null },
    ];
    expect(dedupeStationJobs(jobs).map((j) => j.id)).toEqual(['live']);
  });
});

describe('verifyStationWipePassword', () => {
  it('accepts only the station wipe password', () => {
    expect(STATION_WIPE_PASSWORD).toBe('dbs');
    expect(verifyStationWipePassword('dbs')).toBe(true);
    expect(verifyStationWipePassword('DBS')).toBe(false);
    expect(verifyStationWipePassword('')).toBe(false);
    expect(verifyStationWipePassword('wrong')).toBe(false);
  });
});
