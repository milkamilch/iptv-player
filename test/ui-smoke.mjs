// Fährt den gebauten Renderer in Electron hoch und prüft ihn über das
// DevTools-Protokoll. Voraussetzung: `npx vite build --config
// vite.renderer.config.mjs --outDir <dir> --base ./` wurde ausgeführt.
//   SCENARIO=login|live|live-restore npm run test:ui
// Weitere Schalter: TEST_CHANNELS, TEST_PREFIXED, TEST_EPG_KEYS — siehe
// test/README.md.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
// Das electron-Paket selbst liefert den Pfad zur Binary — und lädt sie nach,
// falls sie fehlt. Ein fest verdrahtetes node_modules/electron/dist/electron
// scheiterte im CI mit ENOENT, weil `npm ci` dort die Binary nicht ablegte.
import electronPath from 'electron';

const PORT = 9333;
const HTTP_PORT = 8899;
const DIST = process.env.RENDERER_DIST || path.join(process.cwd(), '.vite/renderer-test');
const SCENARIO = process.env.SCENARIO || 'live';
const TOTAL_CHANNELS = Number(process.env.TEST_CHANNELS || 420);

// Budget fürs Öffnen des Guides. Gemessen wird die Zeit von der 'g'-Taste bis
// zur ersten Poll-Runde, in der Panel, Zeilen und Sendungsblöcke stehen — also
// inklusive zweier CDP-Roundtrips und des 100ms-Poll-Rasters, die den Boden bei
// gut 100ms festnageln.
// Gemessen auf einem Entwicklerrechner (Electron 42, 3000 EPG-Schlüssel):
//   gefenstert (jetzt):        66–102 ms, unabhängig von TEST_CHANNELS
//   Zeilen für ALLE Kanäle:  1773 ms (TEST_CHANNELS=20000 mit Länderfilter)
//                            6787 ms (TEST_CHANNELS=20000, TEST_PREFIXED=0)
// 1000 ms liegt damit rund zehnfach über dem Messwert — genug Luft für einen
// langsamen CI-Runner unter Xvfb — und klar unter der Regression.
const GUIDE_BUDGET_MS = 1000;

const STORES = {
  login: {
    savedAccounts: [
      { baseUrl: 'http://a.example:8080', username: 'anna', password: 'p1' },
      { baseUrl: 'http://b.example:8080', username: 'ben', password: 'p2' },
    ],
  },
  live: {
    activeAccount: { baseUrl: 'http://a.example:8080', username: 'anna', password: 'p1' },
    settings: { defaultMode: 'live', hlsBuffer: 'normal', epgUrl: '' },
    // Schlüssel wie in src/progress.js; macht "Weiter" in Filme erreichbar
    watchHistory: { 'movie:900': { updatedAt: 1, card: { kind: 'movie', id: '900', name: 'Testfilm', logo: '', containerExt: 'mp4' } } },
  },
  // Deckt das Wiederherstellen eines persistierten Landes beim Start ab:
  // lastCountry sitzt schon im Store, bevor React überhaupt mountet, und
  // muss den Start direkt in dieses Land tragen statt in die Länderliste.
  'live-restore': {
    activeAccount: { baseUrl: 'http://a.example:8080', username: 'anna', password: 'p1' },
    settings: { defaultMode: 'live', hlsBuffer: 'normal', epgUrl: '' },
    lastCountry: 'DE',
  },
  // lastCountry und lastChannel liegen unabhängig voneinander im Store und
  // können auseinanderlaufen (leaveCountry löscht nur das Land, ein Landwechsel
  // ohne Kanalwahl schreibt nur das Land). Hier absichtlich widersprüchlich:
  // gemerktes Land DE, gemerkter Kanal 7 = FR. Der wiederhergestellte Kanal
  // muss die Leiste mitziehen, sonst zeigt sie ein Land, in dem der laufende
  // Sender nicht vorkommt — und markiert entsprechend keine Zeile.
  'live-restore-channel': {
    activeAccount: { baseUrl: 'http://a.example:8080', username: 'anna', password: 'p1' },
    settings: { defaultMode: 'live', hlsBuffer: 'normal', epgUrl: '' },
    lastCountry: 'DE',
    lastChannel: { id: '7', name: 'Kanal 7' },
  },
  // Start in Filme mit verzögert ladender VOD-Liste (TEST_VOD_DELAY, siehe
  // spawn unten): in der Ladephase ist "Weiter" die erste Ebene.
  'vod-delay': {
    activeAccount: { baseUrl: 'http://a.example:8080', username: 'anna', password: 'p1' },
    settings: { defaultMode: 'movies', hlsBuffer: 'normal', epgUrl: '' },
    lastCountry: 'DE',
    watchHistory: { 'movie:900': { updatedAt: 1, card: { kind: 'movie', id: '900', name: 'Testfilm', logo: '', containerExt: 'mp4' } } },
  },
};

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml' };

// ── Zustand, den das finally aufräumen muss ─────────────────────────────────
let server = null;
let child = null;
let ws = null;

const pending = new Map();
const events = [];
let msgId = 0;

function send(method, params = {}) {
  const id = ++msgId;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((r) => pending.set(id, r));
}

export async function ev(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) {
    throw new Error('eval fehlgeschlagen: ' +
      (r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text));
  }
  return r.result.result.value;
}
const json = async (expr) => JSON.parse(await ev(`JSON.stringify(${expr})`));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const key = (k) => ev(`document.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)}, bubbles: true }))`);
// Polls instead of a fixed sleep: virtualisation re-renders on a scroll event
// that fires asynchronously, and how long that takes depends on machine load
// (headless/no-GPU sandboxes are measurably slower than a dev laptop). Capped
// at 3s so a genuinely broken condition still fails instead of hanging.
async function waitUntil(read, predicate, timeoutMs = 3000, intervalMs = 100) {
  const start = Date.now();
  let value = await read();
  while (!predicate(value) && Date.now() - start < timeoutMs) {
    await wait(intervalMs);
    value = await read();
  }
  return value;
}

const results = [];
function check(name, pass, detail = '') {
  results.push(pass);
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
}

// Kategorienebene: Eintrag der Kategorienliste anklicken, Breadcrumb als Text lesen.
const pick = async (name) => {
  await ev(`[...document.querySelectorAll('.category-item')]
    .find(e => e.querySelector('.channel-name')?.textContent === ${JSON.stringify(name)}).click()`);
  await wait(500);
};
const crumb = () => ev(`document.querySelector('.crumb')?.textContent ?? null`);

