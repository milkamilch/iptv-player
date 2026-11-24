// Der Status reist in der Fehlermeldung ('HTTP 513', siehe fetch-text.mjs), weil
// Electron über IPC nur die Meldung weitergibt – oft in "Error invoking remote
// method '…': Error: HTTP 513" verpackt. Am Ende verankert, damit andere Texte nie passen.
export function httpStatusOf(err) {
  const m = /(?:^|: )HTTP (\d{3})$/.exec(err?.message ?? '');
  return m ? Number(m[1]) : null;
}

// Der Text entsteht nur aus der Zahl: so kann er keine Anfrage-URL (mit Zugangsdaten) enthalten.
export function statusMessage(status) {
  return Number.isInteger(status) && status >= 400 ? `Server antwortet mit HTTP ${status}.` : null;
}

// Entscheidung des hls.js-Fehlerhandlers für fatale Netzwerkfehler (Medienfehler bleiben im Player).
// Strings statt hls.js-Konstanten ('networkError', 'manifestLoadError'), damit node --test ohne DOM läuft.
// hls.js hat 5xx am Manifest schon selbst wiederholt und startLoad() lädt ohne Levels nichts:
// mit Status wird das Manifest daher sofort gemeldet, sonst bliebe der Spinner stehen.
export function hlsErrorAction({ type, details, code }, recoveries) {
  const status = statusMessage(code);
  const rejected = status && details === 'manifestLoadError';
  if (type === 'networkError' && recoveries < 4 && !rejected) return { recover: true };
  return { message: status ?? `Stream-Fehler: ${type}` };
}
