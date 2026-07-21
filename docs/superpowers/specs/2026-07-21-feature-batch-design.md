# Feature-Batch — Design

**Datum:** 2026-07-21
**Umfang:** 8 Features auf einmal, danach neuer Build + Release.

## 1. Typisierte Favoriten (alle Inhaltstypen)
- `favorites`-Store wird von `[id]` auf `["type:id"]` migriert (`live:` als Default
  für Altbestand).
- Favoriten-Stern in der Sidebar für **alle** Modi + Fav-Button in Film-/Serien-Detail.
- Chip **„★ Favoriten"** auch in Filme/Serien (Live hat ihn schon).

## 2. Weiterschauen („Weiter")
- Neuer Store `watchHistory`: keyed nach `movie:<id>` / `episode:<id>`, Wert
  `{ position, duration, updatedAt, card }`. `card` enthält Metadaten + Rebuild-Infos.
- Chip **„▶ Weiter"** vorne in Filme/Serien.
  - Filme: alle Movie-Einträge, neueste zuerst → Klick spielt direkt (Resume).
  - Serien: Episoden-Einträge nach Serie gruppiert (neueste Episode je Serie) →
    Klick setzt die Serie an der letzten Episode fort.

## 3. Serien-Fortschritt
- `watched`-Store: Menge erledigter `episode:<id>` (gesetzt bei „fast zu Ende").
- SeriesDetail: ✓ bei gesehenen Episoden, Fortschrittsbalken bei angefangenen,
  „▶ Fortsetzen SxEy"-Button für die zuletzt angefangene Episode.

## 4. Film-/Serien-Favoriten — ergibt sich aus #1.

## 5. Tastatur-Navigation
- Live: `↑`/`↓` = vorheriger/nächster Kanal (in der aktuellen Liste), schaltet um.
- `Leertaste` = Play/Pause (alle Modi, wenn Video läuft).

## 6. Suche entprellen
- `globalQuery` → `debouncedQuery` (250 ms); Ergebnisseite filtert erst auf dem
  entprellten Wert. Leeren wirkt sofort.

## 7. Kanäle neu laden
- „Neu laden" im ＋-Menü → lädt Kanäle/Filme/Serien/EPG des aktuellen Accounts neu
  (ohne Logout).

## 8. Einstellungen
- Zahnrad-Pille in der Toolbar → `Settings`-Modal. Store `settings`:
  `{ defaultMode, hlsBuffer: 'klein'|'normal'|'groß', epgUrl }`.
  - `defaultMode`: Start-Modus nach Login.
  - `hlsBuffer`: hls.js `maxBufferLength` (klein 15 / normal 30 / groß 120 s).
  - `epgUrl`: optionale eigene XMLTV-URL statt Standard.
  - Button **„Wiedergabe-Verlauf löschen"** (leert `watchHistory` + `watched`).

## 9. Auto-Updates
- `update-electron-app` (update.electronjs.org/milkamilch/iptv-player), nur im
  paketierten Build (`app.isPackaged`), in `main.js`.

## Neue Dateien
`src/progress.js` (History/Watched/Settings-Helfer), `src/components/Settings.jsx`.
