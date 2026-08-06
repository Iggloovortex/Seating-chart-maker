// storage.js — persistence: auto-save to localStorage, and export/import a
// .seatchart file (JSON) via download + file picker.


const LS_KEY = 'seatchart:last-session';
const FILE_TYPE = 'seatchart';

// ------------------------------------------------------------ localStorage

let saveTimer = 0;

/** Begin auto-saving state to localStorage (debounced) on every change. */
function initAutoSave() {
  subscribe(() => {
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(saveToCache, 300);
  });
}

function saveToCache() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(wrap(serialize())));
  } catch {
    /* storage full or blocked — non-fatal */
  }
}

/** Restore the last session. Returns true if something was loaded. */
function restoreFromCache() {
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
function exportFile(name = 'seating-chart') {
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
function importFile(file) {
  return file.text().then((text) => {
    const data = unwrap(JSON.parse(text));
    if (!data) throw new Error('Not a valid .seatchart file');
    return deserialize(data);
  });
}

// ------------------------------------------------------------ share link

// The whole config travels in the URL fragment, which is never sent to a
// server and works over file:// too. Compressed when the browser supports it,
// with a one-character tag saying which encoding was used.
const HASH_KEY = 'chart';

function bytesToB64url(bytes) {
  let bin = '';
  for (const byte of bytes) bin += String.fromCharCode(byte);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlToBytes(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deflateBytes(text) {
  const cs = new CompressionStream('deflate-raw');
  const w = cs.writable.getWriter();
  w.write(new TextEncoder().encode(text));
  w.close();
  return new Uint8Array(await new Response(cs.readable).arrayBuffer());
}

async function inflateText(bytes) {
  const ds = new DecompressionStream('deflate-raw');
  const w = ds.writable.getWriter();
  w.write(bytes);
  w.close();
  return new TextDecoder().decode(await new Response(ds.readable).arrayBuffer());
}

/** Encode a payload for the URL: 'z' = deflated, 'j' = plain JSON bytes. */
async function encodeConfig(payload) {
  const json = JSON.stringify(payload);
  if (typeof CompressionStream === 'function') {
    try { return 'z' + bytesToB64url(await deflateBytes(json)); } catch { /* fall through */ }
  }
  return 'j' + bytesToB64url(new TextEncoder().encode(json));
}

async function decodeConfig(str) {
  const tag = str[0];
  const bytes = b64urlToBytes(str.slice(1));
  if (tag === 'z') return JSON.parse(await inflateText(bytes));
  if (tag === 'j') return JSON.parse(new TextDecoder().decode(bytes));
  throw new Error('Unrecognised link format');
}

/** A link that reopens the current chart. */
async function buildShareLink() {
  const encoded = await encodeConfig(wrap(serialize()));
  return `${location.href.split('#')[0]}#${HASH_KEY}=${encoded}`;
}

/** Load a chart from the URL fragment, if one is there. The fragment is then
 *  dropped so the link acts as a one-time import: you carry on editing and
 *  autosave keeps your changes, instead of a reload snapping back to the link. */
async function loadFromHash() {
  const m = new RegExp(`[#&]${HASH_KEY}=([^&]+)`).exec(location.hash);
  if (!m) return false;
  let loaded = false;
  try {
    const data = unwrap(await decodeConfig(decodeURIComponent(m[1])));
    if (data) loaded = deserialize(data);
  } catch {
    loaded = false;
  }
  history.replaceState(null, '', location.href.split('#')[0]);
  return loaded;
}

/** Copy text, falling back to a hidden textarea when the clipboard API is
 *  unavailable (it needs a secure context, so file:// often lacks it). */
async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    try { await navigator.clipboard.writeText(text); return true; } catch { /* fall through */ }
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  ta.remove();
  return ok;
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
