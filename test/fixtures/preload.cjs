// Stellvertreter für die echte Preload-Bridge: gleiche Oberfläche, Fake-Daten.
const { contextBridge } = require('electron');

const store = JSON.parse(process.env.TEST_STORE || '{}');
const CHANNEL_COUNT = Number(process.env.TEST_CHANNELS || 420);
const PREFIXED = process.env.TEST_PREFIXED !== '0';
const LANDS = ['DE', 'US', 'TR', 'FR'];
// Verzögert Filme/Serien, damit Eingaben in der Ladephase testbar sind.
const VOD_DELAY = Number(process.env.TEST_VOD_DELAY || 0);
const delayed = (v) => new Promise((r) => setTimeout(() => r(v), VOD_DELAY));
// Verzögert nur das Lesen des gemerkten Kanals, damit ein Moduswechsel während des Restores testbar ist.
const RESTORE_DELAY = Number(process.env.TEST_RESTORE_DELAY || 0);

// Tote Basis-URLs (kommagetrennt): Anfragen daran scheitern wie bei HTTP 503,
// auf Wunsch erst nach TEST_DEAD_DELAY ms.
const list = (name) => (process.env[name] || '').split(',').filter(Boolean);
const DEAD = list('TEST_DEAD_HOSTS');
const DEAD_DELAY = Number(process.env.TEST_DEAD_DELAY || 0);
const isDead = (base) => DEAD.includes(base);
const dead = () => new Promise((_, rej) => setTimeout(() => rej(new Error('HTTP 503')), DEAD_DELAY));
// Nur Filme (Liste und Info) auf diesen Basis-URLs tot.
const DEAD_VOD = list('TEST_DEAD_VOD_HOSTS');
const isDeadVod = (base) => isDead(base) || DEAD_VOD.includes(base);
// fetchXtream: auth 0 bzw. Antwort ohne JSON; die Aufrufe zählt calls (window.__fetchXtreamCalls()).
const AUTH0 = list('TEST_AUTH0_HOSTS');
const NOJSON = list('TEST_NOJSON_HOSTS');
const onHost = (hosts, url) => hosts.some((b) => url.startsWith(b + '/'));
let fetchXtreamCalls = 0;

const chans = [];
for (let i = 1; i <= CHANNEL_COUNT; i++) {
  chans.push({
    id: String(i),
    name: 'Kanal ' + i,
    url: 'http://127.0.0.1:1/live/u/p/' + i + '.m3u8',
    // mischt bewusst eine Provider-Kategorie ein, die wörtlich "Alle" heißt
    group: PREFIXED
      ? `${LANDS[i % LANDS.length]} | ${i % 3 === 0 ? 'Sport' : i % 3 === 1 ? 'Alle' : 'Doku'}`
      : (i % 3 === 0 ? 'Sport' : i % 3 === 1 ? 'Alle' : 'Doku'),
    logo: i % 5 === 0 ? 'http://127.0.0.1:1/broken.png' : '',
    tvgId: 'ch' + i,
  });
}

// XMLTV-Fixture. Ein leeres EPG ({}) macht den Namens-Fallback in
// matchProgrammes gratis und rendert nie einen Sendungsblock — der Guide-Check
// prüfte damit nur die Zeilenfensterung. Mit echten Schlüsseln deckt er
// zusätzlich das Blocklayout ab und reagiert auf Performance-Regressionen im
// EPG-Matching (Kanäle × EPG-Schlüssel).
// 3000 Schlüssel ist die Größenordnung eines echten Provider-XMLTV und die,
// mit der die Guide-Regression gemessen wurde: die Kosten des Namens-Fallbacks
// sind Kanäle × Schlüssel, ein kleineres EPG bliebe auch bei
// TEST_CHANNELS=20000 unter dem Zeitbudget des Guide-Checks und würde die
// Regression nicht mehr sichtbar machen.
const EPG_KEYS = Number(process.env.TEST_EPG_KEYS || 3000);
const EPG_PROGS = 8;
const SLOT_MIN = 90;

