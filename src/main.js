import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
import path from 'node:path';
import fs from 'node:fs';
import started from 'electron-squirrel-startup';
import Store from 'electron-store';

if (started) app.quit();

const store = new Store();

// ── M3U Parser ────────────────────────────────────────────────────────────────
function parseM3U(text) {
  const channels = [];
  const lines = text.split(/\r?\n/);
  let current = null;

  for (const line of lines) {
    if (line.startsWith('#EXTINF:')) {
      current = { name: '', url: '', group: 'Alle', logo: '', tvgId: '' };
      const nameMatch = line.match(/,(.+)$/);
      if (nameMatch) current.name = nameMatch[1].trim();
      const groupMatch = line.match(/group-title="([^"]*)"/i);
      if (groupMatch) current.group = groupMatch[1] || 'Alle';
      const logoMatch = line.match(/tvg-logo="([^"]*)"/i);
      if (logoMatch) current.logo = logoMatch[1];
      const idMatch = line.match(/tvg-id="([^"]*)"/i);
      if (idMatch) current.tvgId = idMatch[1];
    } else if (line.startsWith('http') || line.startsWith('rtsp') || line.startsWith('rtmp')) {
      if (current) {
        current.url = line.trim();
        current.id = Buffer.from(current.url).toString('base64').slice(0, 16);
        channels.push(current);
        current = null;
      }
    }
  }
  return channels;
}

// ── XMLTV / EPG Parser ────────────────────────────────────────────────────────
function parseXMLTV(text) {
  const programmes = {};

  // Extract all <programme> elements
  const progRegex = /<programme\s([^>]*)>([\s\S]*?)<\/programme>/g;
  let m;
  while ((m = progRegex.exec(text)) !== null) {
    const attrs = m[1];
    const body = m[2];

    const startMatch = attrs.match(/start="(\d{14})\s*([+-]\d{4})?"/);
    const stopMatch  = attrs.match(/stop="(\d{14})\s*([+-]\d{4})?"/);
    const channelMatch = attrs.match(/channel="([^"]*)"/);
    if (!startMatch || !channelMatch) continue;

    const titleMatch = body.match(/<title[^>]*>([^<]*)<\/title>/);
    const descMatch  = body.match(/<desc[^>]*>([^<]*)<\/desc>/);
    const catMatch   = body.match(/<category[^>]*>([^<]*)<\/category>/);

    const channelId = channelMatch[1];
    if (!programmes[channelId]) programmes[channelId] = [];

    programmes[channelId].push({
      start:    startMatch[1],
      stop:     stopMatch ? stopMatch[1] : null,
      title:    titleMatch ? titleMatch[1] : 'Unbekannt',
      desc:     descMatch  ? descMatch[1]  : '',
      category: catMatch   ? catMatch[1]   : '',
    });
  }
  return programmes;
}

function parseXMLTVDate(str) {
  // Format: YYYYMMDDHHmmss
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

// ── Window ────────────────────────────────────────────────────────────────────
const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0f0f17',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: false, // needed to load IPTV stream URLs cross-origin
    },
    titleBarStyle: 'default',
    title: 'IPTV Player',
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }
};

// ── IPC Handlers ──────────────────────────────────────────────────────────────

ipcMain.handle('open-m3u-file', async () => {
  const result = await dialog.showOpenDialog({
    title: 'M3U Playlist öffnen',
    filters: [{ name: 'M3U Playlist', extensions: ['m3u', 'm3u8'] }, { name: 'Alle Dateien', extensions: ['*'] }],
    properties: ['openFile'],
  });
  if (result.canceled || !result.filePaths.length) return null;
  const text = fs.readFileSync(result.filePaths[0], 'utf-8');
  return { path: result.filePaths[0], channels: parseM3U(text) };
});

