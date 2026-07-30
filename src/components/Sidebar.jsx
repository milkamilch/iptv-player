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
  mode, items, groups, activeGroup, onGroupChange,
  activeItemId, onItemSelect,
  favorites, onToggleFavorite,
  globalQuery, onGlobalSearch,
  totalCount, epgReady, epg, listLoading,
  countryView, countries, countryName, favoriteCount, onSelectCountry, onLeaveCountry,
}) {
  const activeCatRef = useRef(null);
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

  useEffect(() => {
    const i = items.findIndex((it) => it.id === activeItemId);
    if (i >= 0) scrollToIndex(i);
  }, [activeItemId, items, scrollToIndex]);

  useEffect(() => {
    activeCatRef.current?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }, [activeGroup]);

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

  // Bleibt in beiden Ansichten die unveränderte globale Suche — steht in einer
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
        placeholder="Filme, Serien & Sender…"
        value={globalQuery}
        onChange={(e) => onGlobalSearch(e.target.value)}
      />
    </div>
  );

  if (countryView) {
    return (
      <aside className="sidebar">
        <div className="sidebar-top">{searchBox}</div>
        <CountryList countries={countries} favoriteCount={favoriteCount} onSelect={onSelectCountry} />
        <div className="sidebar-footer">
          <span>{countries.length} Länder</span>
          <span>{epgReady ? 'EPG ✓' : 'EPG …'}</span>
        </div>
      </aside>
    );
  }

  return (
    <aside className="sidebar">
      {countryName && (
        <div className="crumb">
          <button className="crumb-back" onClick={onLeaveCountry}>Alle Länder</button>
          <span className="crumb-sep">›</span>
          <b>{countryName}</b>
        </div>
      )}
      <div className="sidebar-top">
        {searchBox}

        <div className="chiprow">
          {groups.map((g) => (
            <button
              key={g}
              ref={activeGroup === g ? activeCatRef : null}
              className={`cat-chip ${activeGroup === g ? 'active' : ''}`}
              onClick={() => onGroupChange(g)}
              title={g}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

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
        <span>{(totalCount ?? 0).toLocaleString('de-DE')} {isLive ? 'Kanäle' : mode === 'movies' ? 'Filme' : 'Serien'}</span>
        <span>{epgReady ? 'EPG ✓' : 'EPG …'}</span>
      </div>
    </aside>
  );
}
