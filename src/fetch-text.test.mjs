import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { EventEmitter } from 'node:events';
import { fetchText, allOrAbort } from './fetch-text.mjs';

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

// Fake-Request wie Electron: abort() meldet nur abort und close, kein error.
function fakeRequest() {
  const req = new EventEmitter();
  req.aborts = 0;
  req.end = () => {};
  req.abort = () => { req.aborts++; req.emit('abort'); req.emit('close'); };
  return req;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('signal: Abbruch vor den Headern lehnt ab, auch ohne error-Ereignis', async () => {
  const req = fakeRequest();
  const controller = new AbortController();
  const p = fetchText('http://x/', { request: () => req, signal: controller.signal });
  controller.abort();
  await assert.rejects(p, { message: 'Abgebrochen' });
  assert.equal(req.aborts, 1);
});

test('signal: Abbruch räumt den strict-Timer ab', async () => {
  const req = fakeRequest();
  const controller = new AbortController();
  const p = fetchText('http://x/', { request: () => req, strict: true, timeoutMs: 100, signal: controller.signal });
  controller.abort();
  await assert.rejects(p, { message: 'Abgebrochen' });
  await wait(250);
  assert.equal(req.aborts, 1);
});

test('signal: Abbruch im Body, ein spätes end löst nicht mehr auf', async () => {
  const req = fakeRequest();
  const res = new EventEmitter();
  res.statusCode = 200;
  const controller = new AbortController();
  const p = fetchText('http://x/', { request: () => req, signal: controller.signal });
  req.emit('response', res);
  res.emit('data', Buffer.from('[{"a":'));
  controller.abort();
  res.emit('end');
  await assert.rejects(p, { message: 'Abgebrochen' });
});

test('signal: bereits abgebrochen startet keine Anfrage', async () => {
  let calls = 0;
  const request = () => { calls++; return fakeRequest(); };
  await assert.rejects(fetchText('http://x/', { request, signal: AbortSignal.abort() }), { message: 'Abgebrochen' });
  assert.equal(calls, 0);
});

test('signal: Abbruch schließt die Verbindung (Node http)', async () => {
  const uncaught = [];
  const onUncaught = (e) => uncaught.push(e);
  process.on('uncaughtException', onUncaught);
  let closed; const serverSawClose = new Promise((r) => { closed = r; });
  let got; const gotRequest = new Promise((r) => { got = r; });
  try {
    await withServer((req, res) => {
      res.writeHead(200);
      res.write('part');
      req.socket.on('close', closed);
      got();
    }, async (url) => {
      const controller = new AbortController();
      const p = fetchText(url, { ...opts, signal: controller.signal });
      await gotRequest;
      await wait(30);
      controller.abort();
      await assert.rejects(p, { message: 'Abgebrochen' });
      await serverSawClose;
      await wait(50);
    });
  } finally {
    process.off('uncaughtException', onUncaught);
  }
  assert.deepEqual(uncaught, []);
});

test('signal: Abbruch nach erfolgreichem Ende ist folgenlos', async () => {
  const uncaught = [];
  const onUncaught = (e) => uncaught.push(e);
  process.on('uncaughtException', onUncaught);
  try {
    await withServer((_req, res) => res.end('ok'), async (url) => {
      const controller = new AbortController();
      assert.equal(await fetchText(url, { ...opts, signal: controller.signal }), 'ok');
      controller.abort();
      await wait(50);
    });
  } finally {
    process.off('uncaughtException', onUncaught);
  }
  assert.deepEqual(uncaught, []);
});

test('allOrAbort: liefert die Ergebnisse in Reihenfolge', async () => {
  let signal;
  const result = await allOrAbort([async (s) => { signal = s; return 'a'; }, async () => 'b']);
  assert.deepEqual(result, ['a', 'b']);
  assert.equal(signal.aborted, false);
});

test('allOrAbort: erster Fehler bricht die anderen ab und wird gemeldet', async () => {
  const unhandled = [];
  const onUnhandled = (e) => unhandled.push(e);
  process.on('unhandledRejection', onUnhandled);
  let signal2;
  try {
    await assert.rejects(allOrAbort([
      async () => { await wait(10); throw new Error('HTTP 513'); },
      (s) => new Promise((_, reject) => {
        signal2 = s;
        s.addEventListener('abort', () => reject(new Error('Abgebrochen')));
      }),
    ]), { message: 'HTTP 513' });
    await wait(50);
  } finally {
    process.off('unhandledRejection', onUnhandled);
  }
  assert.equal(signal2.aborted, true);
  assert.deepEqual(unhandled, []);
});

test('allOrAbort mit fetchText: HTTP 503 bricht den laufenden Nachbarn ab', async () => {
  let closed; const serverSawClose = new Promise((r) => { closed = r; });
  await withServer((req, res) => {
    if (req.url === '/a') { res.writeHead(503); res.end('busy'); return; }
    res.writeHead(200);
    res.write('[');
    req.socket.on('close', closed);
  }, async (url) => {
    await assert.rejects(allOrAbort([
      (s) => fetchText(url + 'a', { ...opts, strict: true, signal: s }),
      (s) => fetchText(url + 'b', { ...opts, strict: true, signal: s }),
    ]), (err) => {
      assert.equal(err.message, 'HTTP 503');
      assert.ok(!err.message.includes('127.0.0.1') && !err.message.includes('http'));
      return true;
    });
    await serverSawClose;
  });
});
