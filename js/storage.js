// storage.js — persistence: auto-save to localStorage, and export/import a
// .seatchart file (JSON) via download + file picker.

import { serialize, deserialize, subscribe } from './state.js';

const LS_KEY = 'seatchart:last-session';
const FILE_TYPE = 'seatchart';

// ------------------------------------------------------------ localStorage

let saveTimer = 0;

/** Begin auto-saving state to localStorage (debounced) on every change. */
export function initAutoSave() {
  subscribe(() => {
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(saveToCache, 300);
  });
}

export function saveToCache() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(wrap(serialize())));
  } catch {
    /* storage full or blocked — non-fatal */
  }
}

/** Restore the last session. Returns true if something was loaded. */
export function restoreFromCache() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return false;
    const data = unwrap(JSON.parse(raw));
    return data ? deserialize(data) : false;
  } catch {
    return false;
  }
}

// ------------------------------------------------------------ file I/O

/** Download the current chart as a .seatchart file. */
export function exportFile(name = 'seating-chart') {
  const blob = new Blob([JSON.stringify(wrap(serialize()), null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${sanitize(name)}.seatchart`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Read a File object and load it into state. Returns a Promise<boolean>. */
export function importFile(file) {
  return file.text().then((text) => {
    const data = unwrap(JSON.parse(text));
    if (!data) throw new Error('Not a valid .seatchart file');
    return deserialize(data);
  });
}

// ------------------------------------------------------------ envelope

function wrap(payload) {
  return { type: FILE_TYPE, version: 1, savedAt: new Date().toISOString(), data: payload };
}

function unwrap(obj) {
  if (!obj || typeof obj !== 'object') return null;
  // Accept both the wrapped envelope and a bare serialized state.
  if (obj.type === FILE_TYPE && obj.data) return obj.data;
  if (obj.grid && obj.cells) return obj;
  return null;
}

function sanitize(name) {
  return String(name).trim().replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'seating-chart';
}
