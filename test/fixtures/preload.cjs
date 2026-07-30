// Stellvertreter für die echte Preload-Bridge: gleiche Oberfläche, Fake-Daten.
const { contextBridge } = require('electron');

const store = JSON.parse(process.env.TEST_STORE || '{}');
const CHANNEL_COUNT = Number(process.env.TEST_CHANNELS || 420);
const PREFIXED = process.env.TEST_PREFIXED !== '0';
const LANDS = ['DE', 'US', 'TR', 'FR'];

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
const movies = [{ id: '900', name: 'Testfilm', group: 'Action', logo: '', containerExt: 'mp4', rating: '0', type: 'movie' }];
const series = [{ id: '800', name: 'Testserie', group: 'Drama', logo: '', type: 'series' }];

contextBridge.exposeInMainWorld('iptv', {
  storeGet: async (k) => store[k],
  storeSet: async (k, v) => { store[k] = v; },
  storeDelete: async (k) => { delete store[k]; },
  secureEncrypt: async (p) => p,
  secureDecrypt: async (v) => v,
  fetchXtream: async () => ({ user_info: { auth: 1 } }),
  loadXtreamChannels: async () => chans,
  loadXtreamVod: async () => movies,
  loadXtreamSeries: async () => series,
  loadXtreamVodInfo: async () => ({ plot: 'p', rating: '0', containerExt: 'mp4' }),
  loadXtreamSeriesInfo: async () => ({ info: {}, seasons: [] }),
  loadXMLTVUrl: async () => epg,
  openXMLTVFile: async () => epg,
  openM3UFile: async () => null,
  loadM3UUrl: async () => [],
  openExternal: async () => {},
});
