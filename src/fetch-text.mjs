// HTTP-Abruf als Text, ohne Electron-Import, damit `node --test` ihn prüfen kann.
// request ist net.request (Electron) bzw. http.request (Test).
// Body als Bytes sammeln und am Ende einmal dekodieren: Chunkweise Dekodierung
// zerlegt Multibyte-UTF-8 an Chunk-Grenzen ("für" wird "f??r").
// strict (Xtream): HTTP >= 400 und ausbleibende Header sind Fehler, damit ein
// toter Server erkennbar ist. Der Body-Download hat bewusst kein Timeout.
export const XTREAM_TIMEOUT_MS = 15000;

export function fetchText(url, { request, strict = false, timeoutMs = XTREAM_TIMEOUT_MS }) {
  return new Promise((resolve, reject) => {
    const req = request(url);
    const chunks = [];
    const timer = strict ? setTimeout(() => {
      req.abort();
      reject(new Error('Zeitüberschreitung'));
    }, timeoutMs) : null;
    req.on('response', (res) => {
      clearTimeout(timer);
      if (strict && res.statusCode >= 400) {
        // Antwort verwerfen: abbrechen, Fehler danach schlucken
        res.on('error', () => {});
        req.abort();
        reject(new Error('HTTP ' + res.statusCode));
        return;
      }
      res.on('data', (chunk) => { chunks.push(Buffer.from(chunk)); });
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
      res.on('error', reject);
    });
    req.on('error', (err) => { clearTimeout(timer); reject(err); });
    req.end();
  });
}
