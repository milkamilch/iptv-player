import { useState } from 'react';

const MODES = [
  { key: 'live',   label: 'Live' },
  { key: 'movies', label: 'Filme' },
  { key: 'series', label: 'Serien' },
];

export default function Toolbar({
  mode, onModeChange,
  onOpenFile, onLoadUrl, onOpenEPG, onLoadEPGUrl,
  epgBarOpen, onToggleEPG,
  guideOpen, onToggleGuide,
  loading,
}) {
  const [menuOpen, setMenuOpen]       = useState(false);
  const [urlBox, setUrlBox]           = useState(null); // 'm3u' | 'epg' | null
  const [urlInput, setUrlInput]       = useState('');

  const isLive = mode === 'live';

  function submitUrl() {
    const v = urlInput.trim();
    if (!v) return;
    if (urlBox === 'm3u') onLoadUrl(v); else onLoadEPGUrl(v);
    setUrlInput(''); setUrlBox(null); setMenuOpen(false);
  }

  return (
    <div className="toolbar">
      <span className="tb-logo">
        <span className="tb-dot" />
        IPTV
      </span>

      <nav className="tb-nav">
        {MODES.map((m) => (
          <button
            key={m.key}
            className={`tb-pill ${mode === m.key ? 'active' : ''}`}
            onClick={() => onModeChange(m.key)}
          >
            {m.label}
          </button>
        ))}

        {isLive && (
          <>
            <button
              className={`tb-pill ${epgBarOpen ? 'active' : ''}`}
              onClick={onToggleEPG}
            >
              Programm
            </button>
            <button
              className={`tb-pill ${guideOpen ? 'active' : ''}`}
              onClick={onToggleGuide}
            >
              Guide
            </button>
          </>
        )}
      </nav>

      <div className="tb-source">
        <button
          className={`tb-pill tb-icon-pill ${menuOpen ? 'active' : ''}`}
          onClick={() => { setMenuOpen((v) => !v); setUrlBox(null); }}
          title="Playlist / EPG laden"
        >
          {loading ? <span className="tb-spinner" /> : '＋'}
        </button>

        {menuOpen && (
          <div className="tb-menu">
            <button className="tb-menu-item" onClick={() => { onOpenFile(); setMenuOpen(false); }}>M3U-Datei öffnen</button>
            <button className="tb-menu-item" onClick={() => { setUrlBox('m3u'); setUrlInput(''); }}>M3U-URL laden…</button>
            <div className="tb-menu-sep" />
            <button className="tb-menu-item" onClick={() => { onOpenEPG(); setMenuOpen(false); }}>EPG-Datei öffnen</button>
            <button className="tb-menu-item" onClick={() => { setUrlBox('epg'); setUrlInput(''); }}>EPG-URL laden…</button>

            {urlBox && (
              <div className="tb-menu-url">
                <input
                  className="tb-menu-input"
                  type="url"
                  placeholder={urlBox === 'm3u' ? 'http://…m3u' : 'http://…xmltv'}
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submitUrl()}
                  autoFocus
                />
                <button className="tb-menu-go" onClick={submitUrl} disabled={!urlInput.trim()}>OK</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
