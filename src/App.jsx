import { useState, useEffect, useCallback } from 'react';
import Sidebar from './components/Sidebar.jsx';
import VideoPlayer from './components/VideoPlayer.jsx';
import EPGBar from './components/EPGBar.jsx';
import Toolbar from './components/Toolbar.jsx';
import './App.css';

export default function App() {
  const [channels, setChannels]         = useState([]);
  const [epg, setEpg]                   = useState({});          // { tvgId: [programme, ...] }
  const [favorites, setFavorites]       = useState([]);           // channel ids
  const [activeChannel, setActiveChannel] = useState(null);
  const [activeGroup, setActiveGroup]   = useState('Alle');
  const [search, setSearch]             = useState('');
  const [sidebarOpen, setSidebarOpen]   = useState(true);
  const [epgBarOpen, setEpgBarOpen]     = useState(true);
  const [loading, setLoading]           = useState(false);
  const [toast, setToast]               = useState(null);

  // Persist favorites
  useEffect(() => {
    window.iptv.storeGet('favorites').then((f) => { if (Array.isArray(f)) setFavorites(f); });
  }, []);

  function showToast(msg, type = 'info') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  async function handleOpenM3UFile() {
    setLoading(true);
    try {
      const result = await window.iptv.openM3UFile();
      if (result) {
        setChannels(result.channels);
        setActiveGroup('Alle');
        showToast(`${result.channels.length} Kanäle geladen`, 'success');
        await window.iptv.storeSet('lastM3UPath', result.path);
      }
    } catch (e) {
      showToast('Fehler beim Laden: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleLoadM3UUrl(url) {
    setLoading(true);
    try {
      const chs = await window.iptv.loadM3UUrl(url);
      setChannels(chs);
      setActiveGroup('Alle');
      showToast(`${chs.length} Kanäle geladen`, 'success');
      await window.iptv.storeSet('lastM3UUrl', url);
    } catch (e) {
      showToast('Fehler: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleOpenEPG() {
    setLoading(true);
    try {
      const data = await window.iptv.openXMLTVFile();
      if (data) {
        setEpg(data);
        const count = Object.keys(data).length;
        showToast(`EPG geladen: ${count} Kanäle`, 'success');
      }
    } catch (e) {
      showToast('EPG-Fehler: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleLoadEPGUrl(url) {
    setLoading(true);
    try {
      const data = await window.iptv.loadXMLTVUrl(url);
      setEpg(data);
      showToast(`EPG geladen: ${Object.keys(data).length} Kanäle`, 'success');
      await window.iptv.storeSet('lastEPGUrl', url);
    } catch (e) {
      showToast('EPG-Fehler: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  function toggleFavorite(channelId) {
    setFavorites((prev) => {
      const next = prev.includes(channelId)
        ? prev.filter((id) => id !== channelId)
        : [...prev, channelId];
      window.iptv.storeSet('favorites', next);
      return next;
    });
  }

  const groups = ['Alle', 'Favoriten', ...new Set(channels.map((c) => c.group).filter(Boolean))];

  const visibleChannels = channels.filter((c) => {
    if (activeGroup === 'Favoriten' && !favorites.includes(c.id)) return false;
    if (activeGroup !== 'Alle' && activeGroup !== 'Favoriten' && c.group !== activeGroup) return false;
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="app">
      <Toolbar
        onOpenFile={handleOpenM3UFile}
        onLoadUrl={handleLoadM3UUrl}
        onOpenEPG={handleOpenEPG}
        onLoadEPGUrl={handleLoadEPGUrl}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
        epgBarOpen={epgBarOpen}
        onToggleEPG={() => setEpgBarOpen((v) => !v)}
        loading={loading}
        channelCount={channels.length}
      />

      <div className="app-body">
        {sidebarOpen && (
          <Sidebar
            channels={visibleChannels}
            groups={groups}
            activeGroup={activeGroup}
            onGroupChange={setActiveGroup}
            activeChannel={activeChannel}
            onChannelSelect={setActiveChannel}
            favorites={favorites}
            onToggleFavorite={toggleFavorite}
            search={search}
            onSearch={setSearch}
          />
        )}

        <main className="app-main">
          <VideoPlayer channel={activeChannel} />
          {epgBarOpen && activeChannel && (
            <EPGBar channel={activeChannel} epg={epg} />
          )}
        </main>
      </div>

      {toast && (
        <div className={`toast toast-${toast.type}`}>{toast.msg}</div>
      )}
    </div>
  );
}
