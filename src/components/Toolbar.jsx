import { useState } from 'react';

export default function Toolbar({
  account, onLogout,
  onOpenFile, onLoadUrl, onOpenEPG, onLoadEPGUrl,
  sidebarOpen, onToggleSidebar,
  epgBarOpen, onToggleEPG,
  loading, channelCount,
}) {
  const [urlInput, setUrlInput]       = useState('');
  const [epgUrlInput, setEpgUrlInput] = useState('');
  const [showUrlBox, setShowUrlBox]   = useState(false);
  const [showEpgBox, setShowEpgBox]   = useState(false);

  function handleLoadUrl() {
    if (!urlInput.trim()) return;
    onLoadUrl(urlInput.trim());
    setUrlInput('');
    setShowUrlBox(false);
  }

  function handleLoadEPGUrl() {
    if (!epgUrlInput.trim()) return;
    onLoadEPGUrl(epgUrlInput.trim());
    setEpgUrlInput('');
    setShowEpgBox(false);
  }

  return (
    <header className="toolbar">
      <div className="toolbar-left">
        <span className="toolbar-logo">
          <span className="toolbar-logo-dot" />
          IPTV
        </span>

        {channelCount > 0 && (
          <span className="toolbar-count">{channelCount.toLocaleString()}</span>
        )}

        {account && (
          <span className="toolbar-account" title={account.baseUrl}>
            {account.username}@{new URL(account.baseUrl).hostname}
          </span>
        )}
      </div>

      <div className="toolbar-actions">
        <button
          className={`toolbar-btn ${sidebarOpen ? 'active' : ''}`}
          onClick={onToggleSidebar}
          title="Kanalliste"
        >
          Kanäle
        </button>

        <div className="toolbar-separator" />

        <div className="toolbar-group">
          <button className="toolbar-btn" onClick={onOpenFile} disabled={loading} title="M3U-Datei öffnen">
            M3U
          </button>
          <button
            className={`toolbar-btn icon-btn ${showUrlBox ? 'active' : ''}`}
            onClick={() => { setShowUrlBox((v) => !v); setShowEpgBox(false); }}
            title="M3U-URL laden"
          >
            URL
          </button>
        </div>

        <div className="toolbar-group">
          <button className="toolbar-btn" onClick={onOpenEPG} disabled={loading} title="EPG-Datei öffnen">
            EPG
          </button>
          <button
            className={`toolbar-btn icon-btn ${showEpgBox ? 'active' : ''}`}
            onClick={() => { setShowEpgBox((v) => !v); setShowUrlBox(false); }}
            title="EPG-URL laden"
          >
            URL
          </button>
        </div>

        <button
          className={`toolbar-btn ${epgBarOpen ? 'active' : ''}`}
          onClick={onToggleEPG}
          title="Programmführer"
        >
          Programm
        </button>

        {loading && <div className="toolbar-spinner" />}

        <div className="toolbar-separator" />

        {onLogout && (
          <button className="toolbar-btn toolbar-btn-logout" onClick={onLogout} title="Abmelden">
            Abmelden
          </button>
        )}
      </div>

      {showUrlBox && (
        <div className="url-popup">
          <span className="url-popup-label">M3U-URL</span>
          <input
            className="url-input"
            type="url"
            placeholder="http://…"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLoadUrl()}
            autoFocus
          />
          <button className="url-btn" onClick={handleLoadUrl} disabled={!urlInput.trim()}>Laden</button>
          <button className="url-btn-cancel" onClick={() => setShowUrlBox(false)}>✕</button>
        </div>
      )}

      {showEpgBox && (
        <div className="url-popup">
          <span className="url-popup-label">XMLTV-URL</span>
          <input
            className="url-input"
            type="url"
            placeholder="http://…xmltv.xml"
            value={epgUrlInput}
            onChange={(e) => setEpgUrlInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLoadEPGUrl()}
            autoFocus
          />
          <button className="url-btn" onClick={handleLoadEPGUrl} disabled={!epgUrlInput.trim()}>Laden</button>
          <button className="url-btn-cancel" onClick={() => setShowEpgBox(false)}>✕</button>
        </div>
      )}
    </header>
  );
}
