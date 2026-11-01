import { FAVORITES, CONTINUE } from '../country.mjs';

// Ebene der Seitenleiste vor der Liste: Land (kind 'country') oder Kategorie
// (kind 'category') wählen. Bewusst ohne Virtualisierung — mehr als ~60 Länder
// kann die Tabelle in country.mjs gar nicht erzeugen, Kategorien sind wenige hundert.
export default function CountryList({ countries, favoriteCount, continueCount, onSelect, kind = 'country' }) {
  const rowClass = `channel-item ${kind === 'category' ? 'category-item' : 'country-item'}`;
  return (
    <ul className="channel-list" role="listbox" aria-label={kind === 'category' ? 'Kategorien' : 'Länder'}>
      {continueCount > 0 && (
        <li
          className={rowClass}
          role="option"
          aria-selected={false}
          tabIndex={0}
          onClick={() => onSelect(CONTINUE)}
          onKeyDown={(e) => { if (e.key === 'Enter') onSelect(CONTINUE); }}
        >
          <div className="channel-logo channel-logo-ph">▶</div>
          <div className="channel-text">
            <span className="channel-name">Weiter</span>
            <span className="channel-sub">angefangen</span>
          </div>
          <span className="country-count">{continueCount.toLocaleString('de-DE')}</span>
        </li>
      )}
      {favoriteCount > 0 && (
        <li
          className={rowClass}
          role="option"
          aria-selected={false}
          tabIndex={0}
          onClick={() => onSelect(FAVORITES)}
          onKeyDown={(e) => { if (e.key === 'Enter') onSelect(FAVORITES); }}
        >
          <div className="channel-logo channel-logo-ph">★</div>
          <div className="channel-text">
            <span className="channel-name">Favoriten</span>
            {kind === 'country' && <span className="channel-sub">länderübergreifend</span>}
          </div>
          <span className="country-count">{favoriteCount.toLocaleString('de-DE')}</span>
        </li>
      )}
      {countries.map((c) => (
        <li
          key={c.code}
          className={rowClass}
          role="option"
          aria-selected={false}
          tabIndex={0}
          onClick={() => onSelect(c.code)}
          onKeyDown={(e) => { if (e.key === 'Enter') onSelect(c.code); }}
        >
          <div className="channel-logo channel-logo-ph">{c.flag}</div>
          <div className="channel-text">
            <span className="channel-name">{c.name}</span>
          </div>
          <span className="country-count">{c.count.toLocaleString('de-DE')}</span>
        </li>
      ))}
    </ul>
  );
}
