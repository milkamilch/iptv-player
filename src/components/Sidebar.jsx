import { useRef, useEffect } from 'react';

export default function Sidebar({
  channels, groups, activeGroup, onGroupChange,
  activeChannel, onChannelSelect,
  favorites, onToggleFavorite,
  search, onSearch,
}) {
  const activeRef   = useRef(null);
  const activeCatRef = useRef(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' });
  }, [activeChannel]);

  useEffect(() => {
    activeCatRef.current?.scrollIntoView({ block: 'nearest' });
  }, [activeGroup]);

  return (
    <aside className="sidebar">
      <div className="sidebar-search">
        <svg className="search-icon" viewBox="0 0 20 20" fill="none">
          <circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M13 13l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
        <input
          className="search-input"
          type="search"
          placeholder="Suche…"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
        />
      </div>

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
          {channels.length === 0 && (
            <li className="channel-empty">Keine Kanäle</li>
          )}
          {channels.map((ch) => {
            const isFav    = favorites.includes(ch.id);
            const isActive = activeChannel?.id === ch.id;
            return (
              <li
                key={ch.id}
                ref={isActive ? activeRef : null}
                className={`channel-item ${isActive ? 'active' : ''}`}
                onClick={() => onChannelSelect(ch)}
              >
                {ch.logo ? (
                  <img
                    className="channel-logo"
                    src={ch.logo}
                    alt=""
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                ) : (
                  <div className="channel-logo-ph" />
                )}
                <span className="channel-name">{ch.name}</span>
                <button
                  className={`fav-btn ${isFav ? 'fav-on' : ''}`}
                  onClick={(e) => { e.stopPropagation(); onToggleFavorite(ch.id); }}
                  title={isFav ? 'Aus Favoriten entfernen' : 'Favorit'}
                >★</button>
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}
