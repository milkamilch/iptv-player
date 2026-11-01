# Nightwave

(formerly IPTV Player)

A lightweight desktop IPTV player for **live TV, movies and series** via
**Xtream Codes** (or M3U playlists). Dark, minimalist, futuristic —
a full-screen video feed with floating frosted-glass panels.

> Built with Electron + React. Runs on **Windows, Linux and macOS**.

---

## ✨ Features

- **Live TV** — channels via the Xtream Codes JSON API, sorted by category
- **Movies (VOD)** — with a detail page (poster, plot, year, genre, rating)
- **Series** — detail page with season picker and episode list
- **Country filter** — live, movies and series by country (from the category;
  for movies and series otherwise from the title prefix); the chosen country
  applies in all modes
- **Navigation** — country → category → list; "All" shows everything of a
  country, the breadcrumb and `Esc` go back one level
- **Search** — searches the active mode only (channels, movies or series)
- **EPG / programme guide**
  - Now/Next bar for the current channel (with progress bar)
  - **TV guide** — full time grid of all channels (key `g`)
  - gzipped EPGs and time zones are handled correctly
- **Favorites** for channels, movies **and** series
- **Continue watching** — a "Continue" row with started movies/series; series
  remember the last watched episode (✓ for watched, progress bar)
- **Keyboard control** — `↑`/`↓` to switch channels, Space to play/pause
- **Settings** — start mode, buffer size, custom EPG URL, clear history
- **Auto-updates** — new versions are pulled automatically from GitHub Releases
- **Multiple accounts** — up to 5 saved Xtream accounts (passwords encrypted
  via the OS keyring), auto-login
- **M3U & XMLTV import** — optionally load playlist/EPG from a file or URL
- HLS streaming (`.m3u8`, with reconnect) plus direct VOD containers (`mp4`/`mkv`)

---

## 🧱 Tech stack

| Area | Technology |
|---|---|
| Runtime / shell | [Electron](https://www.electronjs.org/) 42 |
| Build / packaging | [Electron Forge](https://www.electronforge.io/) 7 + [Vite](https://vitejs.dev/) 5 |
| UI | [React](https://react.dev/) 19 |
| Streaming | [hls.js](https://github.com/video-dev/hls.js/) |
| Persistence | [electron-store](https://github.com/sindresorhus/electron-store) |
| Fonts | Space Grotesk + JetBrains Mono (offline via `@fontsource`) |
| Backend source | Xtream Codes API / M3U / XMLTV |

---

## 📦 Installation

### Windows (prebuilt installer)

1. Download the latest **`Nightwave-Setup.exe`** from the
   [Releases page](https://github.com/milkamilch/iptv-player/releases/latest).
2. Double-click → installs the app (Start menu entry, no terminal needed).

> ℹ️ On first launch Windows may show **SmartScreen** ("Unknown
> publisher") because the installer is not code-signed:
> **More info → Run anyway**.

### Linux / macOS

Build from source (see below), or on Linux use the `.deb`/`.rpm` or
`.zip` from `npm run make`.

---

## 🚀 From source

Requires **Node.js 22.12+** (Electron's postinstall fails on Node 20).

```bash
git clone https://github.com/milkamilch/iptv-player.git
cd iptv-player
npm install

# Start the app in development mode
npm start
```

### Building installers / packages

```bash
npm run make
```

Produces in `out/make/`, depending on the platform:

- **Windows** → `Nightwave-Setup.exe` (Squirrel)
- **Linux** → `.deb`, `.rpm`
- **all** → `.zip`

> Windows installers can only be built **on Windows** (or via CI) — see
> below.

---

## 🔧 Usage

After launch, enter your Xtream Codes credentials:

- **Server URL** — e.g. `http://your-provider.example:8080`
- **Username** and **password** from your IPTV provider

The app then loads live channels (immediately) as well as movies and series (in
the background).

### Keyboard shortcuts

| Key | Action |
|---|---|
| `g` | Open/close TV guide (in live mode) |
| `↑` / `↓` | Previous / next channel (live) |
| `Space` | Play / pause |
| `Esc` | Go back one level (guide → search → detail → list → categories → countries) |

---

## 🏗️ Release build (CI)

A GitHub Actions workflow (`.github/workflows/build.yml`) builds the
Windows installer on a real Windows runner and the Linux packages
(`.deb`, `.rpm`, `.zip`) on Ubuntu:

- **Push to `master`** → packages as downloadable **artifacts**
- **Tag `v*`** (e.g. `git tag v1.1.0 && git push origin v1.1.0`) → automatically
  publishes a **GitHub Release** with `Nightwave-Setup.exe` and the Linux packages attached

---

## 📁 Project structure

```
src/
├─ main.js              # Electron main process: window, IPC, Xtream/M3U/XMLTV fetch
├─ preload.js           # secure bridge (window.iptv)
├─ renderer.jsx         # React entry + fonts
├─ App.jsx              # state, navigation, layout
├─ xtream.js            # stream URL helpers (movie/episode)
├─ epg.js               # EPG matching & XMLTV dates
├─ App.css              # "glass" design system
└─ components/
   ├─ LoginModal.jsx    ├─ Toolbar.jsx     ├─ Sidebar.jsx
   ├─ VideoPlayer.jsx   ├─ EPGBar.jsx      ├─ EPGGrid.jsx
   ├─ MovieDetail.jsx   ├─ SeriesDetail.jsx└─ SearchResults.jsx
```

---

## 📄 License

MIT © Lars Wenner
