# Tests

- `npm test` — Unit-Tests (`node --test`), prüft `src/country.mjs`.
- `npm run test:ui` — baut den Renderer nach `.vite/renderer-test` und fährt ihn in
  Electron hoch, ferngesteuert über das DevTools-Protokoll.

Der UI-Test braucht ein Display. Unter Linux ohne Desktop:
`xvfb-run -a npm run test:ui`.

## Szenarien (`SCENARIO=…`)

| Wert | Store beim Start | Prüft |
| --- | --- | --- |
| `live` (Standard) | angemeldeter Zugang | Länderebene (Live, Filme, Serien), Kategorien, Suche, Guide, Virtualisierung |
| `login` | zwei gespeicherte Zugänge, nicht angemeldet | Login-Bildschirm mit Zugangsliste |
| `live-restore` | angemeldeter Zugang **plus** `lastCountry: 'DE'` | dass der Start direkt in das gemerkte Land trägt statt in die Länderliste |
| `live-restore-channel` | wie oben, **plus** `lastChannel` = Kanal 7 (FR — widerspricht `lastCountry`) | dass der wiederhergestellte Kanal die Leiste in sein Land zieht und der Store nachgeführt wird |

Die beiden `live-restore*`-Szenarien setzen Länderpräfixe in den Fixtures voraus. Mit
`TEST_PREFIXED=0` gibt es gar keine Länderebene, das gemerkte Land ist dann
gegenstandslos — die Szenarien prüfen in diesem Fall stattdessen den Rückfall (direkt die
Kanalliste, keine Breadcrumb) statt stillschweigend durchzulaufen.

## Schalter

| Variable | Standard | Wirkung |
| --- | --- | --- |
| `TEST_CHANNELS` | `420` | Anzahl der Fixture-Kanäle. Ab `> 400` Kanälen im aktiven Land greift die Tiefen-Navigations-Prüfung (`Pfeiltasten über Position 300`); darunter meldet sie SKIP. Für Virtualisierung und Guide-Budget: `TEST_CHANNELS=20000`. |
| `TEST_PREFIXED` | `1` | `0` erzeugt Kategorien **ohne** Länderpräfix (`Sport` statt `DE \| Sport`) und Film-/Serientitel ohne Präfix (`Street Fighter` statt `DE - Street Fighter`). Damit fällt die Länderebene weg (ein einziger Eimer ⇒ `countryIndex.enabled === false`) und die Sidebar zeigt sofort die Liste. |
| `TEST_EPG_KEYS` | `3000` | Anzahl der XMLTV-Kanalschlüssel im Fixture-EPG (je 8 Sendungen à 90 min, jeder siebte Kanal fehlt absichtlich). Die Kosten des Namens-Fallbacks in `matchProgrammes` sind Kanäle × Schlüssel — ein kleines EPG macht die Guide-Performance-Prüfung stumpf. |
| `RENDERER_DIST` | `.vite/renderer-test` | Verzeichnis des gebauten Renderers. |

Sinnvolle Kombinationen (so laufen sie auch in CI):

```sh
npm run test:ui
TEST_CHANNELS=20000 npm run test:ui
TEST_PREFIXED=0 npm run test:ui
TEST_PREFIXED=0 TEST_CHANNELS=20000 npm run test:ui
SCENARIO=login npm run test:ui
SCENARIO=live-restore npm run test:ui
SCENARIO=live-restore-channel npm run test:ui
```

## Port 9333

Der Test steuert Electron über `--remote-debugging-port=9333`. Antwortet der Port beim
Start schon, bricht der Lauf sofort ab: ein zweites Electron bekommt den Port nicht und
taucht auf `/json` nie auf, der Test würde sich an den Renderer des Vorgängers hängen
(alter Bundle, alter Store) und grün melden. Aufräumen:

```sh
pkill -9 -f "[i]ptv-player/node_modules/electron"
```
