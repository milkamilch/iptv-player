import { useRef, useEffect } from 'react';
import { parseXMLTVDate } from '../epg.js';

const RENDER_CAP = 300; // avoid rendering tens of thousands of VOD rows at once

// Two-letter fallback badge from a name, e.g. "Sky Sport" → "SS".
function initials(name) {
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
}) {
  const activeRef    = useRef(null);
  const activeCatRef = useRef(null);
  const isLive = mode === 'live';
  const now = new Date();

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' });
  }, [activeItemId]);

  useEffect(() => {
    activeCatRef.current?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }, [activeGroup]);

  const shown = items.slice(0, RENDER_CAP);
  const hidden = items.length - shown.length;

  return (
    <aside className="sidebar">
      <div className="sidebar-top">
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

      <ul className="channel-list">
        {items.length === 0 && (
          <li className="channel-empty">{listLoading ? 'lädt…' : 'Keine Einträge'}</li>
        )}
        {shown.map((item) => {
          const isFav    = favorites.includes(item.id);
          const isActive = activeItemId === item.id;
          const sub = isLive ? (currentTitle(epg, item, now) || item.group) : item.group;
          return (
            <li
              key={item.id}
              ref={isActive ? activeRef : null}
              className={`channel-item ${isActive ? 'active' : ''}`}
              onClick={() => onItemSelect(item)}
            >
              {isActive && <span className="channel-bar" />}
              {item.logo ? (
                <img
                  className="channel-logo"
                  src={item.logo}
                  alt=""
                  onError={(e) => { e.target.style.visibility = 'hidden'; }}
                />
              ) : (
                <div className="channel-logo channel-logo-ph">{initials(item.name)}</div>
              )}
              <div className="channel-text">
                <span className="channel-name">{item.name}</span>
                {sub && <span className="channel-sub">{sub}</span>}
              </div>
              {isLive && (
                <button
                  className={`fav-btn ${isFav ? 'fav-on' : ''}`}
                  onClick={(e) => { e.stopPropagation(); onToggleFavorite(item.id); }}
                  title={isFav ? 'Aus Favoriten entfernen' : 'Favorit'}
                >★</button>
              )}
            </li>
          );
        })}
        {hidden > 0 && (
          <li className="channel-more">+ {hidden.toLocaleString('de-DE')} weitere — Kategorie wählen oder suchen</li>
        )}
      </ul>

      <div className="sidebar-footer">
        <span>{(totalCount ?? 0).toLocaleString('de-DE')} {isLive ? 'Kanäle' : mode === 'movies' ? 'Filme' : 'Serien'}</span>
        <span>{epgReady ? 'EPG ✓' : 'EPG …'}</span>
      </div>
    </aside>
  );
}
