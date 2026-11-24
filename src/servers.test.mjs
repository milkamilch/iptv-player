import test from 'node:test';
import assert from 'node:assert/strict';
import { parseUrlList, urlsOf, failoverOrder, firstWorking, sameAccount, verifyLogin, loginApiUrl } from './servers.mjs';

test('normalisiert jede Zeile und ergänzt http://', () => {
  assert.deepEqual(parseUrlList('dead.example:8080\nhttps://b.example/'), ['http://dead.example:8080', 'https://b.example']);
});

test('ignoriert leere Zeilen, Leerraum und Duplikate', () => {
  assert.deepEqual(parseUrlList('a.example\n\n  http://a.example/ \r\nb.example'), ['http://a.example', 'http://b.example']);
});

test('leere Eingabe ergibt keine URL', () => {
  assert.deepEqual(parseUrlList('  \n '), []);
});

test('urlsOf liest die gespeicherte Liste', () => {
  assert.deepEqual(urlsOf({ baseUrl: 'a', baseUrls: ['a', 'b'] }), ['a', 'b']);
});

test('urlsOf: alter Eintrag mit nur baseUrl liefert eine URL', () => {
  assert.deepEqual(urlsOf({ baseUrl: 'a' }), ['a']);
});

test('urlsOf: leere Liste fällt auf baseUrl zurück', () => {
  assert.deepEqual(urlsOf({ baseUrl: 'a', baseUrls: [] }), ['a']);
});

test('aktive URL zuerst, Rest in Listenreihenfolge', () => {
  assert.deepEqual(failoverOrder(['a', 'b', 'c'], 'b'), ['b', 'a', 'c']);
});

test('unbekannte aktive URL lässt die Reihenfolge stehen', () => {
  assert.deepEqual(failoverOrder(['a', 'b', 'c'], 'x'), ['a', 'b', 'c']);
});

test('nimmt die erste funktionierende URL', async () => {
  const calls = [];
  const res = await firstWorking(['a', 'b', 'c'], async (u) => {
    calls.push(u);
    if (u === 'a') throw new Error('tot');
    return 'ok';
  });
  assert.deepEqual(res, { baseUrl: 'b', value: 'ok' });
  assert.deepEqual(calls, ['a', 'b']);
});

test('versucht nach einem Erfolg keine weitere URL', async () => {
  const calls = [];
  await firstWorking(['a', 'b'], async (u) => { calls.push(u); return 1; });
  assert.deepEqual(calls, ['a']);
});

test('bricht bei stop ohne Wechsel ab', async () => {
  const calls = [];
  const err = Object.assign(new Error('auth'), { stop: true });
  await assert.rejects(
    firstWorking(['a', 'b'], async (u) => { calls.push(u); throw err; }),
    (e) => e === err,
  );
  assert.deepEqual(calls, ['a']);
});

test('abgelehnte Zugangsdaten brechen ohne Wechsel ab', async () => {
  const calls = [];
  const err = new Error("Error invoking remote method 'load-xtream-channels': Error: Ungültige Zugangsdaten.");
  await assert.rejects(
    firstWorking(['a', 'b'], async (u) => { calls.push(u); throw err; }),
    (e) => e === err,
  );
  assert.deepEqual(calls, ['a']);
});

test('wirft den letzten Fehler, wenn keine URL geht', async () => {
  await assert.rejects(
    firstWorking(['a', 'b'], async (u) => { throw new Error('tot ' + u); }),
    { message: 'tot b' },
  );
});

test('leere Liste wirft', async () => {
  await assert.rejects(firstWorking([], async () => 1), { message: 'Keine Server-URL.' });
});

test('sameAccount: alter Eintrag und Liste mit derselben URL sind derselbe Zugang', () => {
  assert.equal(sameAccount({ baseUrl: 'a', username: 'u' }, { baseUrl: 'b', baseUrls: ['x', 'a'], username: 'u' }), true);
});

test('sameAccount: anderer Benutzer ist ein anderer Zugang', () => {
  assert.equal(sameAccount({ baseUrl: 'a', username: 'u' }, { baseUrl: 'a', username: 'v' }), false);
});

test('sameAccount: ohne gemeinsame URL ein anderer Zugang', () => {
  assert.equal(sameAccount({ baseUrl: 'a', username: 'u' }, { baseUrl: 'b', username: 'u' }), false);
});

const noJson = () => new Error('Ungültige JSON-Antwort');
const ok = { user_info: { auth: 1 } };

test('Login nimmt die erste URL mit JSON', async () => {
  const calls = [];
  const r = await verifyLogin(['a', 'b'], async (u) => { calls.push(u); return ok; });
  assert.deepEqual(r, { baseUrl: 'a', info: ok });
  assert.deepEqual(calls, ['a']);
});