function pad(n) { return String(n).padStart(2, '0'); }
// "YYYYMMDDHHMMSS +0000" — feste UTC-Angabe, damit die Zeitzone der CI-Maschine
// nichts verschiebt.
function xmltvDate(d) {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())} +0000`;
}

const epg = {};
{
  // Zwei Slots in der Vergangenheit beginnen, damit garantiert eine Sendung
  // "jetzt" läuft (der Guide markiert die mit .live).
  const base = Date.now() - 2 * SLOT_MIN * 60000;
  for (let i = 1; i <= EPG_KEYS; i++) {
    // Jeder siebte Kanal fehlt im EPG — so läuft in jeder Konfiguration auch
    // der Namens-Fallback (der teure Zweig) und nicht nur der Direkttreffer.
    if (i % 7 === 0) continue;
    const progs = [];
    for (let j = 0; j < EPG_PROGS; j++) {
      progs.push({
        title: `Sendung ${i}-${j + 1}`,
        desc: 'Beschreibung ' + j,
        start: xmltvDate(new Date(base + j * SLOT_MIN * 60000)),
        stop: xmltvDate(new Date(base + (j + 1) * SLOT_MIN * 60000)),
      });
    }
    // Schlüssel = tvgId der ersten EPG_KEYS Kanäle. Bewusst nicht der
    // Kanalname: sonst würde der Namens-Fallback ("Kanal 5" in "Kanal 55")
    // quer durch die Liste falsche Treffer erzeugen.
    epg['ch' + i] = progs;
  }
}

// rating '0' bedeutet "nicht bewertet" und darf nicht als "* 0" erscheinen
// Titel tragen das Land als Präfix, die Kategorien nicht (wie beim echten Anbieter).
// Testfilm/Testserie bleiben ohne Präfix und landen in "Sonstige".
const vod = (c, n) => PREFIXED ? `${c} - ${n}` : n;
const movies = [
  { id: '900', name: 'Testfilm', group: 'Action', logo: '', containerExt: 'mp4', rating: '0', type: 'movie' },
  { id: '901', name: vod('DE', 'Street Fighter (2026)'), group: 'NETFLIX MOVIES', logo: '', containerExt: 'mp4', rating: '0', type: 'movie' },
  { id: '902', name: vod('EN', 'Street Fighter (2026)'), group: 'NETFLIX MOVIES', logo: '', containerExt: 'mp4', rating: '0', type: 'movie' },
];
const series = [
  { id: '800', name: 'Testserie', group: 'Drama', logo: '', type: 'series' },
  { id: '801', name: vod('DE', 'Haustausch (2026) (SE)'), group: 'GERMANY NETFLIX', logo: '', type: 'series' },
];

contextBridge.exposeInMainWorld('iptv', {
  // Wert beim Aufruf lesen wie der echte Store, nur die Antwort kommt später.
  storeGet: async (k) => {
    const v = store[k];
    return k === 'lastChannel' && RESTORE_DELAY ? new Promise((r) => setTimeout(() => r(v), RESTORE_DELAY)) : v;
  },
  storeSet: async (k, v) => { store[k] = v; },
  storeDelete: async (k) => { delete store[k]; },
  secureEncrypt: async (p) => p,
  secureDecrypt: async (v) => v,
  fetchXtream: async (url) => {
    fetchXtreamCalls++;
    if (onHost(DEAD, url)) return dead();
    if (onHost(NOJSON, url)) throw new Error('Ungültige JSON-Antwort');
    return { user_info: { auth: onHost(AUTH0, url) ? 0 : 1 } };
  },
  loadXtreamChannels: async (base) => (isDead(base) ? dead() : chans),
  loadXtreamVod: (base) => (isDeadVod(base) ? dead() : delayed(movies)),
  loadXtreamSeries: (base) => (isDead(base) ? dead() : delayed(series)),
  loadXtreamVodInfo: async (base) => (isDeadVod(base) ? dead() : { plot: 'p', rating: '0', containerExt: 'mp4' }),
  loadXtreamSeriesInfo: async (base) => (isDead(base) ? dead() : { info: {}, seasons: [] }),
  loadXMLTVUrl: async () => epg,
  openXMLTVFile: async () => epg,
  openM3UFile: async () => null,
  loadM3UUrl: async () => [],
  openExternal: async () => {},
});
contextBridge.exposeInMainWorld('__fetchXtreamCalls', () => fetchXtreamCalls);
