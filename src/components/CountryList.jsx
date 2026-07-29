import { FAVORITES } from '../country.mjs';

// Erste Ebene der Seitenleiste: Land wählen. Bewusst ohne Virtualisierung —
// mehr als ~60 Einträge kann die Tabelle in country.mjs gar nicht erzeugen.
export default function CountryList({ countries, favoriteCount, onSelect }) {
  return (
    <ul className="channel-list" role="listbox" aria-label="Länder">
      {favoriteCount > 0 && (
        <li
          className="channel-item country-item"
          role="option"
          aria-selected={false}
          tabIndex={0}
          onClick={() => onSelect(FAVORITES)}
          onKeyDown={(e) => { if (e.key === 'Enter') onSelect(FAVORITES); }}
        >
          <div className="channel-logo channel-logo-ph">★</div>
          <div className="channel-text">
            <span className="channel-name">Favoriten</span>
            <span className="channel-sub">länderübergreifend</span>
          </div>
          <span className="country-count">{favoriteCount.toLocaleString('de-DE')}</span>
        </li>
      )}
      {countries.map((c) => (
        <li
          key={c.code}
          className="channel-item country-item"
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
