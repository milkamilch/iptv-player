# IPTV Player

Ein schlanker Desktop-IPTV-Player für **Live-TV, Filme und Serien** über
**Xtream Codes** (oder M3U-Playlists). Dark, minimalistisch, futuristisch —
Vollbild-Video-Feed mit schwebenden Milchglas-Panels.

> Built with Electron + React. Läuft unter **Windows, Linux und macOS**.

---

## ✨ Funktionen

- **Live-TV** — Kanäle über die Xtream-Codes-JSON-API, nach Kategorien sortiert
- **Filme (VOD)** — mit Detailseite (Poster, Plot, Jahr, Genre, Rating)
- **Serien** — Detailseite mit Staffel-Auswahl und Episodenliste
- **Globale Suche** — durchsucht Sender, Filme und Serien gleichzeitig; Treffer
  nach Typ gruppiert
- **EPG / Programmführer**
  - Now/Next-Leiste für den laufenden Kanal (mit Fortschrittsbalken)
  - **TV-Guide** — volles Zeitraster aller Kanäle (Taste `g`)
  - gzip-EPG & Zeitzonen werden korrekt verarbeitet
- **Favoriten** für Kanäle, Filme **und** Serien
- **Weiterschauen** — „Weiter"-Reihe mit angefangenen Filmen/Serien; Serien merken
  sich die zuletzt gesehene Episode (✓ für gesehen, Fortschrittsbalken)
- **Tastatur-Steuerung** — `↑`/`↓` Kanalwechsel, Leertaste Play/Pause
- **Einstellungen** — Start-Modus, Puffergröße, eigene EPG-URL, Verlauf löschen
- **Auto-Updates** — neue Versionen werden automatisch aus den GitHub-Releases gezogen
- **Mehrere Zugänge** — bis zu 5 gespeicherte Xtream-Accounts (Passwörter per
  OS-Keyring verschlüsselt), Auto-Login
- **M3U- & XMLTV-Import** — Playlist/EPG optional aus Datei oder URL laden
- HLS-Streaming (`.m3u8`, mit Reconnect) sowie direkte VOD-Container (`mp4`/`mkv`)

---

## 🧱 Tech-Stack

| Bereich | Technologie |
|---|---|
| Runtime / Shell | [Electron](https://www.electronjs.org/) 42 |
| Build / Packaging | [Electron Forge](https://www.electronforge.io/) 7 + [Vite](https://vitejs.dev/) 5 |
| UI | [React](https://react.dev/) 19 |
| Streaming | [hls.js](https://github.com/video-dev/hls.js/) |
| Persistenz | [electron-store](https://github.com/sindresorhus/electron-store) |
| Fonts | Space Grotesk + JetBrains Mono (offline via `@fontsource`) |
| Backend-Quelle | Xtream Codes API / M3U / XMLTV |

---

## 📦 Installation

### Windows (fertiger Installer)

1. Neuesten **`IPTV-Player-Setup.exe`** von der
   [Releases-Seite](https://github.com/milkamilch/iptv-player/releases/latest)
   herunterladen.
2. Doppelklick → installiert die App (Startmenü-Eintrag, kein Terminal nötig).

> ℹ️ Beim ersten Start zeigt Windows evtl. **SmartScreen** („Unbekannter
> Herausgeber"), da der Installer nicht code-signiert ist:
> **Weitere Informationen → Trotzdem ausführen**.

### Linux / macOS

Aus dem Quellcode bauen (siehe unten) oder unter Linux das `.deb`/`.rpm` bzw.
`.zip` aus `npm run make` verwenden.

---

## 🚀 Aus dem Quellcode

Voraussetzung: **Node.js 20+**.

```bash
git clone https://github.com/milkamilch/iptv-player.git
cd iptv-player
npm install

# App im Entwicklungsmodus starten
npm start
```

### Installer / Pakete bauen

```bash
npm run make
```

Erzeugt in `out/make/` je nach Plattform:

- **Windows** → `IPTV-Player-Setup.exe` (Squirrel)
- **Linux** → `.deb`, `.rpm`
- **alle** → `.zip`

> Windows-Installer lassen sich nur **auf Windows** (oder via CI) bauen — siehe
> unten.

---

## 🔧 Nutzung

Nach dem Start Xtream-Codes-Zugangsdaten eingeben:

- **Server-URL** — z. B. `http://dein-anbieter.example:8080`
- **Benutzername** und **Passwort** vom IPTV-Anbieter

Die App lädt daraufhin Live-Kanäle (sofort) sowie Filme und Serien (im
Hintergrund für die globale Suche).

### Tastenkürzel

| Taste | Aktion |
|---|---|
| `g` | TV-Guide öffnen/schließen (im Live-Modus) |
| `↑` / `↓` | vorheriger / nächster Kanal (Live) |
| `Leertaste` | Play / Pause |
| `Esc` | eine Ebene zurück (Guide → Suche → Detail) |

---

## 🏗️ Release-Build (CI)

Ein GitHub-Actions-Workflow (`.github/workflows/build-windows.yml`) baut den
Windows-Installer auf einem echten Windows-Runner:

- **Push auf `master`** → Installer als herunterladbares **Artefakt**
- **Tag `v*`** (z. B. `git tag v1.1.0 && git push origin v1.1.0`) → veröffentlicht
  automatisch einen **GitHub Release** mit angehängtem `IPTV-Player-Setup.exe`

---

## 📁 Projektstruktur

```
src/
├─ main.js              # Electron-Hauptprozess: Fenster, IPC, Xtream/M3U/XMLTV-Fetch
├─ preload.js           # sichere Bridge (window.iptv)
├─ renderer.jsx         # React-Einstieg + Fonts
├─ App.jsx              # State, Navigation, Layout
├─ xtream.js            # Stream-URL-Helfer (movie/episode)
├─ epg.js               # EPG-Matching & XMLTV-Datum
├─ App.css              # „Glass"-Designsystem
└─ components/
   ├─ LoginModal.jsx    ├─ Toolbar.jsx     ├─ Sidebar.jsx
   ├─ VideoPlayer.jsx   ├─ EPGBar.jsx      ├─ EPGGrid.jsx
   ├─ MovieDetail.jsx   ├─ SeriesDetail.jsx└─ SearchResults.jsx
```

---

## 📄 Lizenz

MIT © Lars Wenner
