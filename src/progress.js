// Persistent playback progress ("continue watching"), watched marks and settings.
// All keyed by a playable key: `movie:<id>` or `episode:<id>`.

const HIST = 'watchHistory';
const WATCHED = 'watched';
const SETTINGS = 'settings';

export const DEFAULT_SETTINGS = { defaultMode: 'live', hlsBuffer: 'normal', epgUrl: '' };

export const HLS_BUFFER = { klein: 15, normal: 30, 'groß': 120 };

export function playableKey(type, id) { return `${type}:${id}`; }

export async function getHistory() {
  return (await window.iptv.storeGet(HIST)) || {};
}
export async function upsertHistory(key, entry) {
  const h = await getHistory();
  h[key] = entry;
  await window.iptv.storeSet(HIST, h);
}
export async function removeHistory(key) {
  const h = await getHistory();
  if (h[key]) { delete h[key]; await window.iptv.storeSet(HIST, h); }
}

export async function getWatched() {
  return (await window.iptv.storeGet(WATCHED)) || {};
}
export async function markWatched(key) {
  const w = await getWatched();
  w[key] = Date.now();
  await window.iptv.storeSet(WATCHED, w);
}

export async function clearAllProgress() {
  await window.iptv.storeSet(HIST, {});
  await window.iptv.storeSet(WATCHED, {});
}

export async function getSettings() {
  return { ...DEFAULT_SETTINGS, ...((await window.iptv.storeGet(SETTINGS)) || {}) };
}
export async function saveSettings(settings) {
  await window.iptv.storeSet(SETTINGS, settings);
}
