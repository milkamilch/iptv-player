import { useRef, useEffect, useMemo, useState } from 'react';
import { parseXMLTVDate } from '../epg.js';
import { useVirtualRows } from '../useVirtualRows.js';
import CountryList from './CountryList.jsx';

const ROW_HEIGHT = 54; // Startwert; die Hook misst nach

// Two-letter fallback badge from a name, e.g. "Sky Sport" → "SS".
function initials(name) {
  if (!name) return '?';
  const parts = name.replace(/\bHD\b|\bUHD\b|\b4K\b/gi, '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

// Cheap current-programme title (direct tvg-id lookup only — no expensive scan).
function currentTitle(epg, ch, now) {
  const progs = epg?.[ch.tvgId];
  if (!progs?.length) return null;
  for (const p of progs) {
    const start = parseXMLTVDate(p.start);
    const stop = p.stop ? parseXMLTVDate(p.stop) : null;
    if (start && start <= now && (!stop || stop > now)) return p.title;
  }
  return null;
}

export default function Sidebar({
  mode, items,
  activeItemId, onItemSelect,
  favorites, onToggleFavorite,
  globalQuery, onGlobalSearch,
  epgReady, epg, listLoading,
  countryView, countries, countryName, favoriteCount, continueCount, onSelectCountry, onLeaveCountry,
  categoryView, categories, allCount, groupName, onSelectGroup, onLeaveGroup,
}) {
  const isLive = mode === 'live';
  const itemType = mode === 'live' ? 'live' : mode === 'movies' ? 'movie' : 'series';
  const [now, setNow] = useState(() => new Date());
  const [brokenLogos, setBrokenLogos] = useState(() => new Set());

  // Own clock so the "running now" titles stay current without needing an
  // unrelated re-render of App to refresh them.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  const { first, last, padTop, padBottom, containerRef, measure, scrollToIndex } = useVirtualRows({
    count: items.length, estimatedRowHeight: ROW_HEIGHT,
  });
  const shown = useMemo(() => items.slice(first, last), [items, first, last]);

  // Scrollt zur laufenden Zeile — aber nur, wenn sich das Ziel geändert hat.
  // `items` muss in den Abhängigkeiten bleiben: im Moment, in dem ein
  // wiederhergestellter Kanal ankommt, ist die Liste noch leer, der Effekt
  // findet nichts und muss beim Eintreffen der Liste erneut laufen. Ohne die
  // Ref-Sperre reißt aber jede neue Array-Identität die Liste zurück — und die
  // entsteht in App bei jedem Favoriten-Klick, weil `favorites` in den
  // Abhängigkeiten von `visibleItems` steht.
  const scrolledToRef = useRef(null);
  useEffect(() => {
    if (scrolledToRef.current === activeItemId) return;
    const i = items.findIndex((it) => it.id === activeItemId);
    if (i < 0) return; // noch nicht in der Liste — beim nächsten items-Wechsel erneut
    scrolledToRef.current = activeItemId;
    scrollToIndex(i);
  }, [activeItemId, items, scrollToIndex]);

  // "Alle" ist app-eigen und steht immer oben; Kategorien tragen ihren Namen als Code.
  const categoryEntries = useMemo(() => [
    { code: 'Alle', name: 'Alle', flag: '≡', count: allCount },
    ...categories.map((c) => ({ code: c.name, name: c.name, flag: '#', count: c.count })),
  ], [allCount, categories]);

  // Resolve the current programme per visible row once — this scans the EPG for
  // only the rows currently on screen and must not run on every unrelated render.
  const subtitles = useMemo(() => {
    if (!isLive) return {};
    const out = {};
    for (const it of shown) out[it.id] = currentTitle(epg, it, now);
    return out;
  }, [isLive, shown, epg, now]);

  function markLogoBroken(key) {
    setBrokenLogos((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
  }

  // Suche im aktiven Modus, in beiden Ansichten gleich — steht in einer
  // lokalen Variable, damit das Suchfeld nicht doppelt im Code steht.
  const searchBox = (
    <div className="sidebar-search">
      <svg className="search-icon" width="15" height="15" viewBox="0 0 20 20" fill="none">
        <circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="1.6"/>
        <path d="M13 13l3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
      </svg>
      <input
        className="search-input"
        type="search"
        placeholder={isLive ? 'Sender suchen…' : mode === 'movies' ? 'Filme suchen…' : 'Serien suchen…'}
        value={globalQuery}
        onChange={(e) => onGlobalSearch(e.target.value)}
      />
    </div>
  );

  // Breadcrumb wie searchBox als lokale Variable. Mit Länderebene: Alle Länder ›
  // Land › Kategorie; ohne: Alle Kategorien › Kategorie. Die aktuelle Ebene ist
  // fett, jede darüber führt eine Ebene zurück.
  const crumb = !countryView && (countryName || groupName) && (
    <div className="crumb">
      {countryName
        ? <button className="crumb-back" onClick={onLeaveCountry}>Alle Länder</button>
        : <button className="crumb-back" onClick={onLeaveGroup}>Alle Kategorien</button>}
      <span className="crumb-sep">›</span>
      {countryName && groupName && (
        <>
          <button className="crumb-back" onClick={onLeaveGroup}>{countryName}</button>
          <span className="crumb-sep">›</span>
        </>
      )}
      <b>{groupName || countryName}</b>
    </div>
  );

  if (countryView || categoryView) {
    return (
      <aside className="sidebar">
        {crumb}
        <div className="sidebar-top">{searchBox}</div>
        {countryView ? (
          <CountryList countries={countries} favoriteCount={favoriteCount} continueCount={continueCount} onSelect={onSelectCountry} />
        ) : (
          <CountryList kind="category" countries={categoryEntries} favoriteCount={favoriteCount} continueCount={continueCount} onSelect={onSelectGroup} />
        )}
        <div className="sidebar-footer">
          <span>{countryView ? `${countries.length} Länder` : listLoading ? 'lädt…' : `${categories.length} Kategorien`}</span>
          <span>{epgReady ? 'EPG ✓' : 'EPG …'}</span>
        </div>
      </aside>
    );
  }

  return (
    <aside className="sidebar">
      {crumb}
      <div className="sidebar-top">{searchBox}</div>

      <ul
        className="channel-list"
        ref={containerRef}
        role="listbox"
        aria-label={isLive ? 'Kanäle' : mode === 'movies' ? 'Filme' : 'Serien'}
      >
        {items.length === 0 && (
          <li className="channel-empty" role="presentation">{listLoading ? 'lädt…' : 'Keine Einträge'}</li>
        )}
        {padTop > 0 && <li className="vspacer" role="presentation" style={{ height: padTop }} />}
        {shown.map((item, i) => {
          const index    = first + i;
          const key      = `${itemType}:${item.id}`;
          const isFav    = favorites.includes(key);
          const isActive = activeItemId === item.id;
          const sub = isLive ? (subtitles[item.id] || item.group) : item.group;
          return (
            <li
              key={item.id}
              ref={i === 0 ? measure : null}
              className={`channel-item ${isActive ? 'active' : ''}`}
              role="option"
              aria-selected={isActive}
              aria-setsize={items.length}
              aria-posinset={index + 1}
              tabIndex={0}
              onClick={() => onItemSelect(item)}
              // Enter only — Space is the global play/pause shortcut.
              onKeyDown={(e) => { if (e.key === 'Enter') onItemSelect(item); }}
            >
              {isActive && <span className="channel-bar" />}
              {item.logo && !brokenLogos.has(key) ? (
                <img
                  className="channel-logo"
                  src={item.logo}
                  alt=""
                  // Fall back to the initials badge — hiding the img would just
                  // leave an empty gap where the logo should be.
                  onError={() => markLogoBroken(key)}
                />
              ) : (
                <div className="channel-logo channel-logo-ph">{initials(item.name)}</div>
              )}
              <div className="channel-text">
                <span className="channel-name">{item.name}</span>
                {sub && <span className="channel-sub">{sub}</span>}
              </div>
              <button
                className={`fav-btn ${isFav ? 'fav-on' : ''}`}
                onClick={(e) => { e.stopPropagation(); onToggleFavorite(itemType, item.id); }}
                title={isFav ? 'Aus Favoriten entfernen' : 'Favorit'}
              >★</button>
            </li>
          );
        })}
        {padBottom > 0 && <li className="vspacer" role="presentation" style={{ height: padBottom }} />}
      </ul>

      <div className="sidebar-footer">
        <span>{items.length.toLocaleString('de-DE')} {isLive ? 'Kanäle' : mode === 'movies' ? 'Filme' : 'Serien'}</span>
        <span>{epgReady ? 'EPG ✓' : 'EPG …'}</span>
      </div>
    </aside>
  );
}
