import test from 'node:test';
import assert from 'node:assert/strict';
import { httpStatusOf, statusMessage, hlsErrorAction } from './http-status.mjs';

test('liest den Status aus der fetchText-Meldung', () => {
  assert.equal(httpStatusOf(new Error('HTTP 513')), 513);
});

test('liest den Status durch den IPC-Wrapper von Electron', () => {
  const e = new Error("Error invoking remote method 'load-xtream-channels': Error: HTTP 513");
  assert.equal(httpStatusOf(e), 513);
});

test('andere Fehler haben keinen Status', () => {
  for (const m of ['Zeitüberschreitung', 'Ungültige JSON-Antwort', 'net::ERR_HTTP2_PROTOCOL_ERROR', 'HTTP 513 und mehr']) {
    assert.equal(httpStatusOf(new Error(m)), null, m);
  }
  assert.equal(httpStatusOf(undefined), null);
  assert.equal(httpStatusOf(null), null);
});

test('nennt den Status im Text', () => {
  assert.equal(statusMessage(513), 'Server antwortet mit HTTP 513.');
  assert.equal(statusMessage(404), 'Server antwortet mit HTTP 404.');
});

test('kein Text ohne Fehlerstatus', () => {
  for (const s of [null, undefined, 0, 200, '513']) assert.equal(statusMessage(s), null, String(s));
});

test('Statustext aus einer Fehlermeldung mit URL enthält weder URL noch Zugangsdaten', () => {
  const err = new Error('GET http://h:8080/player_api.php?username=anna&password=geheim: HTTP 513');
  const text = statusMessage(httpStatusOf(err));
  assert.equal(text, 'Server antwortet mit HTTP 513.');
  for (const s of ['http://', 'anna', 'geheim']) assert.ok(!text.includes(s), s);
});

const net = (details, code) => ({ type: 'networkError', details, fatal: true, code });

test('hls: Manifest mit Status wird sofort gemeldet', () => {
  assert.deepEqual(hlsErrorAction(net('manifestLoadError', 513), 0), { message: 'Server antwortet mit HTTP 513.' });
});

test('hls: Segmentfehler mit Status wird bis zur vierten Wiederholung neu geladen', () => {
  for (const r of [0, 1, 2, 3]) assert.deepEqual(hlsErrorAction(net('fragLoadError', 513), r), { recover: true }, String(r));
});

test('hls: Segmentfehler mit Status nach 4 Wiederholungen nennt den Status', () => {
  assert.deepEqual(hlsErrorAction(net('fragLoadError', 513), 4), { message: 'Server antwortet mit HTTP 513.' });
});

test('hls: Netzwerkfehler ohne Status nach 4 Wiederholungen bleibt Stream-Fehler', () => {
  assert.deepEqual(hlsErrorAction(net('fragLoadError', 0), 4), { message: 'Stream-Fehler: networkError' });
  assert.deepEqual(hlsErrorAction(net('manifestLoadError', undefined), 0), { recover: true });
});
