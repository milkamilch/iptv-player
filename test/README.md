# Tests

- `npm test` — Unit-Tests (`node --test`), prüft `src/country.mjs`.
- `npm run test:ui` — baut den Renderer nach `.vite/renderer-test` und fährt ihn in
  Electron hoch, ferngesteuert über das DevTools-Protokoll.

Der UI-Test braucht ein Display. Unter Linux ohne Desktop:
`xvfb-run -a npm run test:ui`.

Szenarien: `SCENARIO=login npm run test:ui`, `SCENARIO=live` (Standard).
Kanalzahl für Virtualisierungs-Prüfungen: `TEST_CHANNELS=20000`.
