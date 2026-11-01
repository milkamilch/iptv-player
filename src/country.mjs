// Ableitung der Länderebene aus den Kategorienamen des Providers.
// Bewusst frei von React und IPC, damit es per `node --test` direkt prüfbar ist.

export const OTHER = '__other__';
export const FAVORITES = '__fav__';
export const CONTINUE = '__continue__';

// Nur Codes aus dieser Tabelle gelten als Land. Alles andere landet in "Sonstige",
// damit Präfixe wie "HD", "VIP" oder "4K" keine Fantasieländer erzeugen.
const COUNTRIES = {
  DE: ['Deutschland', '🇩🇪'], AT: ['Österreich', '🇦🇹'], CH: ['Schweiz', '🇨🇭'],
  GB: ['Großbritannien', '🇬🇧'], IE: ['Irland', '🇮🇪'], FR: ['Frankreich', '🇫🇷'],
  IT: ['Italien', '🇮🇹'], ES: ['Spanien', '🇪🇸'], PT: ['Portugal', '🇵🇹'],
  NL: ['Niederlande', '🇳🇱'], BE: ['Belgien', '🇧🇪'], LU: ['Luxemburg', '🇱🇺'],
  DK: ['Dänemark', '🇩🇰'], SE: ['Schweden', '🇸🇪'], NO: ['Norwegen', '🇳🇴'],
  FI: ['Finnland', '🇫🇮'], IS: ['Island', '🇮🇸'], PL: ['Polen', '🇵🇱'],
  CZ: ['Tschechien', '🇨🇿'], SK: ['Slowakei', '🇸🇰'], HU: ['Ungarn', '🇭🇺'],
  RO: ['Rumänien', '🇷🇴'], BG: ['Bulgarien', '🇧🇬'], GR: ['Griechenland', '🇬🇷'],
  HR: ['Kroatien', '🇭🇷'], RS: ['Serbien', '🇷🇸'], SI: ['Slowenien', '🇸🇮'],
  BA: ['Bosnien', '🇧🇦'], MK: ['Nordmazedonien', '🇲🇰'], AL: ['Albanien', '🇦🇱'],
  UA: ['Ukraine', '🇺🇦'], RU: ['Russland', '🇷🇺'], BY: ['Belarus', '🇧🇾'],
  LT: ['Litauen', '🇱🇹'], LV: ['Lettland', '🇱🇻'], EE: ['Estland', '🇪🇪'],
  TR: ['Türkei', '🇹🇷'], IL: ['Israel', '🇮🇱'], AE: ['VAE', '🇦🇪'],
  SA: ['Saudi-Arabien', '🇸🇦'], EG: ['Ägypten', '🇪🇬'], MA: ['Marokko', '🇲🇦'],
  DZ: ['Algerien', '🇩🇿'], TN: ['Tunesien', '🇹🇳'], ZA: ['Südafrika', '🇿🇦'],
  NG: ['Nigeria', '🇳🇬'], US: ['USA', '🇺🇸'], CA: ['Kanada', '🇨🇦'],
  MX: ['Mexiko', '🇲🇽'], BR: ['Brasilien', '🇧🇷'], AR: ['Argentinien', '🇦🇷'],
  CL: ['Chile', '🇨🇱'], CO: ['Kolumbien', '🇨🇴'], IN: ['Indien', '🇮🇳'],
  PK: ['Pakistan', '🇵🇰'], BD: ['Bangladesch', '🇧🇩'], CN: ['China', '🇨🇳'],
  JP: ['Japan', '🇯🇵'], KR: ['Südkorea', '🇰🇷'], TH: ['Thailand', '🇹🇭'],
  VN: ['Vietnam', '🇻🇳'], PH: ['Philippinen', '🇵🇭'], ID: ['Indonesien', '🇮🇩'],
  MY: ['Malaysia', '🇲🇾'], AU: ['Australien', '🇦🇺'], NZ: ['Neuseeland', '🇳🇿'],
};

// Provider schreiben durchweg UK statt des ISO-Codes GB; die übrigen sind
// gängige Schreibweisen aus echten Playlists. Bewusst NICHT dabei: EN —
// "EN | Sport" meint fast immer die Sprache, nicht Großbritannien.
const ALIASES = { UK: 'GB', USA: 'US', GER: 'DE', AUT: 'AT', SUI: 'CH', ESP: 'ES', POL: 'PL' };

const PREFIX_RE = /^\s*([A-Za-z]{2,3})\s*[|\-:/>]\s*(.+)$/;

/** Zerlegt einen Gruppennamen in Ländercode und Kategorienamen ohne Präfix. */
export function parseCategory(group) {
  const raw = typeof group === 'string' ? group.trim() : '';
  if (!raw) return { code: OTHER, category: 'Alle' };

  const m = raw.match(PREFIX_RE);
  if (!m) return { code: OTHER, category: raw };

  const upper = m[1].toUpperCase();
  const code = ALIASES[upper] || upper;
  // Unbekanntes Präfix: kein Land, und der Name bleibt vollständig erhalten.
  if (!COUNTRIES[code]) return { code: OTHER, category: raw };

  return { code, category: m[2].trim() };
}

/** Ein Durchlauf über alle Kanäle: Zählung, sortierte Länderliste, Metadaten je Kanal. */
// titlePrefix: VOD-Kategorien tragen selten ein Präfix, die Titel fast immer.
// Die Kategorie für die Chips bleibt trotzdem die Kategorie, nie der Titel.
export function buildCountryIndex(channels, { titlePrefix = false } = {}) {
  const meta = new Map();
  const counts = new Map();

  for (const ch of channels || []) {
    let parsed = parseCategory(ch.group);
    if (titlePrefix && parsed.code === OTHER) {
      const fromTitle = parseCategory(ch.name);
      if (fromTitle.code !== OTHER) parsed = { code: fromTitle.code, category: parsed.category };
    }
    meta.set(ch.id, parsed);
    counts.set(parsed.code, (counts.get(parsed.code) || 0) + 1);
  }

  const countries = [...counts.entries()]
    .filter(([code]) => code !== OTHER)
    .map(([code, count]) => ({ code, name: COUNTRIES[code][0], flag: COUNTRIES[code][1], count }))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));

  if (counts.has(OTHER)) {
    countries.push({ code: OTHER, name: 'Sonstige', flag: '?', count: counts.get(OTHER) });
  }

  // Ein einziger Eimer heißt: die Ebene bringt nichts und wird unterdrückt.
  return { enabled: countries.length > 1, countries, meta };
}

/** Zählt Einträge je Kategorie, deutsch sortiert; categoryOf liefert null/'' für "nicht dabei". */
export function categoryCounts(items, categoryOf) {
  const counts = new Map();
  for (const it of items || []) {
    const name = categoryOf(it);
    if (name) counts.set(name, (counts.get(name) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));
}
