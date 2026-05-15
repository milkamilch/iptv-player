import { useState, useEffect } from 'react';
import LoginModal from './components/LoginModal.jsx';
import Sidebar from './components/Sidebar.jsx';
import VideoPlayer from './components/VideoPlayer.jsx';
import EPGBar from './components/EPGBar.jsx';
import Toolbar from './components/Toolbar.jsx';
import './App.css';

export default function App() {
  const [account, setAccount]           = useState(null);   // { baseUrl, username, password }
  const [savedAccounts, setSavedAccounts] = useState([]);
  const [channels, setChannels]         = useState([]);
  const [epg, setEpg]                   = useState({});
  const [favorites, setFavorites]       = useState([]);
  const [activeChannel, setActiveChannel] = useState(null);

  function selectChannel(ch) {
    setActiveChannel(ch);
    if (ch) window.iptv.storeSet('lastChannel', { id: ch.id, name: ch.name });
  }
  const [activeGroup, setActiveGroup]   = useState('Alle');
  const [search, setSearch]             = useState('');
  const [sidebarOpen, setSidebarOpen]   = useState(true);
  const [epgBarOpen, setEpgBarOpen]     = useState(true);
  const [loading, setLoading]           = useState(false);
  const [toast, setToast]               = useState(null);

  // Load persisted data on startup
  useEffect(() => {
    Promise.all([
      window.iptv.storeGet('savedAccounts'),
      window.iptv.storeGet('favorites'),
      window.iptv.storeGet('activeAccount'),
    ]).then(([accs, favs, activeAcc]) => {
      if (Array.isArray(accs))  setSavedAccounts(accs);
      if (Array.isArray(favs))  setFavorites(favs);
      if (activeAcc)            handleLoginSuccess(activeAcc, false);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Restore last channel once channels are loaded
  useEffect(() => {
    if (!channels.length) return;
    window.iptv.storeGet('lastChannel').then((saved) => {
      if (!saved) return;
      const ch = channels.find((c) => c.id === saved.id);
      if (ch) setActiveChannel(ch);
    });
  }, [channels]);

  function showToast(msg, type = 'info') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  async function handleLoginSuccess(acc, save = true) {
    setAccount(acc);
    setLoading(true);

    try {
      // Use Xtream Codes JSON API — works even when M3U endpoint is blocked
      const chs = await window.iptv.loadXtreamChannels(acc.baseUrl, acc.username, acc.password);
      setChannels(chs);
      setActiveGroup('Alle');
      showToast(`${chs.length} Kanäle geladen`, 'success');
    } catch (e) {
      showToast('Kanäle konnten nicht geladen werden: ' + e.message, 'error');
    }

    setLoading(false);

    // Load EPG in background (non-blocking)
    const epgUrl = `${acc.baseUrl}/xmltv.php?username=${encodeURIComponent(acc.username)}&password=${encodeURIComponent(acc.password)}`;
    window.iptv.loadXMLTVUrl(epgUrl)
      .then((data) => {
        setEpg(data);
        showToast(`EPG geladen: ${Object.keys(data).length} Kanäle`, 'info');
      })
      .catch(() => {});

    if (save) {
      // Save account to list (avoid duplicates)
      const accToStore = { baseUrl: acc.baseUrl, username: acc.username, password: acc.password };
      setSavedAccounts((prev) => {
        const filtered = prev.filter(
          (a) => !(a.baseUrl === accToStore.baseUrl && a.username === accToStore.username)
        );
        const next = [accToStore, ...filtered].slice(0, 5); // max 5 saved accounts
        window.iptv.storeSet('savedAccounts', next);
        return next;
      });
      window.iptv.storeSet('activeAccount', accToStore);
    }
  }

  function handleDeleteAccount(index) {
    setSavedAccounts((prev) => {
      const next = prev.filter((_, i) => i !== index);
      window.iptv.storeSet('savedAccounts', next);
      return next;
    });
  }

  function handleLogout() {
    setAccount(null);
    setChannels([]);
    setEpg({});
    setActiveChannel(null);
    window.iptv.storeDelete('activeAccount');
  }

  async function handleOpenM3UFile() {
    setLoading(true);
    try {
      const result = await window.iptv.openM3UFile();
      if (result) {
        setChannels(result.channels);
        setActiveGroup('Alle');
        showToast(`${result.channels.length} Kanäle geladen`, 'success');
      }
    } catch (e) {
      showToast('Fehler: ' + e.message, 'error');
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
      if (data) { setEpg(data); showToast(`EPG: ${Object.keys(data).length} Kanäle`, 'success'); }
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
      showToast(`EPG: ${Object.keys(data).length} Kanäle`, 'success');
    } catch (e) {
      showToast('EPG-Fehler: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  function toggleFavorite(channelId) {
    setFavorites((prev) => {
      const next = prev.includes(channelId) ? prev.filter((id) => id !== channelId) : [...prev, channelId];
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

  if (!account) {
    return (
      <>
        <LoginModal
          onLogin={handleLoginSuccess}
          savedAccounts={savedAccounts}
          onSelectAccount={(acc) => handleLoginSuccess(acc, false)}
          onDeleteAccount={handleDeleteAccount}
        />
        {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
      </>
    );
  }

  return (
    <div className="app">
      <Toolbar
        account={account}
        onLogout={handleLogout}
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
            onChannelSelect={selectChannel}
            favorites={favorites}
            onToggleFavorite={toggleFavorite}
            search={search}
            onSearch={setSearch}
          />
        )}
        <main className="app-main">
          <VideoPlayer channel={activeChannel} />
          {epgBarOpen && activeChannel && <EPGBar channel={activeChannel} epg={epg} />}
        </main>
      </div>

      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
    </div>
  );
}
