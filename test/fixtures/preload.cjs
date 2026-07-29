// Stellvertreter für die echte Preload-Bridge: gleiche Oberfläche, Fake-Daten.
const { contextBridge } = require('electron');

const store = JSON.parse(process.env.TEST_STORE || '{}');
const CHANNEL_COUNT = Number(process.env.TEST_CHANNELS || 420);

const chans = [];
for (let i = 1; i <= CHANNEL_COUNT; i++) {
  chans.push({
    id: String(i),
    name: 'Kanal ' + i,
    url: 'http://127.0.0.1:1/live/u/p/' + i + '.m3u8',
    // mischt bewusst eine Provider-Kategorie ein, die wörtlich "Alle" heißt
    group: i % 3 === 0 ? 'Sport' : i % 3 === 1 ? 'Alle' : 'Doku',
    logo: i % 5 === 0 ? 'http://127.0.0.1:1/broken.png' : '',
    tvgId: 'ch' + i,
  });
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
  loadXMLTVUrl: async () => ({}),
  openXMLTVFile: async () => ({}),
  openM3UFile: async () => null,
  loadM3UUrl: async () => [],
  openExternal: async () => {},
});