ipcMain.handle('load-m3u-url', async (_event, url) => {
  const { net } = await import('electron');
  return new Promise((resolve, reject) => {
    const req = net.request(url);
    let data = '';
    req.on('response', (res) => {
      res.on('data', (chunk) => { data += chunk.toString(); });
      res.on('end', () => resolve(parseM3U(data)));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.end();
  });
});

ipcMain.handle('open-xmltv-file', async () => {
  const result = await dialog.showOpenDialog({
    title: 'EPG (XMLTV) öffnen',
    filters: [{ name: 'XMLTV', extensions: ['xml', 'gz', 'xmltv'] }, { name: 'Alle', extensions: ['*'] }],
    properties: ['openFile'],
  });
  if (result.canceled || !result.filePaths.length) return null;
  let text = fs.readFileSync(result.filePaths[0], 'utf-8');
  return parseXMLTV(text);
});

ipcMain.handle('load-xmltv-url', async (_event, url) => {
  const { net } = await import('electron');
  return new Promise((resolve, reject) => {
    const req = net.request(url);
    let data = '';
    req.on('response', (res) => {
      res.on('data', (chunk) => { data += chunk.toString(); });
      res.on('end', () => resolve(parseXMLTV(data)));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.end();
  });
});

// ── Xtream Codes API fetch (generic JSON) ────────────────────────────────────
async function fetchJson(url) {
  const { net } = await import('electron');
  return new Promise((resolve, reject) => {
    const req = net.request(url);
    let data = '';
    req.on('response', (res) => {
      res.on('data', (chunk) => { data += chunk.toString(); });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('Ungültige JSON-Antwort')); }
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.end();
  });
}

ipcMain.handle('fetch-xtream', async (_event, url) => fetchJson(url));

// ── Xtream Codes: load all live channels via JSON API ────────────────────────
ipcMain.handle('load-xtream-channels', async (_event, baseUrl, username, password) => {
  const base = `${baseUrl}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;

  // Fetch categories and streams in parallel
  const [categories, streams] = await Promise.all([
    fetchJson(`${base}&action=get_live_categories`),
    fetchJson(`${base}&action=get_live_streams`),
  ]);

  // Build category id → name map
  const catMap = {};
  for (const cat of (categories || [])) {
    catMap[cat.category_id] = cat.category_name;
  }

  // Convert streams to our channel format
  const channels = (streams || []).map((s) => {
    const catId = s.category_ids?.[0] || s.category_id;
    const group = catMap[catId] || 'Alle';
    const streamUrl = `${baseUrl}/live/${encodeURIComponent(username)}/${encodeURIComponent(password)}/${s.stream_id}.m3u8`;
    return {
      id:     String(s.stream_id),
      name:   s.name || 'Unbekannt',
      url:    streamUrl,
      group:  group,
      logo:   s.stream_icon || '',
      tvgId:  s.epg_channel_id || '',
    };
  });

  return channels;
});

// ── Xtream Codes: load all VOD (movies) via JSON API ─────────────────────────
ipcMain.handle('load-xtream-vod', async (_event, baseUrl, username, password) => {
  const base = `${baseUrl}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
  const [categories, streams] = await Promise.all([
    fetchJson(`${base}&action=get_vod_categories`),
    fetchJson(`${base}&action=get_vod_streams`),
  ]);
  const catMap = {};
  for (const cat of (categories || [])) catMap[cat.category_id] = cat.category_name;

  return (streams || []).map((s) => {
    const catId = s.category_ids?.[0] || s.category_id;
    return {
      id:           String(s.stream_id),
      name:         s.name || 'Unbekannt',
      group:        catMap[catId] || 'Alle',
      logo:         s.stream_icon || '',
      containerExt: s.container_extension || 'mp4',
      rating:       s.rating || '',
      year:         s.year || '',
      type:         'movie',
    };
  });
});

// ── Xtream Codes: load all series via JSON API ───────────────────────────────
ipcMain.handle('load-xtream-series', async (_event, baseUrl, username, password) => {
  const base = `${baseUrl}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
  const [categories, series] = await Promise.all([
    fetchJson(`${base}&action=get_series_categories`),
    fetchJson(`${base}&action=get_series`),
  ]);
  const catMap = {};
  for (const cat of (categories || [])) catMap[cat.category_id] = cat.category_name;

  return (series || []).map((s) => {
    const catId = s.category_ids?.[0] || s.category_id;
    return {
      id:     String(s.series_id),
      name:   s.name || 'Unbekannt',
      group:  catMap[catId] || 'Alle',
      logo:   s.cover || '',
      plot:   s.plot || '',
      genre:  s.genre || '',
      rating: s.rating || '',
      year:   s.year || s.releaseDate || '',
      type:   'series',
    };
  });
});

// ── Xtream Codes: single movie detail ────────────────────────────────────────
ipcMain.handle('load-xtream-vod-info', async (_event, baseUrl, username, password, vodId) => {
  const base = `${baseUrl}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
  const data = await fetchJson(`${base}&action=get_vod_info&vod_id=${vodId}`);
  const info = data?.info || {};
  const movie = data?.movie_data || {};
  return {
    plot:         info.plot || info.description || '',
    genre:        info.genre || '',
    year:         info.releasedate || info.year || '',
    rating:       info.rating || '',
    duration:     info.duration || '',
    cast:         info.cast || info.actors || '',
    director:     info.director || '',
    image:        info.movie_image || info.cover_big || '',
    containerExt: movie.container_extension || '',
  };
});

// ── Xtream Codes: series detail (seasons + episodes, normalized) ──────────────
ipcMain.handle('load-xtream-series-info', async (_event, baseUrl, username, password, seriesId) => {
  const base = `${baseUrl}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
  const data = await fetchJson(`${base}&action=get_series_info&series_id=${seriesId}`);
  const info = data?.info || {};
  const epMap = data?.episodes || {};

  const seasons = Object.keys(epMap)
    .sort((a, b) => Number(a) - Number(b))
    .map((seasonKey) => ({
      season: Number(seasonKey),
      episodes: (epMap[seasonKey] || []).map((e) => ({
        id:           String(e.id),
        name:         e.title || `Episode ${e.episode_num}`,
        episodeNum:   e.episode_num,
        containerExt: e.container_extension || 'mp4',
        plot:         e.info?.plot || '',
        duration:     e.info?.duration || '',
      })),
    }));

  return {
    info: {
      plot:  info.plot || '',
      genre: info.genre || '',
      cover: info.cover || '',
      cast:  info.cast || '',
      rating: info.rating || '',
    },
    seasons,
  };
});

ipcMain.handle('store-get', (_event, key) => store.get(key));
ipcMain.handle('store-set', (_event, key, value) => { store.set(key, value); });
ipcMain.handle('store-delete', (_event, key) => { store.delete(key); });

ipcMain.handle('parse-xmltv-date', (_event, str) => {
  const d = parseXMLTVDate(str);
  return d ? d.toISOString() : null;
});

ipcMain.handle('open-external', (_event, url) => shell.openExternal(url));

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
