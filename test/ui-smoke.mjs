// Fährt den gebauten Renderer in Electron hoch und prüft ihn über das
// DevTools-Protokoll. Voraussetzung: `npx vite build --config
// vite.renderer.config.mjs --outDir <dir> --base ./` wurde ausgeführt.
//   SCENARIO=login|live|live-restore npm run test:ui
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const PORT = 9333;
const HTTP_PORT = 8899;
const DIST = process.env.RENDERER_DIST || path.join(process.cwd(), '.vite/renderer-test');
const SCENARIO = process.env.SCENARIO || 'live';

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
  },
  // Deckt das Wiederherstellen eines persistierten Landes beim Start ab:
  // lastCountry sitzt schon im Store, bevor React überhaupt mountet, und
  // muss den Start direkt in dieses Land tragen statt in die Länderliste.
  'live-restore': {
    activeAccount: { baseUrl: 'http://a.example:8080', username: 'anna', password: 'p1' },
    settings: { defaultMode: 'live', hlsBuffer: 'normal', epgUrl: '' },
    lastCountry: 'DE',
  },
};

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml' };

const server = createServer(async (req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
  try {
    const body = await readFile(path.join(DIST, rel));
    res.writeHead(200, { 'Content-Type': MIME[path.extname(rel)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(HTTP_PORT, '127.0.0.1', r));

const child = spawn(
  path.join(process.cwd(), 'node_modules/electron/dist/electron'),
  [path.join(import.meta.dirname, 'fixtures/main.cjs'), '--no-sandbox'],
  {
    stdio: 'ignore',
    env: {
      ...process.env,
      APP_URL: `http://127.0.0.1:${HTTP_PORT}/index.html`,
      TEST_STORE: JSON.stringify(STORES[SCENARIO]),
    },
  },
);

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

const page = await findPage();
const ws = new WebSocket(page.webSocketDebuggerUrl);
const pending = new Map();
const events = [];
let msgId = 0;
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  else events.push(m);
};
function send(method, params = {}) {
  const id = ++msgId;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((r) => pending.set(id, r));
}
await new Promise((r) => { ws.onopen = r; });
await send('Runtime.enable');
await send('Page.enable');

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
}

if (SCENARIO === 'live-restore') {
  console.log('\nSzenario: Persistiertes Land wird beim Start wiederhergestellt');
  await wait(2000);
  const restored = await json(`({
    crumb: document.querySelector('.crumb')?.textContent || null,
    countryItems: document.querySelectorAll('.country-item').length,
    names: [...document.querySelectorAll('.channel-name')].slice(0, 3).map(e => e.textContent),
  })`);
  check('Start restauriert das gemerkte Land statt der Länderliste',
    restored.countryItems === 0 && /Deutschland/.test(restored.crumb || ''),
    JSON.stringify(restored));
  check('nur Sender dieses Landes direkt nach dem Start',
    restored.names.length > 0 && restored.names.every((n) => /Kanal \d+/.test(n)),
    JSON.stringify(restored.names));
}

if (SCENARIO === 'live') {
  console.log('\nSzenario: Angemeldet, Live-Modus');
  await wait(1500);

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

  if (expectCountryLevel) {
    check('Länderebene ist vorhanden',
      (await ev(`document.querySelectorAll('.country-item').length`)) > 0);

    const countries = await json(`[...document.querySelectorAll('.country-item .channel-name')].map(e => e.textContent)`);
    check('Länderliste erscheint zuerst',
      countries.includes('Deutschland') && countries.includes('USA') && countries.includes('Türkei'),
      JSON.stringify(countries));
    check('keine Kanalliste vor der Landauswahl',
      (await ev(`document.querySelectorAll('.channel-item:not(.country-item)').length`)) === 0);

    await ev(`[...document.querySelectorAll('.country-item')]
      .find(e => e.textContent.includes('Deutschland')).click()`);
    await wait(700);
    const inCountry = await json(`({
      crumb: document.querySelector('.crumb')?.textContent || null,
      rows: document.querySelectorAll('.channel-item').length,
      names: [...document.querySelectorAll('.channel-name')].slice(0, 3).map(e => e.textContent),
      chips: [...document.querySelectorAll('.cat-chip')].map(b => b.textContent),
    })`);
    check('Breadcrumb zeigt das Land', /Deutschland/.test(inCountry.crumb || ''), String(inCountry.crumb));
    check('nur Sender dieses Landes', inCountry.rows > 0 && inCountry.names.every((n) => /Kanal \d+/.test(n)),
      JSON.stringify(inCountry.names));
    check('Chips ohne Länderpräfix und ohne Favoriten',
      inCountry.chips.includes('Sport') && !inCountry.chips.some((c) => c.includes('|')) &&
      !inCountry.chips.includes('Favoriten'), JSON.stringify(inCountry.chips));

    await ev(`document.querySelector('.crumb-back').click()`);
    await wait(600);
    check('Breadcrumb führt zurück zur Länderliste',
      (await ev(`document.querySelectorAll('.country-item').length`)) > 0);

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

  const chips = await json(`[...document.querySelectorAll('.cat-chip')].map(b => b.textContent)`);
  check('Kategorie "Alle" nur einmal', chips.filter((c) => c === 'Alle').length === 1, JSON.stringify(chips));

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

  await key('Escape');
  await wait(600);
  check('Esc verlässt die Suche', (await ev(`!document.querySelector('.search-results')`)) === true);

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

  // Regression: schrumpft die Liste (Kategoriewechsel), während weit gescrollt
  // wurde, darf das Fenster nicht in einer leeren Lücke hängen bleiben — genau
  // das passiert, sobald Task 4 einen Länderfilter über eine tief gescrollte
  // Liste legt. Die Kanalliste ist hier noch von der vorigen Prüfung ganz nach
  // unten gescrollt; "Sport" hat ein Drittel der Einträge von "Alle".
  await ev(`[...document.querySelectorAll('.cat-chip')].find(b => b.textContent === 'Sport').click()`);
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

  if (expectCountryLevel) {
    // Regression: eine Kanalauswahl innerhalb desselben Landes darf den
    // aktiven Chip nicht auf "Alle" zurücksetzen (selectChannel rief bisher
    // bei jedem Klick/jeder Pfeiltaste selectCountry mit demselben Code auf,
    // was den Filter unbemerkt aufhob). Der "Sport"-Chip ist von der
    // vorigen Prüfung noch aktiv.
    await ev(`document.querySelectorAll('.channel-item')[0].click()`);
    await wait(500);
    const chipAfterSelect = await ev(`document.querySelector('.cat-chip.active')?.textContent || null`);
    check('Kanalauswahl im selben Land behält den aktiven Chip',
      chipAfterSelect === 'Sport', String(chipAfterSelect));
  }

  // Zurück zu "Alle" — die restlichen Prüfungen erwarten die volle Liste.
  await ev(`[...document.querySelectorAll('.cat-chip')].find(b => b.textContent === 'Alle').click()`);
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
    const totalChannels = Number(process.env.TEST_CHANNELS || 420);
    check('Fußzeile zählt nur das aktive Land',
      countInCountry > 0 && countInCountry < totalChannels, `${countInCountry} von ${totalChannels}`);

    // Regression: die Länderebene ist Live-only. Die Breadcrumb darf nicht
    // nach Filme/Serien durchsickern, aber das gemerkte Land muss beim
    // Zurückwechseln zu Live wieder da sein (nur die Anzeige wird
    // ausgeblendet, activeCountry bleibt erhalten).
    await ev(`[...document.querySelectorAll('.tb-pill')].find(b => b.textContent === 'Filme').click()`);
    await wait(500);
    check('keine Breadcrumb in Filme', (await ev(`!document.querySelector('.crumb')`)) === true);

    await ev(`[...document.querySelectorAll('.tb-pill')].find(b => b.textContent === 'Live').click()`);
    await wait(500);
    check('Breadcrumb ist nach Rückkehr zu Live wieder da',
      /Deutschland/.test((await ev(`document.querySelector('.crumb')?.textContent || ''`)) || ''));
  } else {
    console.log('  SKIP  Fußzeile zählt nur das aktive Land — TEST_PREFIXED=0, kein Länderlevel erwartet');
  }
}

if (SCENARIO === 'live' && process.env.TEST_PREFIXED === '0') {
  check('ohne Präfixe keine Länderebene',
    (await ev(`document.querySelectorAll('.country-item').length`)) === 0 &&
    (await ev(`document.querySelectorAll('.channel-item').length`)) > 0);
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

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} Checks bestanden`);
ws.close();
child.kill('SIGKILL');
server.close();
process.exit(failed ? 1 : 0);
