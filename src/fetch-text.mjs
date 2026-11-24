// HTTP-Abruf als Text, ohne Electron-Import, damit `node --test` ihn prüfen kann.
// request ist net.request (Electron) bzw. http.request (Test).
// Body als Bytes sammeln und am Ende einmal dekodieren: Chunkweise Dekodierung
// zerlegt Multibyte-UTF-8 an Chunk-Grenzen ("für" wird "f??r").
// strict (Xtream): HTTP >= 400 und ausbleibende Header sind Fehler, damit ein
// toter Server erkennbar ist. Der Body-Download hat bewusst kein Timeout.
// signal (optional, AbortSignal): bricht die Anfrage ab, Ablehnung mit ABORTED.
export const XTREAM_TIMEOUT_MS = 15000;
// Erreicht den Renderer nie: Der erste Fehler gewinnt. Enthält bewusst keine URL.
export const ABORTED = 'Abgebrochen';

export function fetchText(url, { request, strict = false, timeoutMs = XTREAM_TIMEOUT_MS, signal }) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new Error(ABORTED)); return; }
    const req = request(url);
    const chunks = [];
    const timer = strict ? setTimeout(() => {
      req.abort();
      reject(new Error('Zeitüberschreitung'));
    }, timeoutMs) : null;
    // Electron meldet abort() ohne error, daher hier ablehnen. Erst ablehnen,
    // dann abort(): ein spätes end liefert so keinen abgeschnittenen Body.
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new Error(ABORTED));
      req.abort();
    }, { once: true });
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

// Wie Promise.all, bricht aber beim ersten Fehler die übrigen Anfragen ab.
// Gemeldet wird der erste Fehler, nicht der Abbruch der anderen.
export async function allOrAbort(tasks) {
  const controller = new AbortController();
  try {
    return await Promise.all(tasks.map((task) => task(controller.signal)));
  } catch (err) {
    controller.abort();
    throw err;
  }
}