test('Login: Nicht-JSON vorne ist nur Rückfall, eine spätere JSON-URL gilt', async () => {
  const r = await verifyLogin(['a', 'b'], async (u) => { if (u === 'a') throw noJson(); return ok; });
  assert.deepEqual(r, { baseUrl: 'b', info: ok });
});

test('Login: auth 0 auf einer späteren URL gilt trotz Nicht-JSON davor', async () => {
  await assert.rejects(
    verifyLogin(['a', 'b'], async (u) => { if (u === 'a') throw noJson(); return { user_info: { auth: 0 } }; }),
    (e) => e.stop === true,
  );
});

test('Login: auth 0 bricht ohne weitere URL ab', async () => {
  const calls = [];
  await assert.rejects(
    verifyLogin(['a', 'b'], async (u) => { calls.push(u); return { user_info: { auth: 0 } }; }),
    (e) => e.stop === true,
  );
  assert.deepEqual(calls, ['a']);
});

test('Login: ohne JSON-URL gilt die erste Nicht-JSON-URL mit info null', async () => {
  const r = await verifyLogin(['a', 'dead', 'c'], async (u) => { if (u === 'dead') throw new Error('HTTP 503'); throw noJson(); });
  assert.deepEqual(r, { baseUrl: 'a', info: null });
});

test('Login: nur tote URLs werfen den letzten Fehler', async () => {
  await assert.rejects(
    verifyLogin(['a', 'b'], async (u) => { throw new Error('HTTP ' + u); }),
    { message: 'HTTP b' },
  );
});

test('erkennt das Schema unabhängig von Groß-/Kleinschreibung', () => {
  assert.deepEqual(parseUrlList('HTTP://a.example:8080/\nHttps://b.example'), ['http://a.example:8080', 'https://b.example']);
});

test('schreibt den Host klein, der Pfad bleibt', () => {
  assert.deepEqual(parseUrlList('HTTP://Host.Example:8080/Xtream/\nHost2.Example/Path'), ['http://host.example:8080/Xtream', 'http://host2.example/Path']);
});

test('Zugangsdaten in der URL bleiben unverändert', () => {
  assert.deepEqual(parseUrlList('HTTP://User:Pw@Host.example'), ['http://User:Pw@host.example']);
});

test('@ im Passwort: nur der Host nach dem letzten @ wird klein', () => {
  assert.deepEqual(parseUrlList('HTTP://us:P@SS@Host:8080/A@B'), ['http://us:P@SS@host:8080/A@B']);
});

test('Schreibweisen desselben Hosts sind Duplikate, die erste gewinnt', () => {
  assert.deepEqual(parseUrlList('http://A.example:8080\nHTTP://a.EXAMPLE:8080/\na.example:8080'), ['http://a.example:8080']);
});

test('anderer Pfad oder anderes Schema ist kein Duplikat', () => {
  assert.equal(parseUrlList('a.example/Tv\na.example/tv\nhttps://a.example/tv').length, 3);
});

test('aktive URL in anderer Host-Schreibweise steht vorn, ohne Doppelten', () => {
  assert.deepEqual(failoverOrder(['http://b.example', 'http://Host.example:8080'], 'http://host.example:8080'), ['http://host.example:8080', 'http://b.example']);
});

test('aktive URL mit anderer Pfad-Schreibweise lässt die Reihenfolge stehen', () => {
  const urls = ['http://a.example/Tv', 'http://b.example'];
  assert.deepEqual(failoverOrder(urls, 'http://a.example/tv'), urls);
});

test('sameAccount: alter Eintrag mit gemischter Host-Schreibweise ist derselbe Zugang', () => {
  const neu = { baseUrl: 'http://b.example', baseUrls: ['http://b.example', 'http://host.example:8080'], username: 'u' };
  assert.equal(sameAccount({ baseUrl: 'http://Host.example:8080', username: 'u' }, neu), true);
  assert.equal(sameAccount({ baseUrl: 'http://host.example:8080/Tv', username: 'u' }, { baseUrl: 'http://host.example:8080/tv', username: 'u' }), false);
});

test('Login-Prüfung nutzt getrimmte Zugangsdaten', () => {
  assert.equal(loginApiUrl('http://a.example:8080', ' anna ', ' p1 '), 'http://a.example:8080/player_api.php?username=anna&password=p1');
});

test('Login-Prüfung kodiert Sonderzeichen, Leerzeichen innen bleiben', () => {
  assert.equal(loginApiUrl('http://a', 'an na', 'p&1 x'), 'http://a/player_api.php?username=an%20na&password=p%261%20x');
});

test('sameAccount und failoverOrder werfen nicht bei Eintrag ohne URL', () => {
  assert.equal(sameAccount({ username: 'u' }, { baseUrl: 'a', username: 'u' }), false);
  assert.deepEqual(failoverOrder(['a'], undefined), ['a']);
});
