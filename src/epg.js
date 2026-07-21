// Shared EPG helpers — used by both EPGBar (single channel) and EPGGrid (guide).

/** Parse an XMLTV date string ("YYYYMMDDHHMMSS +ZZZZ") into a Date. */
export function parseXMLTVDate(str) {
  if (!str || str.length < 14) return null;
  return new Date(
    parseInt(str.slice(0, 4)),
    parseInt(str.slice(4, 6)) - 1,
    parseInt(str.slice(6, 8)),
    parseInt(str.slice(8, 10)),
    parseInt(str.slice(10, 12)),
    parseInt(str.slice(12, 14))
  );
}

/**
 * Find the programmes for a channel in the EPG map and return them with
 * resolved `startDate`/`stopDate`, sorted ascending by start.
 * Matching: exact tvg-id first, then a loose channel-name fallback.
 */
export function matchProgrammes(epg, channel) {
  if (!channel || !epg) return [];

  let progs = epg[channel.tvgId] || [];

  if (!progs.length && channel.name) {
    const nameLower = channel.name.toLowerCase();
    for (const [key, val] of Object.entries(epg)) {
      const keyLower = key.toLowerCase();
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
