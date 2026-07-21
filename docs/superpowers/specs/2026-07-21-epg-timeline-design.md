# EPG TV-Guide Grid (Overlay) — Design

**Datum:** 2026-07-21
**Feature:** Voller TV-Programmführer als Grid-Overlay über dem Player.

## Ziel

Ein klassischer TV-Guide wie beim Receiver: Zeilen = Kanäle, Spalten = Uhrzeit.
Nutzer scrollt durch Kanäle und Zeit und springt per Klick auf eine Sendung zum
Kanal. Ergänzt die bestehende `EPGBar` (die weiterhin „JETZT + kommende" pro
aktivem Kanal zeigt).

## Entscheidungen

- **Anzeige:** Halbtransparentes Overlay über `app-main`. Player läuft im
  Hintergrund weiter.
- **Steuerung:** Neuer Toolbar-Button „Guide". Tastenkürzel `g` (öffnen/toggeln),
  `Esc` (schließen).
- **Umfang:** Genau die aktuell gefilterten Kanäle (aktive Kategorie + Suche aus
  der Sidebar) — kein zusätzlicher State. Keine Virtualisierung (bewusst, YAGNI).
- **Klick auf Sendung:** schaltet auf den Kanal (Player) und schließt das Overlay.

## Aufbau

- **Kanal-Spalte** links, sticky, ~180px: Logo + Name.
- **Zeitachse** oben, sticky: Raster alle 30 Min.
- **Body:** pro Kanal eine Zeile; Sendungen als Blöcke.
  - Pixel-pro-Minute `PPM = 6` → 30 Min = 180px.
  - Blockbreite = Dauer(min) × PPM, Position = (start − windowStart) × PPM.
  - Header + Body teilen sich denselben horizontalen Scrollcontainer.
- **Now-Linie:** vertikaler Marker bei „jetzt", Update alle 30s.
- **„Jetzt"-Button:** scrollt horizontal zur Now-Linie.
- **Kein EPG:** Kanäle ohne Programmdaten zeigen eine leere Zeile mit „Kein EPG".

## Zeitfenster

- Start = jetzt, abgerundet auf die letzte halbe Stunde.
- Nach rechts scrollbar so weit, wie EPG-Daten reichen (Ende = spätestes `stop`
  über alle sichtbaren Kanäle, mind. Start + 6h als Fallback).

## Code-Struktur

- `src/epg.js` **(neu)**: gemeinsame Helper, aus `EPGBar.jsx` extrahiert.
  - `parseXMLTVDate(str)` — XMLTV-Datumsstring → `Date`.
  - `matchProgrammes(epg, channel)` — Matching (tvgId + Name-Fallback),
    liefert nach `startDate` sortierte Programme mit aufgelösten Daten.
- `src/components/EPGGrid.jsx` **(neu)**: das Overlay-Grid.
- `src/App.jsx`: `guideOpen`-State, Overlay-Render, `g`/`Esc`-Keyhandler.
- `src/components/Toolbar.jsx`: „Guide"-Button (Prop `guideOpen`/`onToggleGuide`).
- `src/components/EPGBar.jsx`: nutzt künftig `epg.js` (kein Duplikat mehr).
- `src/App.css`: Grid-Styles im bestehenden dark/minimal Look
  (Variablen aus `:root`).

## Bewusst weggelassen (YAGNI)

Virtualisierung, Tag-Navigation vor/zurück, Programm-Detail-Popup, Aufnahme.
