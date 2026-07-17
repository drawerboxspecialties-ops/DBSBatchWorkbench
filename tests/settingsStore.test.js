import { describe, expect, it } from 'vitest';
import { loadSettings, saveSettings, rememberFile, DEFAULT_SETTINGS, clearStoredSettings } from '../src/logic/settingsStore.js';

function makeStorage() {
  const store = {};
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => {
      store[k] = String(v);
    },
    removeItem: (k) => {
      delete store[k];
    },
  };
}

describe('settings store', () => {
  it('returns defaults when storage is empty', () => {
    const s = loadSettings(makeStorage());
    expect(s).toEqual(DEFAULT_SETTINGS);
    expect(s.recentFiles).toEqual([]);
  });

  it('returns defaults when storage is null', () => {
    expect(loadSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  it('returns defaults on corrupted JSON', () => {
    const storage = makeStorage();
    storage.setItem('opticut-export-app-settings', '{not json');
    expect(loadSettings(storage)).toEqual(DEFAULT_SETTINGS);
  });

  it('round-trips settings through save/load', () => {
    const storage = makeStorage();
    saveSettings({ maxOrdersPerBatch: 50, recentFiles: ['a.csv'] }, storage);
    expect(loadSettings(storage)).toEqual({ maxOrdersPerBatch: 50, recentFiles: ['a.csv'] });
  });

  it('remembers a file and dedupes + caps to 10', () => {
    const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
    let s = { ...DEFAULT_SETTINGS, recentFiles: files };
    s = rememberFile('a', s);
    expect(s.recentFiles[0]).toBe('a');
    expect(s.recentFiles.length).toBe(10);
    s = rememberFile('k', s);
    expect(s.recentFiles[0]).toBe('k');
    expect(s.recentFiles.length).toBe(10);
  });

  it('clearStoredSettings removes persisted settings', () => {
    const storage = makeStorage();
    saveSettings({ maxOrdersPerBatch: 50, recentFiles: ['a.csv'] }, storage);
    clearStoredSettings(storage);
    expect(storage.getItem('opticut-export-app-settings')).toBeNull();
    expect(loadSettings(storage)).toEqual(DEFAULT_SETTINGS);
  });
});
