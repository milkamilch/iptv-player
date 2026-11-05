import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { fetchText } from './fetch-text.mjs';

// Lokaler Server; handler(req, res) bestimmt die Antwort.
async function withServer(handler, fn) {
  const server = http.createServer(handler);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}/`;
  try {
    await fn(url);
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
}

const opts = { request: http.request };

test('liefert den Body bei 200', async () => {
  await withServer((_req, res) => res.end('hallo für alle'), async (url) => {
    assert.equal(await fetchText(url, { ...opts, strict: true }), 'hallo für alle');
  });
});

test('strict: HTTP 503 lehnt ab und bricht die Anfrage ab', async () => {
  let closed;
  const serverSawClose = new Promise((r) => { closed = r; });
  await withServer((req, res) => {
    res.writeHead(503, { 'content-type': 'text/html' });
    res.write('<html>busy</html>');
    req.socket.on('close', closed);
  }, async (url) => {
    await assert.rejects(fetchText(url, { ...opts, strict: true }), { message: 'HTTP 503' });
    await serverSawClose;
  });
});

test('strict: ausbleibende Header laufen in die Zeitüberschreitung', async () => {
  await withServer(() => {}, async (url) => {
    const t0 = Date.now();
    await assert.rejects(fetchText(url, { ...opts, strict: true, timeoutMs: 200 }), { message: 'Zeitüberschreitung' });
    assert.ok(Date.now() - t0 < 2000);
  });
});

test('ohne strict liefert HTTP 503 den Body wie bisher', async () => {
  await withServer((_req, res) => { res.writeHead(503); res.end('#EXTM3U'); }, async (url) => {
    assert.equal(await fetchText(url, opts), '#EXTM3U');
  });
});

test('strict: Verbindungsabbruch nach 503-Header wirft keine Uncaught Exception', async () => {
  const uncaught = [];
  const onUncaught = (e) => uncaught.push(e);
  process.on('uncaughtException', onUncaught);
  try {
    await withServer((req, res) => {
      res.writeHead(503, { 'content-length': '100' });
      res.write('x');
      setTimeout(() => req.socket.resetAndDestroy(), 20);
    }, async (url) => {
      await assert.rejects(fetchText(url, { ...opts, strict: true }), { message: 'HTTP 503' });
      await new Promise((r) => setTimeout(r, 150));
    });
  } finally {
    process.off('uncaughtException', onUncaught);
  }
  assert.deepEqual(uncaught, []);
});
