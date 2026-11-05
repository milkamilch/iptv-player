import test from 'node:test';
import assert from 'node:assert/strict';
import { parseUrlList, urlsOf, failoverOrder, firstWorking, sameAccount, verifyLogin } from './servers.mjs';

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
