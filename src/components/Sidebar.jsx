import { useRef, useEffect } from 'react';

export default function Sidebar({
  channels, groups, activeGroup, onGroupChange,
  activeChannel, onChannelSelect,
  favorites, onToggleFavorite,
  search, onSearch,
}) {
  const activeRef = useRef(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' });
  }, [activeChannel]);

  return (
    <aside className="sidebar">
      <div className="sidebar-search">
        <input
          className="search-input"
          type="search"
          placeholder="Suche…"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
        />
      </div>

      <div className="group-tabs">
        {groups.map((g) => (
          <button
            key={g}
            className={`group-tab ${activeGroup === g ? 'active' : ''}`}
            onClick={() => onGroupChange(g)}
          >
            {g === 'Favoriten' ? '⭐ ' : ''}{g}
          </button>
        ))}
      </div>

      <div className="channel-count">
        {channels.length} {channels.length === 1 ? 'Kanal' : 'Kanäle'}
      </div>

      <ul className="channel-list">
        {channels.length === 0 && (
          <li className="channel-empty">Keine Kanäle</li>
        )}
        {channels.map((ch) => {
          const isFav = favorites.includes(ch.id);
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
                <div className="channel-logo-placeholder">📺</div>
              )}
              <span className="channel-name">{ch.name}</span>
              <button
                className={`fav-btn ${isFav ? 'fav-on' : ''}`}
                onClick={(e) => { e.stopPropagation(); onToggleFavorite(ch.id); }}
                title={isFav ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}
              >
                {isFav ? '★' : '☆'}
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
