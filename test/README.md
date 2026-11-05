# Tests

- `npm test` — Unit-Tests (`node --test`), prüft `src/country.mjs` und `src/servers.mjs` und `src/fetch-text.mjs`.
- `npm run test:ui` — baut den Renderer nach `.vite/renderer-test` und fährt ihn in
  Electron hoch, ferngesteuert über das DevTools-Protokoll.

Der UI-Test braucht ein Display. Unter Linux ohne Desktop:
`xvfb-run -a npm run test:ui`.

## Szenarien (`SCENARIO=…`)

| Wert | Store beim Start | Prüft |
| --- | --- | --- |
| `live` (Standard) | angemeldeter Zugang | Länder- und Kategorienebene (Live, Filme, Serien), Suche, Guide, Virtualisierung |
| `login` | zwei gespeicherte Zugänge, nicht angemeldet | Login-Bildschirm mit Zugangsliste |
| `failover-login` | leer, Formular wird im Test ausgefüllt; `dead.example:8080` ist tot (`TEST_DEAD_HOSTS`) | dass auth 0 ohne Wechsel „Ungültige Zugangsdaten.“ meldet, nur tote URLs den Fehler zeigen, bei toter erster URL die zweite übernimmt, die ganze Liste samt aktiver URL gespeichert wird und eine Nicht-JSON-URL nur als Rückfall gilt |
| `failover-start` | angemeldeter Zugang (auch in `savedAccounts`, plus ein fremder Zugang) mit toter erster und funktionierender zweiter URL | dass der Start auf die zweite wechselt, Kanäle lädt und die URL in `activeAccount` und im passenden gespeicherten Zugang merkt, der fremde unberührt bleibt |
| `failover-logout` | wie `failover-start`, der Fehler der toten URL kommt erst nach 3 s (`TEST_DEAD_DELAY`) | dass Abmelden während des Wechsels bestehen bleibt |
| `failover-vod` | angemeldeter Zugang mit URLs a, b; Filme auf a tot (`TEST_DEAD_VOD_HOSTS`) | dass die Filme auf b wechseln, die Sitzung b wird und gemerkt ist |
| `live-restore` | angemeldeter Zugang **plus** `lastCountry: 'DE'` | dass der Start direkt in die Kategorienliste des gemerkten Landes trägt statt in die Länderliste |
| `live-restore-channel` | wie oben, **plus** `lastChannel` = Kanal 7 (FR — widerspricht `lastCountry`) | dass der wiederhergestellte Kanal die Leiste in sein Land („Alle“) zieht und der Store nachgeführt wird |
| `live-restore-switch` | angemeldeter Zugang plus `lastChannel` = Kanal 7, dessen Lesen 6 s dauert (`TEST_RESTORE_DELAY`) | dass ein Wechsel nach Filme während des Lesens den Restore abbricht und kein Live-Sender anläuft |
| `live-restore-manual` | wie `live-restore-switch` | dass ein von Hand gewählter Sender (Kanal 8) nach dem Restore weiterläuft statt vom gemerkten ersetzt zu werden |
| `vod-delay` | wie `live`, Start in Filme, Filme laden 6 s verzögert (`TEST_VOD_DELAY`), `lastCountry: 'DE'` | dass „Weiter“, in der Ladephase angeklickt, nach dem Laden in der Kategorienliste des Landes endet statt in einer leeren Liste |

Die `live-restore*`- und `vod-delay`-Szenarien setzen Länderpräfixe in den Fixtures voraus. Mit
`TEST_PREFIXED=0` gibt es gar keine Länderebene, das gemerkte Land ist dann
gegenstandslos — die Szenarien prüfen in diesem Fall stattdessen den Rückfall (Kategorienliste
als erste Ebene bzw. „Alle“ für den Kanal, keine Länder-Breadcrumb) statt stillschweigend durchzulaufen.

## Schalter

| Variable | Standard | Wirkung |
| --- | --- | --- |
| `TEST_CHANNELS` | `420` | Anzahl der Fixture-Kanäle. Ab `> 400` Kanälen im aktiven Land greift die Tiefen-Navigations-Prüfung (`Pfeiltasten über Position 300`); darunter meldet sie SKIP. Für Virtualisierung und Guide-Budget: `TEST_CHANNELS=20000`. |
| `TEST_PREFIXED` | `1` | `0` erzeugt Kategorien **ohne** Länderpräfix (`Sport` statt `DE \| Sport`) und Film-/Serientitel ohne Präfix (`Street Fighter` statt `DE - Street Fighter`). Damit fällt die Länderebene weg (ein einziger Eimer ⇒ `countryIndex.enabled === false`) und die Sidebar beginnt mit der Kategorienliste. |
| `TEST_EPG_KEYS` | `3000` | Anzahl der XMLTV-Kanalschlüssel im Fixture-EPG (je 8 Sendungen à 90 min, jeder siebte Kanal fehlt absichtlich). Die Kosten des Namens-Fallbacks in `matchProgrammes` sind Kanäle × Schlüssel — ein kleines EPG macht die Guide-Performance-Prüfung stumpf. |
| `TEST_DEAD_HOSTS` | leer | Kommagetrennte Basis-URLs, an denen die Fake-Bridge wie bei HTTP 503 scheitert. Setzt `ui-smoke.mjs` für die `failover-*`-Szenarien selbst. |
| `TEST_DEAD_DELAY` | `0` | Millisekunden, nach denen eine tote Basis-URL scheitert. Setzt `ui-smoke.mjs` für `failover-logout` selbst. |
| `TEST_DEAD_VOD_HOSTS` | leer | Basis-URLs, an denen nur Filme (Liste und Info) scheitern. Setzt `ui-smoke.mjs` für `failover-vod` selbst. |
| `TEST_AUTH0_HOSTS` | leer | Basis-URLs, an denen `fetchXtream` `auth 0` liefert. Setzt `ui-smoke.mjs` für `failover-login` selbst. |
| `TEST_NOJSON_HOSTS` | leer | Basis-URLs, an denen `fetchXtream` mit „Ungültige JSON-Antwort“ scheitert. Setzt `ui-smoke.mjs` für `failover-login` selbst. |
| `RENDERER_DIST` | `.vite/renderer-test` | Verzeichnis des gebauten Renderers. |

Sinnvolle Kombinationen (so laufen sie auch in CI):

```sh
npm run test:ui
TEST_CHANNELS=20000 npm run test:ui
TEST_PREFIXED=0 npm run test:ui
TEST_PREFIXED=0 TEST_CHANNELS=20000 npm run test:ui
SCENARIO=login npm run test:ui
SCENARIO=failover-login npm run test:ui
SCENARIO=failover-start npm run test:ui
SCENARIO=failover-logout npm run test:ui
SCENARIO=failover-vod npm run test:ui
SCENARIO=live-restore npm run test:ui
SCENARIO=live-restore-channel npm run test:ui
SCENARIO=vod-delay npm run test:ui
```

## Port 9333

Der Test steuert Electron über `--remote-debugging-port=9333`. Antwortet der Port beim
Start schon, bricht der Lauf sofort ab: ein zweites Electron bekommt den Port nicht und
taucht auf `/json` nie auf, der Test würde sich an den Renderer des Vorgängers hängen
(alter Bundle, alter Store) und grün melden. Aufräumen:

```sh
pkill -9 -f "[i]ptv-player/node_modules/electron"
```
