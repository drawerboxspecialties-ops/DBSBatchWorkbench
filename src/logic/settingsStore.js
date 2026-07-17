const STORAGE_KEY = 'opticut-export-app-settings';

export const DEFAULT_SETTINGS = {
  maxOrdersPerBatch: 999,
  recentFiles: [],
};

export function loadSettings(storage = globalThis.localStorage) {
  if (!storage) return { ...DEFAULT_SETTINGS };

  try {
    const saved = JSON.parse(storage.getItem(STORAGE_KEY) || '{}');
    return {
      ...DEFAULT_SETTINGS,
      ...saved,
      recentFiles: Array.isArray(saved.recentFiles) ? saved.recentFiles : [],
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings, storage = globalThis.localStorage) {
  if (!storage) return;
  storage.setItem(STORAGE_KEY, JSON.stringify({ ...DEFAULT_SETTINGS, ...settings }));
}

export function clearStoredSettings(storage = globalThis.localStorage) {
  if (!storage) return;
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    // ignore private mode / quota errors
  }
}

export function rememberFile(fileName, settings = loadSettings()) {
  const recentFiles = [fileName, ...settings.recentFiles.filter((name) => name !== fileName)].slice(
    0,
    10
  );
  return { ...settings, recentFiles };
}
