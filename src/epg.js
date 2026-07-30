// Shared EPG helpers — used by both EPGBar (single channel) and EPGGrid (guide).

/** Parse an XMLTV date string ("YYYYMMDDHHMMSS +ZZZZ") into a Date. */
export function parseXMLTVDate(str) {
  if (!str || str.length < 14) return null;
  const Y = parseInt(str.slice(0, 4));
  const Mo = parseInt(str.slice(4, 6)) - 1;
  const D = parseInt(str.slice(6, 8));
  const H = parseInt(str.slice(8, 10));
  const Mi = parseInt(str.slice(10, 12));
  const S = parseInt(str.slice(12, 14));

  // Honor an explicit timezone offset ("+0200"), else fall back to local time.
  const tz = str.slice(14).trim().match(/^([+-])(\d{2})(\d{2})$/);
  if (tz) {
    const offMin = (tz[1] === '+' ? 1 : -1) * (parseInt(tz[2]) * 60 + parseInt(tz[3]));
    return new Date(Date.UTC(Y, Mo, D, H, Mi, S) - offMin * 60000);
  }
  return new Date(Y, Mo, D, H, Mi, S);
}

// Der Namens-Fallback unten muss über ALLE EPG-Schlüssel laufen, und zwar für
// jeden Kanal, dessen tvg-id nichts trifft — bei einer großen Playlist ist das
// der Normalfall. Object.entries + toLowerCase pro Kanal zu wiederholen ist
// deshalb quadratisch (gemessen: 20.000 Kanäle × 3.000 EPG-Schlüssel ≈ 10 s,
// davon rund 9,8 s allein für das wiederholte toLowerCase der Schlüssel).
// Die kleingeschriebene Schlüsselliste hängt nur am EPG-Objekt, also wird sie
// einmal pro EPG-Objekt gebaut und in einer WeakMap behalten — das EPG kommt
// aus dem State und wird bei jeder Neuladung als neues Objekt ersetzt, der
// Eintrag verschwindet also mit ihm. Reihenfolge bleibt die von
// Object.entries, damit "erster Treffer gewinnt" unverändert dasselbe liefert.
const lowerKeyCache = new WeakMap();

function lowerKeyEntries(epg) {
  let entries = lowerKeyCache.get(epg);
  if (!entries) {
    entries = Object.entries(epg).map(([key, val]) => [key.toLowerCase(), val]);
    lowerKeyCache.set(epg, entries);
  }
  return entries;
}

/**
 * Find the programmes for a channel in the EPG map and return them with
 * resolved `startDate`/`stopDate`, sorted ascending by start.
 * Matching: exact tvg-id first, then a loose channel-name fallback.
 */
export function matchProgrammes(epg, channel) {
  if (!channel || !epg || typeof epg !== 'object') return [];

  let progs = epg[channel.tvgId] || [];

  if (!progs.length && channel.name) {
    const nameLower = channel.name.toLowerCase();
    for (const [keyLower, val] of lowerKeyEntries(epg)) {
      if (keyLower.includes(nameLower) || nameLower.includes(keyLower)) {
        progs = val;
        break;
      }
    }
  }

  return progs
    .map((p) => ({
      ...p,
      startDate: parseXMLTVDate(p.start),
      stopDate: p.stop ? parseXMLTVDate(p.stop) : null,
    }))
    .filter((p) => p.startDate)
    .sort((a, b) => a.startDate - b.startDate);
}