async function findPage() {
  for (let i = 0; i < 60; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      const p = targets.find((t) => t.type === 'page' && t.url.startsWith(`http://127.0.0.1:${HTTP_PORT}`));
      if (p) return p;
    } catch { /* noch nicht oben */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('Renderer-Target ist nie aufgetaucht');
}

// Ein Electron aus einem abgebrochenen Lauf hält 9333 weiter. Ein zweites
// Electron, das den Port nicht bekommt, taucht auf /json überhaupt nicht auf —
// findPage() hängt sich dann an den ALTEN Renderer (alter Bundle, alter Store)
// und die Suite meldet grün für Code, der nie geladen wurde. Deshalb hier
// lautstark abbrechen statt sich an einen Fremden zu hängen.
async function debugPortAnswers() {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/json/version`, { signal: AbortSignal.timeout(1500) });
    return r.ok;
  } catch {
    return false;
  }
}

async function run() {
  if (await debugPortAnswers()) {
    throw new Error(
      `Port ${PORT} antwortet bereits — dort läuft noch ein Electron (vermutlich aus einem ` +
      `abgebrochenen Lauf). Der Test würde sich an dessen alten Renderer hängen und grün ` +
      `melden. Erst aufräumen: pkill -9 -f "[i]ptv-player/node_modules/electron"`);
  }

  server = createServer(async (req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
    try {
      const body = await readFile(path.join(DIST, rel));
      res.writeHead(200, { 'Content-Type': MIME[path.extname(rel)] || 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', (e) => reject(new Error(`HTTP-Port ${HTTP_PORT} nicht verfügbar: ${e.message}`)));
    server.listen(HTTP_PORT, '127.0.0.1', resolve);
  });

  child = spawn(
    electronPath,
    [path.join(import.meta.dirname, 'fixtures/main.cjs'), '--no-sandbox'],
    {
      stdio: 'ignore',
      env: {
        ...process.env,
        APP_URL: `http://127.0.0.1:${HTTP_PORT}/index.html`,
        TEST_STORE: JSON.stringify(STORES[SCENARIO]),
        TEST_VOD_DELAY: SCENARIO === 'vod-delay' ? '6000' : '0',
      },
    },
  );

  const page = await findPage();
  ws = new WebSocket(page.webSocketDebuggerUrl);
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    else events.push(m);
  };
  await new Promise((r) => { ws.onopen = r; });
  await send('Runtime.enable');
  await send('Page.enable');

  await wait(2500);

  if (SCENARIO === 'login') {
    console.log('\nSzenario: Login mit gespeicherten Zugängen');
    const v = await json(`({
      rows: document.querySelectorAll('.saved-account-row').length,
      activeTab: document.querySelector('.login-tab.active')?.textContent || null,
      form: !!document.querySelector('.login-form'),
    })`);
    check('gespeicherte Zugänge werden direkt gelistet', v.rows === 2 && v.form === false, JSON.stringify(v));
    check('aktiver Tab ist "Gespeicherte"', v.activeTab === 'Gespeicherte', String(v.activeTab));
    const logo = await json(`({
      text: document.querySelector('.login-logo')?.textContent.trim() || null,
      svg: !!document.querySelector('.login-logo svg'),
    })`);
    check('Login zeigt Nightwave mit Logo', logo.text === 'Nightwave' && logo.svg, JSON.stringify(logo));
  }

  if (SCENARIO === 'live-restore') {
    console.log('\nSzenario: Persistiertes Land wird beim Start wiederhergestellt');
    await wait(2000);
    if (process.env.TEST_PREFIXED === '0') {
      // Ohne Länderpräfixe landen alle Kanäle in einem Eimer, countryIndex.enabled
      // ist false und das gemerkte 'DE' im Store ist gegenstandslos. Geprüft wird
      // dann der sinnvolle Rückfall: direkt die Kanalliste, keine Breadcrumb, kein
      // hängengebliebenes Land — nicht das Länderverhalten, das es hier nicht gibt.
      // Erste Ebene ist dann die Kategorienliste.
      const plain = await json(`({
        crumb: document.querySelector('.crumb')?.textContent || null,
        countryItems: document.querySelectorAll('.country-item').length,
        categoryItems: document.querySelectorAll('.category-item').length,
        rows: document.querySelectorAll('.channel-item:not(.category-item)').length,
      })`);
      check('ohne Präfixe ignoriert der Start das gemerkte Land',
        plain.countryItems === 0 && plain.categoryItems > 0 && plain.rows === 0 && plain.crumb === null,
        JSON.stringify(plain));
    } else {
      const restored = await json(`({
        crumb: document.querySelector('.crumb')?.textContent || null,
        countryItems: document.querySelectorAll('.country-item').length,
        names: [...document.querySelectorAll('.category-item .channel-name')].map(e => e.textContent),
      })`);
      check('Start restauriert das gemerkte Land statt der Länderliste',
        restored.countryItems === 0 && restored.crumb === 'Alle Länder›Deutschland',
        JSON.stringify(restored));
      check('Start zeigt die Kategorien des gemerkten Landes',
        restored.names[0] === 'Alle' && restored.names.includes('Sport'),
        JSON.stringify(restored.names));
    }
  }

  if (SCENARIO === 'vod-delay') {
    console.log('\nSzenario: "Weiter" in der Ladephase der Filme');
    if (process.env.TEST_PREFIXED === '0') {
      console.log('  SKIP  Weiter in der Ladephase — TEST_PREFIXED=0, keine Länderebene');
    } else {
      // Ohne geladene Filme ist die Kategorienliste die erste Ebene, "Weiter"
      // steht darin. Nach dem Laden gibt es die Länderebene: der alte Klick
      // darf keine leere Liste "…›Weiter" hinterlassen.
      await ev(`[...document.querySelectorAll('.category-item')]
        .find(e => e.querySelector('.channel-name')?.textContent === 'Weiter').click()`);
      const loaded = await waitUntil(
        () => json(`({
          crumb: document.querySelector('.crumb')?.textContent || null,
          cats: [...document.querySelectorAll('.category-item .channel-name')].map(e => e.textContent),
        })`),
        (v) => v.cats.includes('NETFLIX MOVIES'), 10000);
      check('Weiter aus der Ladephase endet in der Kategorienliste des Landes',
        loaded.crumb === 'Alle Länder›Deutschland' && !loaded.cats.includes('Weiter'), JSON.stringify(loaded));
    }
  }

  if (SCENARIO === 'live-restore-channel') {
    console.log('\nSzenario: Wiederhergestellter Kanal zieht das Land mit');
    await wait(2000);
    const read = () => json(`({
      crumb: document.querySelector('.crumb')?.textContent || null,
      active: document.querySelector('.channel-item.active .channel-name')?.textContent || null,
      tag: document.querySelector('.live-tag-text')?.textContent || null,
    })`);
    if (process.env.TEST_PREFIXED === '0') {
      // Ohne Länderebene gibt es nichts zu synchronisieren — geprüft wird nur,
      // dass der gemerkte Kanal überhaupt anläuft.
      const plain = await waitUntil(read, (v) => v.active === 'Kanal 7', 5000);
      check('ohne Präfixe läuft der gemerkte Kanal ohne Land an',
        plain.crumb === 'Alle Kategorien›Alle' && plain.active === 'Kanal 7', JSON.stringify(plain));
    } else {
      const restored = await waitUntil(
        read, (v) => /Frankreich/.test(v.crumb || '') && v.active === 'Kanal 7', 5000);
      check('Start synchronisiert das Land mit dem wiederhergestellten Kanal',
        restored.crumb === 'Alle Länder›Frankreich›Alle' && restored.active === 'Kanal 7' &&
        /Kanal 7$/.test(restored.tag || ''), JSON.stringify(restored));
      // Und der Store zieht nach, damit der Widerspruch nicht den nächsten Start überlebt.
      const persisted = await ev(`window.iptv.storeGet('lastCountry')`);
      check('das nachgezogene Land landet auch im Store', persisted === 'FR', String(persisted));
    }
  }

  if (SCENARIO === 'live') {
    console.log('\nSzenario: Angemeldet, Live-Modus');
    await wait(1500);

    const brand = await json(`({
      text: document.querySelector('.tb-logo')?.textContent.trim() || null,
      svg: !!document.querySelector('.tb-logo svg'),
      title: document.title,
    })`);
    check('Navbar zeigt Nightwave mit Logo', brand.text === 'Nightwave' && brand.svg, JSON.stringify(brand));
    check('Seitentitel ist Nightwave', brand.title === 'Nightwave', brand.title);

    // Länderebene: erst das Land wählen. Nur vorhanden, wenn die Testdaten
    // Länderpräfixe tragen (TEST_PREFIXED !== '0') — ohne Präfixe zeigt die
    // Sidebar sofort die Kanalliste, und dieser ganze Block entfällt.
    // Der Schalter kommt bewusst aus der Umgebungsvariable, nicht aus einer
    // DOM-Probe: eine Probe wäre aus dem Verhalten abgeleitet, das der Block
    // selbst prüfen soll — regrediert die Länderebene (oder rendert sie nur
    // langsamer als der feste wait(1500) oben), würde eine Probe die Prüfungen
    // klanglos überspringen statt sie fehlschlagen zu lassen, und die Suite
    // würde trotzdem grün "N/N Checks bestanden" melden.
    const expectCountryLevel = process.env.TEST_PREFIXED !== '0';

    const readGuide = () => json(`({
      open: !!document.querySelector('.epg-grid-panel'),
      rows: document.querySelectorAll('.epg-grid-row').length,
      sub: document.querySelector('.epg-grid-sub')?.textContent || '',
    })`);

    if (expectCountryLevel) {
      check('Länderebene ist vorhanden',
        (await ev(`document.querySelectorAll('.country-item').length`)) > 0);

      const countries = await json(`[...document.querySelectorAll('.country-item .channel-name')].map(e => e.textContent)`);
      check('Länderliste erscheint zuerst',
        countries.includes('Deutschland') && countries.includes('USA') && countries.includes('Türkei'),
        JSON.stringify(countries));
      check('keine Kanalliste vor der Landauswahl',
        (await ev(`document.querySelectorAll('.channel-item:not(.country-item)').length`)) === 0);

      // Regression: der Guide darf in der Länderansicht nicht leer sein — das
      // ist der Zustand direkt nach einer Neuinstallation. Er bekam dort
      // `visibleItems`, und das ist ohne gewähltes Land []. Ohne Land zeigt er
      // alle Live-Kanäle.
      await key('g');
      const gCountryView = await waitUntil(readGuide, (v) => v.open && v.rows > 0);
      check('Guide zeigt ohne gewähltes Land alle Kanäle',
        gCountryView.open && gCountryView.rows > 0 &&
        Number(gCountryView.sub.replace(/\D/g, '')) === TOTAL_CHANNELS,
        JSON.stringify(gCountryView));
      await key('Escape');
      await waitUntil(readGuide, (v) => !v.open);

      // Knopf und Tastenkürzel müssen übereinstimmen: beides ist in der
      // Länderansicht bedienbar und öffnet denselben Guide.
      await ev(`[...document.querySelectorAll('.tb-pill')].find(b => b.textContent === 'Guide').click()`);
      const gByButton = await waitUntil(readGuide, (v) => v.open && v.rows > 0);
      check('Guide-Knopf und Taste g stimmen überein',
        gByButton.open && gByButton.rows > 0, JSON.stringify(gByButton));
      await key('Escape');
      await waitUntil(readGuide, (v) => !v.open);

      await ev(`[...document.querySelectorAll('.country-item')]
        .find(e => e.textContent.includes('Deutschland')).click()`);
      await wait(700);
      const inCountry = await json(`({
        crumb: document.querySelector('.crumb')?.textContent || null,
        rows: document.querySelectorAll('.channel-item:not(.category-item)').length,
        cats: [...document.querySelectorAll('.category-item .channel-name')].map(e => e.textContent),
      })`);
      check('Breadcrumb zeigt das Land', /Deutschland/.test(inCountry.crumb || ''), String(inCountry.crumb));
      check('Land öffnet die Kategorienliste',
        inCountry.cats.includes('Sport') && !inCountry.cats.some((c) => c.includes('|')) &&
        !inCountry.cats.includes('Weiter') && !inCountry.cats.includes('Favoriten') && inCountry.rows === 0,
        JSON.stringify(inCountry));

      await pick('Sport');
      const inCategory = await json(`({
        crumb: document.querySelector('.crumb')?.textContent || null,
        names: [...document.querySelectorAll('.channel-name')].slice(0, 3).map(e => e.textContent),
        setsize: Number(document.querySelector('.channel-item')?.getAttribute('aria-setsize') || 0),
      })`);
      check('Kategorie zeigt nur ihre Sender',
        inCategory.crumb === 'Alle Länder›Deutschland›Sport' &&
        inCategory.names.length > 0 && inCategory.names.every((n) => /Kanal \d+/.test(n)) &&
        inCategory.setsize === Math.floor(TOTAL_CHANNELS / 12),
        JSON.stringify(inCategory));

      await ev(`[...document.querySelectorAll('.crumb-back')].find(b => b.textContent === 'Deutschland').click()`);
      await wait(500);
      check('Breadcrumb-Land führt zur Kategorienliste',
        (await ev(`document.querySelectorAll('.category-item').length`)) > 0 &&
        (await crumb()) === 'Alle Länder›Deutschland');

      await pick('Sport');
      await key('Escape');
      await wait(500);
      check('Esc: Liste → Kategorienliste',
        (await ev(`document.querySelectorAll('.category-item').length`)) > 0 &&
        (await crumb()) === 'Alle Länder›Deutschland');
      await key('Escape');
      await wait(500);
      check('Esc: Kategorienliste → Länderliste',
        (await ev(`document.querySelectorAll('.country-item').length`)) > 0 &&
        (await ev(`window.iptv.storeGet('lastCountry')`)) == null);

      // Globale Suche bleibt aus der Länderliste heraus erreichbar
      await ev(`(() => {
        const inp = document.querySelector('.search-input');
        const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        set.call(inp, 'Kanal 7'); inp.dispatchEvent(new Event('input', { bubbles: true }));
      })()`);
      await wait(900);
      check('globale Suche funktioniert aus der Länderliste',
        (await ev(`!!document.querySelector('.search-results')`)) === true);
      await key('Escape');
      await wait(500);

      // Zurück in ein Land für die folgenden Prüfungen
      await ev(`[...document.querySelectorAll('.country-item')]
        .find(e => e.textContent.includes('Deutschland')).click()`);
      await wait(700);
    } else {
      console.log('  SKIP  Länderebene-Prüfungen — TEST_PREFIXED=0, kein Länderlevel erwartet');
    }

    const catView = await json(`({
      names: [...document.querySelectorAll('.category-item .channel-name')].map(e => e.textContent),
      alle: document.querySelector('.category-item .country-count')?.textContent || '',
      topButtons: document.querySelectorAll('.sidebar-top button').length,
      footer: document.querySelector('.sidebar-footer span')?.textContent || '',
    })`);
    const alleCount = Number(catView.alle.replace(/\D/g, ''));
    check('Kategorienliste: "Alle" oben, einmal, mit Anzahl',
      JSON.stringify(catView.names) === '["Alle","Doku","Sport"]' && catView.topButtons === 0 &&
      alleCount === (expectCountryLevel ? Math.floor(TOTAL_CHANNELS / 4) : TOTAL_CHANNELS),
      JSON.stringify(catView));
    check('Fußzeile der Kategorienliste zählt die Kategorien', catView.footer === '2 Kategorien', catView.footer);

    // Der Guide darf in der Kategorienliste nicht leer sein (visibleItems ist dort []).
    await key('g');
    const gCategoryView = await waitUntil(readGuide, (v) => v.open && v.rows > 0);
    check('Guide zeigt in der Kategorienliste alle Kanäle',
      gCategoryView.open && gCategoryView.rows > 0 &&
      Number(gCategoryView.sub.replace(/\D/g, '')) === TOTAL_CHANNELS, JSON.stringify(gCategoryView));
    await key('Escape');
    await waitUntil(readGuide, (v) => !v.open);

    await pick('Alle');

    check('Player ist gemountet', (await ev(`!!document.querySelector('video.video-el')`)) === true);

    const names = await json(`[...document.querySelectorAll('.channel-name')].slice(0, 2).map(e => e.textContent)`);
    await ev(`document.querySelectorAll('.channel-item')[1].click()`);
    await wait(600);
    const sel = await ev(`document.querySelector('.channel-item.active .channel-name')?.textContent || null`);
    check('Kanalauswahl markiert die Zeile', sel === names[1], `${sel} erwartet ${names[1]}`);

    await ev(`(() => {
      const inp = document.querySelector('.search-input');
      const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      set.call(inp, 'Kanal 7'); inp.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await wait(900);
    const during = await json(`({
      results: !!document.querySelector('.search-results'),
      video: !!document.querySelector('video.video-el'),
    })`);
    check('Suche beendet die Wiedergabe nicht', during.results && during.video, JSON.stringify(during));
    const nameColor = await ev(`(() => { const e = document.querySelector('.result-name'); return e ? getComputedStyle(e).color : null; })()`);
    check('Treffernamen in Textfarbe', nameColor === 'rgb(236, 236, 239)', String(nameColor));

    await key('Escape');
    await wait(600);
    check('Esc verlässt die Suche', (await ev(`!document.querySelector('.search-results')`)) === true);

    // Suche gilt nur für den aktiven Modus
    const setSearch = (q) => ev(`(() => {
      const inp = document.querySelector('.search-input');
      const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      set.call(inp, ${JSON.stringify(q)}); inp.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    const pill = (label) => ev(`[...document.querySelectorAll('.tb-pill')].find(b => b.textContent === ${JSON.stringify(label)}).click()`);
    const placeholders = {};
    for (const [label, key] of [['Filme', 'movies'], ['Serien', 'series'], ['Live', 'live']]) {
      await pill(label);
      await wait(400);
      placeholders[key] = await ev(`document.querySelector('.search-input').placeholder`);
    }
    check('Platzhalter passt zum Modus',
      placeholders.live === 'Sender suchen…' && placeholders.movies === 'Filme suchen…' && placeholders.series === 'Serien suchen…',
      JSON.stringify(placeholders));

    await setSearch('Test');
    await waitUntil(() => ev(`!!document.querySelector('.search-results')`), (v) => v === true);
    await wait(400);
    check('Live-Suche findet keine Filme/Serien',
      (await ev(`document.querySelectorAll('.result-card').length`)) === 0 &&
      (await ev(`!!document.querySelector('.search-results-empty')`)) === true);
    await key('Escape');
    await wait(400);

    await pill('Filme');
    await wait(500);
    await setSearch('Kanal');
    await waitUntil(() => ev(`!!document.querySelector('.search-results')`), (v) => v === true);
    await wait(400);
    const movieHitsForChannel = await ev(`document.querySelectorAll('.result-card').length`);
    await setSearch('Testfilm');
    await wait(600);
    const movieSearch = await json(`({
      cards: document.querySelectorAll('.result-card').length,
      heads: [...document.querySelectorAll('.result-section-head')].map(e => e.textContent),
    })`);
    check('Filme-Suche findet nur Filme',
      movieHitsForChannel === 0 && movieSearch.cards === 1 &&
      movieSearch.heads.length === 1 && movieSearch.heads[0].startsWith('FILME'),
      JSON.stringify({ movieHitsForChannel, ...movieSearch }));
    await key('Escape');
    await wait(400);
    await pill('Live');
    await wait(500);
    await pick('Alle');

    await ev(`[...document.querySelectorAll('.tb-icon-pill')].find(b => b.textContent === '⚙').click()`);
    await wait(500);
    const sOpen = await ev(`!!document.querySelector('.settings-box')`);
    await key('Escape');
    await wait(500);
    check('Esc schließt Einstellungen', sOpen === true && (await ev(`!document.querySelector('.settings-box')`)) === true);

    await ev(`[...document.querySelectorAll('.tb-icon-pill')].find(b => b.textContent === '＋').click()`);
    await wait(400);
    const mOpen = await ev(`!!document.querySelector('.tb-menu')`);
    await ev(`document.querySelector('.sidebar').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))`);
    await wait(400);
    check('Quellen-Menü schließt bei Klick daneben',
      mOpen === true && (await ev(`!document.querySelector('.tb-menu')`)) === true);

    // TV-Guide: fenstert die Kanalzeilen genau wie die Sidebar-Kanalliste statt
    // sie bei ROW_CAP zu kappen (Task 5), und löst die Sendungen nur für das
    // Fenster auf — sonst kostet das Öffnen bei großen Playlists Sekunden
    // synchroner Arbeit auf dem Renderer-Thread, auf dem auch das Video läuft.
    const guideStart = Date.now();
    await key('g');
    const guide = await waitUntil(
      () => json(`({
        open: !!document.querySelector('.epg-grid-panel'),
        rows: document.querySelectorAll('.epg-grid-row').length,
        progs: document.querySelectorAll('.epg-grid-prog').length,
        live: document.querySelectorAll('.epg-grid-prog.live').length,
        trackW: parseInt(document.querySelector('.epg-grid-track')?.style.width || '0'),
        more: !!document.querySelector('.epg-grid-more'),
      })`),
      (v) => v.open && v.rows > 0 && v.progs > 0,
      15000, // großzügig: der Messwert selbst soll im Detail stehen, nicht abgeschnitten werden
    );
    const guideMs = Date.now() - guideStart;
    check('Guide rendert gefenstert statt gedeckelt',
      guide.open && guide.rows > 0 && guide.rows < 80 && !guide.more, JSON.stringify(guide));
    check('Guide rendert Sendungsblöcke aus dem EPG',
      guide.progs > guide.rows && guide.live > 0 && guide.trackW > 0, JSON.stringify(guide));
    check(`Guide öffnet in unter ${GUIDE_BUDGET_MS} ms`, guideMs < GUIDE_BUDGET_MS,
      `${guideMs} ms bei ${TOTAL_CHANNELS} Kanälen`);

    // Beim Scrollen darf die Track-Breite nicht springen: sie kommt aus dem EPG,
    // nicht aus den gerade sichtbaren Zeilen.
    await ev(`(() => { const s = document.querySelector('.epg-grid-scroll'); s.scrollTop = s.scrollHeight; })()`);
    await wait(400);
    const guideScrolled = await json(`({
      rows: document.querySelectorAll('.epg-grid-row').length,
      trackW: parseInt(document.querySelector('.epg-grid-track')?.style.width || '0'),
    })`);
    check('Track-Breite bleibt beim Scrollen im Guide stabil',
      guideScrolled.rows > 0 && guideScrolled.trackW === guide.trackW,
      `${guide.trackW} → ${guideScrolled.trackW}`);
    await key('Escape');
    await wait(500);

    // Virtualisierung: alles erreichbar, aber nicht alles im DOM.
    // Die Gesamtzahl wird aus aria-setsize gelesen statt aus TEST_CHANNELS —
    // so gelten diese Prüfungen unverändert weiter, sobald Task 4 ein Land
    // vorfiltert und die Liste nur noch einen Teil der Kanäle enthält.
    const domRows = await ev(`document.querySelectorAll('.channel-item').length`);
    const setsize = await ev(`Number(document.querySelector('.channel-item')?.getAttribute('aria-setsize') || 0)`);
    check('Liste rendert nur ein Fenster', domRows > 0 && domRows < 80 && setsize > domRows,
      `${domRows} von ${setsize} Zeilen im DOM`);
    check('kein "+ N weitere" mehr', (await ev(`!document.querySelector('.channel-more')`)) === true);

    await ev(`(() => { const l = document.querySelector('.channel-list'); l.scrollTop = l.scrollHeight; })()`);
    const lastPos = await waitUntil(
      () => ev(`Number([...document.querySelectorAll('.channel-item')].pop()?.getAttribute('aria-posinset') || 0)`),
      (v) => v === setsize,
    );
    check('Scrollen ans Ende zeigt die letzte Zeile', lastPos === setsize, `${lastPos} von ${setsize}`);

    // Regression: ein Favoriten-Klick darf die Liste nicht zum laufenden Kanal
    // zurückreißen. App baut `visibleItems` neu, sobald sich `favorites` ändert,
    // und die frische Array-Identität feuerte den scrollToIndex-Effekt der
    // Sidebar erneut. Die Liste steht hier von der Prüfung darüber noch ganz
    // unten, der laufende Kanal ist Position 2.
    const scrollBeforeFav = await ev(`document.querySelector('.channel-list').scrollTop`);
    await ev(`document.querySelector('.channel-item .fav-btn').click()`);
    await wait(800);
    const afterFav = await json(`({
      scrollTop: document.querySelector('.channel-list').scrollTop,
      stars: document.querySelectorAll('.fav-btn.fav-on').length,
    })`);
    check('Favoriten-Klick lässt die Scrollposition stehen',
      scrollBeforeFav > 0 && afterFav.scrollTop === scrollBeforeFav && afterFav.stars > 0,
      `scrollTop ${scrollBeforeFav} → ${afterFav.scrollTop}, ${afterFav.stars} Sterne`);
    // Favorit zurücknehmen, damit die folgenden Prüfungen denselben Zustand wie
    // vorher sehen (der Favoriten-Eintrag der Länderliste hängt daran).
    await ev(`document.querySelector('.fav-btn.fav-on')?.click()`);
    await wait(400);

    // Regression: schrumpft die Liste (Kategoriewechsel), während weit gescrollt
    // wurde, darf das Fenster nicht in einer leeren Lücke hängen bleiben — genau
    // das passiert, sobald Task 4 einen Länderfilter über eine tief gescrollte
    // Liste legt. Die Kanalliste ist hier noch von der vorigen Prüfung ganz nach
    // unten gescrollt; "Sport" hat ein Drittel der Einträge von "Alle".
    await key('Escape');
    await pick('Sport');
    await waitUntil(
      () => ev(`document.querySelectorAll('.channel-item').length`),
      (n) => n > 0,
      1500,
    );
    const ROW_HEIGHT = 54; // wie in Sidebar.jsx — gemessene Zeilenhöhe, siehe Task-3-Entscheidung
    const afterShrink = await json(`(() => {
      const l = document.querySelector('.channel-list');
      const items = document.querySelectorAll('.channel-item');
      const first = l.firstElementChild;
      const topSpacerPx = (first && first.classList.contains('vspacer')) ? (parseInt(first.style.height) || 0) : 0;
      return { rows: items.length, newSetsize: Number(items[0]?.getAttribute('aria-setsize') || 0), topSpacerPx };
    })()`);
    check('Kategoriewechsel bei tiefem Scroll zeigt Zeilen statt Leerraum',
      afterShrink.rows > 0 && afterShrink.topSpacerPx <= afterShrink.newSetsize * ROW_HEIGHT,
      JSON.stringify(afterShrink));

    // Regression: Klick und Pfeiltaste bleiben in der Kategorie (selectChannel
    // setzte bisher bei jeder Auswahl zurück). "Sport" ist von oben noch offen.
    await ev(`document.querySelectorAll('.channel-item')[0].click()`);
    await wait(500);
    const crumbAfterClick = await crumb();
    await ev(`document.activeElement.blur()`);
    await key('ArrowDown');
    await wait(400);
    const afterArrow = await json(`({
      crumb: document.querySelector('.crumb')?.textContent || null,
      active: document.querySelector('.channel-item.active .channel-name')?.textContent || null,
    })`);
    check('Kanalauswahl und Pfeiltaste bleiben in der Kategorie',
      /›Sport$/.test(crumbAfterClick || '') && /›Sport$/.test(afterArrow.crumb || '') && afterArrow.active !== null,
      JSON.stringify({ crumbAfterClick, afterArrow }));

    // Treffer aus einer anderen Kategorie: sichtbare, markierte Zeile in "Alle".
    // Kanal 8 ist Doku, geöffnet ist Sport.
    await setSearch('Kanal 8');
    await waitUntil(() => ev(`!!document.querySelector('.search-results')`), (v) => v === true);
    await ev(`[...document.querySelectorAll('.result-card')]
      .find(c => c.querySelector('.result-name')?.textContent === 'Kanal 8')?.click()`);
    const afterOtherCategory = await waitUntil(
      () => json(`({
        crumb: document.querySelector('.crumb')?.textContent || null,
        active: document.querySelector('.channel-item.active .channel-name')?.textContent || null,
      })`),
      (v) => v.active === 'Kanal 8',
    );
    check('Treffer aus anderer Kategorie öffnet "Alle"',
      /›Alle$/.test(afterOtherCategory.crumb || '') && afterOtherCategory.active === 'Kanal 8',
      JSON.stringify(afterOtherCategory));
    await waitUntil(
      () => ev(`Number(document.querySelector('.channel-item')?.getAttribute('aria-setsize') || 0)`),
      (v) => v === setsize,
    );

    // Tiefen-Navigation braucht genug Zeilen; mit dem kleinen Standarddatensatz
    // und aktiver Länderfilterung sind es weniger als 321.
    if (setsize > 400) {
      await ev(`(() => { const l = document.querySelector('.channel-list'); l.scrollTop = 0; })()`);
      await waitUntil(
        () => ev(`Number(document.querySelectorAll('.channel-item')[0]?.getAttribute('aria-posinset') || 0)`),
        (v) => v === 1,
      );
      await ev(`document.querySelectorAll('.channel-item')[0].click()`);
      await waitUntil(
        () => ev(`document.querySelector('.channel-item.active')?.getAttribute('aria-posinset') || null`),
        (v) => v === '1',
      );
      await ev(`document.activeElement.blur()`);
      for (let i = 0; i < 320; i++) await key('ArrowDown');
      const pos = await waitUntil(
        () => ev(`Number(document.querySelector('.channel-item.active')?.getAttribute('aria-posinset') || 0)`),
        (v) => v === 321,
      );
      check('Pfeiltasten kommen über Position 300 hinaus', pos === 321, `Position ${pos}`);
    } else {
      console.log(`  SKIP  Pfeiltasten über Position 300 — nur ${setsize} Zeilen, TEST_CHANNELS erhöhen`);
    }

    if (expectCountryLevel) {
      const footer = await ev(`document.querySelector('.sidebar-footer span')?.textContent || ''`);
      const countInCountry = Number(footer.replace(/\D/g, ''));
      check('Fußzeile zählt nur das aktive Land',
        countInCountry > 0 && countInCountry < TOTAL_CHANNELS, `${countInCountry} von ${TOTAL_CHANNELS}`);

      // Das Land gilt in allen Modi: Filme/Serien zeigen es, sofern es dort
      // vorkommt, und merken es auch, wenn nicht.
      const sidebar = () => json(`({
        crumb: document.querySelector('.crumb')?.textContent || null,
        names: [...document.querySelectorAll('.channel-item:not(.category-item):not(.country-item) .channel-name')].map(e => e.textContent),
        cats: [...document.querySelectorAll('.category-item .channel-name')].map(e => e.textContent),
      })`);
      await pill('Filme');
      await wait(500);
      const movieView = await sidebar();
      check('Filme übernimmt das Land und zeigt dessen Kategorien',
        movieView.crumb === 'Alle Länder›Deutschland' && movieView.names.length === 0 &&
        movieView.cats.includes('NETFLIX MOVIES') &&
        !movieView.cats.includes('Weiter') && !movieView.cats.includes('Favoriten'),
        JSON.stringify(movieView));
      await pick('Alle');
      const movieAll = await sidebar();
      check('Filme: "Alle" zeigt alle Titel des Landes',
        movieAll.names.length > 0 && movieAll.names.every((n) => n.startsWith('DE - ')),
        JSON.stringify(movieAll));

      await pill('Live');
      await wait(500);
      check('Breadcrumb ist nach Rückkehr zu Live wieder da',
        /Deutschland/.test((await crumb()) || '') &&
        (await ev(`document.querySelectorAll('.category-item').length`)) > 0);

      await pill('Serien');
      await wait(500);
      const seriesView = await sidebar();
      check('Serien zeigt das gemerkte Land',
        JSON.stringify(seriesView.cats) === '["Alle","GERMANY NETFLIX"]', JSON.stringify(seriesView));
      await pick('GERMANY NETFLIX');
      const seriesList = await sidebar();
      check('Serien: Kategorie zeigt ihre Titel',
        JSON.stringify(seriesList.names) === '["DE - Haustausch (2026) (SE)"]' &&
        seriesList.crumb === 'Alle Länder›Deutschland›GERMANY NETFLIX', JSON.stringify(seriesList));

      await ev(`document.querySelector('.crumb-back').click()`);
      await wait(500);
      const seriesCountries = await json(`[...document.querySelectorAll('.country-item .channel-name')].map(e => e.textContent)`);
      check('Länderliste in Serien',
        seriesCountries.includes('Deutschland') && seriesCountries.includes('Sonstige') &&
        !seriesCountries.includes('Favoriten') &&
        (await ev(`window.iptv.storeGet('lastCountry')`)) == null,
        JSON.stringify(seriesCountries));

      await pill('Live');
      await wait(500);
      await ev(`[...document.querySelectorAll('.country-item')]
        .find(e => e.textContent.includes('Türkei')).click()`);
      await wait(500);
      await pill('Filme');
      await wait(500);
      const noMovies = await json(`({
        items: document.querySelectorAll('.country-item').length,
        crumb: !!document.querySelector('.crumb'),
        weiter: [...document.querySelectorAll('.country-item')].find(e => e.textContent.includes('Weiter'))?.querySelector('.country-count')?.textContent || null,
      })`);
      check('Land ohne Filme zeigt die Länderliste',
        noMovies.items > 0 && noMovies.crumb === false && noMovies.weiter === '1', JSON.stringify(noMovies));

      await pill('Live');
      await wait(500);
      check('gemerktes Land überlebt einen Modus ohne dieses Land',
        /Türkei/.test((await ev(`document.querySelector('.crumb')?.textContent || ''`)) || ''));

      await pill('Filme');
      await wait(500);
      await ev(`[...document.querySelectorAll('.country-item')]
        .find(e => e.textContent.includes('Weiter')).click()`);
      await wait(500);
      const continueView = await sidebar();
      check('Weiter-Eintrag zeigt angefangene Filme',
        /Weiter/.test(continueView.crumb || '') && JSON.stringify(continueView.names) === '["Testfilm"]' &&
        continueView.cats.length === 0,
        JSON.stringify(continueView));

      await pill('Live');
      await wait(500);
      await ev(`[...document.querySelectorAll('.country-item')]
        .find(e => e.textContent.includes('Deutschland')).click()`);
      await wait(500);

      // Regression: ein Live-Treffer aus einem anderen Land muss die Leiste in
      // das Land DES KANALS tragen (Breadcrumb, aktive Zeile, lastCountry).
      // Gesucht wird im ganzen Modus, nicht nur im gewählten Land. "Kanal 7"
      // ist in den Fixtures FR, gewählt ist hier Deutschland. Die Leiste landet
      // in "Alle" des Ziellandes, damit die Zeile sichtbar und markiert ist.
      await setSearch('Kanal 7');
      await waitUntil(() => ev(`!!document.querySelector('.search-results')`), (v) => v === true);
      const heads = await json(`[...document.querySelectorAll('.result-section-head')].map(e => e.textContent.split(' ')[0])`);
      const clickedHit = await ev(`(() => {
        const hit = [...document.querySelectorAll('.result-card')]
          .find(c => c.querySelector('.result-name')?.textContent === 'Kanal 7');
        if (!hit) return false;
        hit.click();
        return true;
      })()`);
      const afterHit = await waitUntil(
        () => json(`({
          crumb: document.querySelector('.crumb')?.textContent || null,
          active: document.querySelector('.channel-item.active .channel-name')?.textContent || null,
          tag: document.querySelector('.live-tag-text')?.textContent || null,
        })`),
        (v) => v.crumb === 'Alle Länder›Frankreich›Alle' && v.active === 'Kanal 7',
      );
      const storedCountry = await waitUntil(() => ev(`window.iptv.storeGet('lastCountry')`), (v) => v === 'FR');
      check('Live-Treffer trägt in das Land des Kanals',
        JSON.stringify(heads) === '["SENDER"]' && clickedHit === true &&
        afterHit.crumb === 'Alle Länder›Frankreich›Alle' && afterHit.active === 'Kanal 7' &&
        /Kanal 7$/.test(afterHit.tag || '') && storedCountry === 'FR',
        JSON.stringify({ heads, afterHit, storedCountry }));

      // Regression: ein Film-Treffer springt nach "Alle" des Landes (nicht in die
      // Kategorienliste), der Titel ist markiert.
      await ev(`[...document.querySelectorAll('.crumb-back')].find(b => b.textContent === 'Alle Länder').click()`);
      await wait(300);
      await ev(`[...document.querySelectorAll('.country-item')]
        .find(e => e.textContent.includes('Deutschland')).click()`);
      await wait(300);
      await pill('Filme');
      await wait(500);
      await pick('NETFLIX MOVIES');
      await setSearch('Street');
      await waitUntil(() => ev(`!!document.querySelector('.search-results')`), (v) => v === true);
      await ev(`[...document.querySelectorAll('.result-card')]
        .find(c => c.querySelector('.result-name')?.textContent === 'DE - Street Fighter (2026)').click()`);
      const afterMovieHit = await waitUntil(
        () => json(`({
          crumb: document.querySelector('.crumb')?.textContent || null,
          active: document.querySelector('.channel-item.active .channel-name')?.textContent || null,
        })`),
        (v) => v.active !== null,
      );
      check('Film-Treffer springt nach "Alle" und markiert den Titel',
        afterMovieHit.crumb === 'Alle Länder›Deutschland›Alle' &&
        afterMovieHit.active === 'DE - Street Fighter (2026)', JSON.stringify(afterMovieHit));

      // Regression: ein per Suche gewählter Sender weit hinten in der Liste muss
      // ins Bild scrollen, auch wenn die Liste im selben Zug erst entsteht
      // (Kategorienliste → "Alle"). Kanal 416 ist der letzte DE-Kanal der 420.
      await pill('Live');
      await wait(500);
      await setSearch('Kanal 416');
      await waitUntil(() => ev(`!!document.querySelector('.search-results')`), (v) => v === true);
      await ev(`[...document.querySelectorAll('.result-card')]
        .find(c => c.querySelector('.result-name')?.textContent === 'Kanal 416').click()`);
      const farHit = await waitUntil(
        () => json(`(() => {
          const row = document.querySelector('.channel-item.active');
          const box = document.querySelector('ul.channel-list')?.getBoundingClientRect();
          const r = row?.getBoundingClientRect();
          return {
            active: row?.querySelector('.channel-name')?.textContent || null,
            // Zeilenmitte im Sichtbereich (die Zeilenhöhen-Schätzung kann um ein paar px abweichen)
            visible: !!(r && box && (r.top + r.bottom) / 2 > box.top && (r.top + r.bottom) / 2 < box.bottom),
          };
        })()`),
        (v) => v.active === 'Kanal 416' && v.visible, 2000);
      check('gesuchter Sender weit hinten wird ins Bild gescrollt',
        farHit.active === 'Kanal 416' && farHit.visible, JSON.stringify(farHit));

      // Regression: "Weiter" wird beim Länderwechsel aufgefrischt. Der Verlauf
      // ändert sich hier von außen (wie beim Zu-Ende-Schauen), die Liste muss
      // beim Öffnen von "Weiter" den neuen Stand zeigen statt des alten.
      await pill('Filme');
      await wait(500);
      await ev(`[...document.querySelectorAll('.crumb-back')].find(b => b.textContent === 'Alle Länder').click()`);
      await wait(300);
      await ev(`window.iptv.storeSet('watchHistory', {})`);
      await ev(`[...document.querySelectorAll('.country-item')]
        .find(e => e.textContent.includes('Weiter')).click()`);
      const refreshed = await waitUntil(
        () => json(`({
          weiterItem: [...document.querySelectorAll('.country-item')].some(e => e.textContent.includes('Weiter')),
          names: [...document.querySelectorAll('.channel-item:not(.category-item):not(.country-item) .channel-name')].map(e => e.textContent),
        })`),
        (v) => v.names.length === 0, 2000);
      check('Weiter zeigt nach Verlaufsänderung den neuen Stand',
        refreshed.names.length === 0 && refreshed.weiterItem === false, JSON.stringify(refreshed));
    } else {
      console.log('  SKIP  Fußzeile zählt nur das aktive Land — TEST_PREFIXED=0, kein Länderlevel erwartet');
    }
  }

  if (SCENARIO === 'live' && process.env.TEST_PREFIXED === '0') {
    check('ohne Präfixe keine Länderebene',
      (await ev(`document.querySelectorAll('.country-item').length`)) === 0 &&
      (await ev(`document.querySelectorAll('.channel-item').length`)) > 0);
    await ev(`[...document.querySelectorAll('.tb-pill')].find(b => b.textContent === 'Filme').click()`);
    await wait(500);
    check('ohne Präfixe keine Länderebene in Filme',
      (await ev(`document.querySelectorAll('.country-item').length`)) === 0);
    const noCountryCats = await json(`({
      names: [...document.querySelectorAll('.category-item .channel-name')].map(e => e.textContent),
      crumb: document.querySelector('.crumb')?.textContent || null,
    })`);
    check('ohne Präfixe: Weiter/Favoriten in der Kategorienliste',
      JSON.stringify(noCountryCats.names) === '["Weiter","Alle","Action","NETFLIX MOVIES"]' && noCountryCats.crumb === null,
      JSON.stringify(noCountryCats));
    await pick('Weiter');
    const continueNoCountry = await json(`({
      crumb: document.querySelector('.crumb')?.textContent || null,
      names: [...document.querySelectorAll('.channel-item:not(.category-item) .channel-name')].map(e => e.textContent),
    })`);
    check('ohne Präfixe: Weiter zeigt angefangene Filme',
      continueNoCountry.crumb === 'Alle Kategorien›Weiter' && JSON.stringify(continueNoCountry.names) === '["Testfilm"]',
      JSON.stringify(continueNoCountry));
    await ev(`document.querySelector('.crumb-back').click()`);
    await wait(500);
    await key('Escape');
    await wait(500);
    check('Esc auf der ersten Ebene bleibt stehen',
      (await ev(`document.querySelectorAll('.category-item').length`)) > 0 && (await crumb()) === null);
  }

  const exceptions = events
    .filter((e) => e.method === 'Runtime.exceptionThrown')
    .map((e) => e.params.exceptionDetails.exception?.description || e.params.exceptionDetails.text);
  const consoleErrors = events
    .filter((e) => e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error')
    .map((e) => e.params.args.map((a) => a.value ?? a.description ?? '?').join(' '))
    .filter((m) => !/Failed to load|ERR_|net::|manifestLoadError|bufferStalledError/i.test(m));
  check('keine ungefangenen Exceptions', exceptions.length === 0, exceptions.slice(0, 2).join(' | '));
  check('keine React-Fehler', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
}

// Egal wie der Lauf endet: Electron und der HTTP-Server müssen weg. Ein
// geleaktes Electron hält den Debug-Port 9333, und der nächste Lauf würde sich
// an dessen alten Renderer hängen (siehe debugPortAnswers oben).
let fatal = null;
try {
  await run();
} catch (e) {
  fatal = e;
} finally {
  try { ws?.close(); } catch { /* egal */ }
  child?.kill('SIGKILL');
  server?.close();
}

const failed = results.filter((r) => !r).length;
if (fatal) {
  console.error(`\nAbbruch: ${fatal.message}`);
  console.log(`${results.length - failed}/${results.length} Checks bestanden, bevor der Lauf abbrach`);
  process.exit(1);
}
console.log(`\n${results.length - failed}/${results.length} Checks bestanden`);
process.exit(failed ? 1 : 0);
