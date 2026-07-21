import { useRef, useEffect } from 'react';

const RENDER_CAP = 300; // avoid rendering tens of thousands of VOD rows at once

export default function Sidebar({
  mode, items, groups, activeGroup, onGroupChange,
  activeItemId, onItemSelect,
  favorites, onToggleFavorite,
}) {
  const activeRef    = useRef(null);
  const activeCatRef = useRef(null);
  const isLive = mode === 'live';

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' });
  }, [activeItemId]);

  useEffect(() => {
    activeCatRef.current?.scrollIntoView({ block: 'nearest' });
  }, [activeGroup]);

  const shown = items.slice(0, RENDER_CAP);
  const hidden = items.length - shown.length;

  return (
    <aside className="sidebar">
      <div className="sidebar-body">
        <nav className="cat-nav">
          {groups.map((g) => (
            <button
              key={g}
              ref={activeGroup === g ? activeCatRef : null}
              className={`cat-item ${activeGroup === g ? 'active' : ''}`}
              onClick={() => onGroupChange(g)}
              title={g}
            >
              {g === 'Alle' && <span className="cat-icon">≡</span>}
              {g === 'Favoriten' && <span className="cat-icon cat-fav-icon">★</span>}
              <span className="cat-name">{g}</span>
            </button>
          ))}
        </nav>

        <ul className="channel-list">
          {items.length === 0 && (
            <li className="channel-empty">Keine Einträge</li>
          )}
          {shown.map((item) => {
            const isFav    = favorites.includes(item.id);
            const isActive = activeItemId === item.id;
            return (
              <li
                key={item.id}
                ref={isActive ? activeRef : null}
                className={`channel-item ${isActive ? 'active' : ''}`}
                onClick={() => onItemSelect(item)}
              >
                {item.logo ? (
                  <img
                    className="channel-logo"
                    src={item.logo}
                    alt=""
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                ) : (
                  <div className="channel-logo-ph" />
                )}
                <span className="channel-name">{item.name}</span>
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
            <li className="channel-more">+ {hidden.toLocaleString()} weitere — Kategorie wählen oder oben suchen</li>
          )}
        </ul>
      </div>
    </aside>
  );
}
