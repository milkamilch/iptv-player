// Liste von Server-URLs eines Xtream-Zugangs und der Wechsel zwischen ihnen.
// Bewusst frei von React und IPC, damit es per `node --test` direkt prüfbar ist.

function normalizeUrl(raw) {
  let u = raw.trim().replace(/\/+$/, '');
  if (!u) return '';
  if (!u.startsWith('http://') && !u.startsWith('https://')) u = 'http://' + u;
  return u;
}

// Eine URL pro Zeile; leere Zeilen und Duplikate fallen weg, die erste gewinnt.
export function parseUrlList(text) {
  const urls = text.split(/\r?\n/).map(normalizeUrl).filter(Boolean);
  return [...new Set(urls)];
}

// Alte Einträge kennen nur baseUrl.
export function urlsOf(acc) {
  return Array.isArray(acc.baseUrls) && acc.baseUrls.length ? acc.baseUrls : [acc.baseUrl];
}

// Aktive URL zuerst, Rest in Listenreihenfolge.
export function failoverOrder(urls, active) {
  return urls.includes(active) ? [active, ...urls.filter((u) => u !== active)] : urls;
}

// Liefert { baseUrl, value } der ersten URL, bei der attempt klappt.
// err.stop bricht ohne Wechsel ab; scheitern alle, gilt der letzte Fehler.
export async function firstWorking(urls, attempt) {
  if (!urls.length) throw new Error('Keine Server-URL.');
  let last;
  for (const baseUrl of urls) {
    try {
      return { baseUrl, value: await attempt(baseUrl) };
    } catch (err) {
      if (err?.stop) throw err;
      last = err;
    }
  }
  throw last;
}

export function sameAccount(a, b) {
  if (a.username !== b.username) return false;
  const bUrls = urlsOf(b);
  return urlsOf(a).some((u) => bUrls.includes(u));
}

// Login über die Liste. fetchApi(url) liefert die player_api-Antwort oder wirft.
// 2xx ohne JSON zählt nur als Rückfall (info null), eine spätere JSON-URL gilt.
// auth 0 bricht ohne Wechsel ab (err.stop).
export async function verifyLogin(urls, fetchApi) {
  if (!urls.length) throw new Error('Keine Server-URL.');
  let fallback = null;
  let last;
  for (const baseUrl of urls) {
    try {
      const info = await fetchApi(baseUrl);
      if (info?.user_info?.auth === 0) throw Object.assign(new Error('Ungültige Zugangsdaten.'), { stop: true });
      return { baseUrl, info };
    } catch (err) {
      if (err?.stop) throw err;
      if ((err?.message || '').includes('Ungültige JSON-Antwort')) fallback ??= baseUrl;
      else last = err;
    }
  }
  if (fallback) return { baseUrl: fallback, info: null };
  throw last;
}
