// Abgelehnte Zugangsdaten (`user_info.auth === 0`) beim Laden der Listen.
// Frei von Electron, damit es per `node --test` prüfbar ist.

// Wortlaut wie beim Login (LoginModal).
export const AUTH_REJECTED = 'Ungültige Zugangsdaten.';

// Der Marker reist als Meldungstext, weil Electron über IPC nur die Meldung
// weitergibt (err.stop geht verloren). Der Text enthält nie URL, Benutzername
// oder Passwort: die stecken in den Abfrage-URLs und Antworten.
export function assertAuthorized(...responses) {
  if (responses.some((r) => r?.user_info?.auth === 0)) throw new Error(AUTH_REJECTED);
}

// Am Ende verankert wie httpStatusOf: passt auf die rohe Meldung und auf den
// IPC-Wrapper "Error invoking remote method '…': Error: …", sonst auf nichts.
export function isAuthRejected(err) {
  return /(?:^|: )Ungültige Zugangsdaten\.$/.test(err?.message ?? '');
}
