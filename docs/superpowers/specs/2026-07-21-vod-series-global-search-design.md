# VOD (Filme), Serien & globale Suche — Design

**Datum:** 2026-07-21
**Feature:** Filme (VOD) und Serien neben Live-TV, plus eine globale Suche über
Sender + Filme + Serien mit nach Typ gruppierten Ergebnissen.

## Navigation & Layout

- **Toolbar:** drei Modus-Tabs `Live | Filme | Serien` + globales Suchfeld.
  Live-spezifische Buttons (M3U/EPG/Programm/Guide) nur im Live-Modus sichtbar.
- **Sidebar:** modus-agnostisch — Kategorien + Item-Liste des aktiven Modus
  (Logo + Name). Bisherige Sidebar-Suche entfällt (globale Suche ersetzt sie).
- **Hauptbereich** (Priorität): globale Suche aktiv → `SearchResults`; sonst
  `detailItem` gesetzt → Detailseite; sonst → `VideoPlayer` (+ EPGBar im Live).

## Daten laden

- Beim Login: Live zuerst (wie bisher, sofort sichtbar). Direkt danach laden
  Filme und Serien im Hintergrund, je mit Loading-Flag pro Tab.
- Globale Suche findet Filme/Serien, sobald geladen; solange noch geladen wird,
  Hinweis „lädt noch…".

## Item-Formate (normalisiert)

- **Channel (live):** `{ id, name, group, tvgId, logo, url, type:'live' }`.
- **Movie:** `{ id, name, group, logo, containerExt, rating, year, type:'movie' }`.
- **Series:** `{ id, name, group, logo, plot, genre, rating, year, type:'series' }`.
- **Episode:** `{ id, name, containerExt, type:'episode' }`.

## Detailseiten

- **MovieDetail:** Poster, Plot, Jahr, Genre, Rating (via `get_vod_info`) +
  „▶ Abspielen".
- **SeriesDetail:** Cover, Plot, Staffel-Auswahl, Episodenliste
  (via `get_series_info`). Klick auf Episode → spielt.

## Globale Suche

- Toolbar-Suchfeld → `SearchResults`-Seite mit Abschnitten
  **SENDER / FILME / SERIEN**, gefiltert per Namensteil (case-insensitive),
  je Sektion begrenzt (z.B. 50) mit Zähler.
- Klick auf Treffer: Sender → Live-Tab + sofort abspielen; Film → Filme-Tab +
  MovieDetail; Serie → Serien-Tab + SeriesDetail. Query wird geleert.

## Abspielen

- `VideoPlayer` unverändert: nicht-`.m3u8`-URLs spielt er direkt (mp4/mkv),
  Resume für nicht-Live bleibt.
- Stream-URLs im Renderer gebaut (`src/xtream.js`):
  - Movie: `${base}/movie/${user}/${pass}/${id}.${ext}`
  - Episode: `${base}/series/${user}/${pass}/${episodeId}.${ext}`

## Code-Struktur

- **main.js / preload:** neue IPC-Handler
  `load-xtream-vod`, `load-xtream-series`, `load-xtream-vod-info`,
  `load-xtream-series-info` (Kategorie-Merge analog `load-xtream-channels`;
  series-info normalisiert zu `{ info, seasons:[{season, episodes:[…]}] }`).
- **src/xtream.js (neu):** Renderer-Helper `movieUrl`, `episodeUrl`.
- **Neue Komponenten:** `MovieDetail.jsx`, `SeriesDetail.jsx`, `SearchResults.jsx`.
- **App.jsx:** `mode`, `movies`/`series` (+ `moviesLoading`/`seriesLoading`),
  `activeGroup` (reset bei Modeswitch), `activePlayable`, `detailItem`,
  `globalQuery`; Navigations-Flows.
- **Toolbar.jsx:** Tabs + globales Suchfeld; Live-Buttons konditional.
- **Sidebar.jsx:** generische Props (`items`, `mode`), Suche entfernt,
  Favoriten-UI nur im Live-Modus.

## Bewusst weggelassen (YAGNI)

Favoriten bleiben Live-only (Cross-Typ-ID-Kollision vermeiden). Kein
Poster-Caching, keine „zuletzt gesehen"-Reihe, kein TMDB.
