import { useState, useEffect, useRef } from 'react';
import LoginModal from './components/LoginModal.jsx';
import Sidebar from './components/Sidebar.jsx';
import VideoPlayer from './components/VideoPlayer.jsx';
import EPGGrid from './components/EPGGrid.jsx';
import MovieDetail from './components/MovieDetail.jsx';
import SeriesDetail from './components/SeriesDetail.jsx';
import SearchResults from './components/SearchResults.jsx';
import Toolbar from './components/Toolbar.jsx';
import Settings from './components/Settings.jsx';
import { movieUrl, episodeUrl } from './xtream.js';
import { getHistory, getSettings, saveSettings, clearAllProgress, DEFAULT_SETTINGS } from './progress.js';
import './App.css';

export default function App() {
  const [account, setAccount]             = useState(null);   // { baseUrl, username, password }
  const [savedAccounts, setSavedAccounts] = useState([]);
  const [channels, setChannels]           = useState([]);
  const [movies, setMovies]               = useState([]);
  const [series, setSeries]               = useState([]);
  const [moviesLoading, setMoviesLoading] = useState(false);
  const [seriesLoading, setSeriesLoading] = useState(false);
  const [epg, setEpg]                     = useState({});
  const [favorites, setFavorites]         = useState([]);

  const [mode, setMode]                   = useState('live'); // 'live' | 'movies' | 'series'
  const [activePlayable, setActivePlayable] = useState(null); // { id, name, url, type }
  const [detailItem, setDetailItem]       = useState(null);   // { type:'movie'|'series', item }
  const [globalQuery, setGlobalQuery]     = useState('');
  const [activeGroup, setActiveGroup]     = useState('Alle');
  const [epgBarOpen, setEpgBarOpen]       = useState(true);
  const [guideOpen, setGuideOpen]         = useState(false);
  const [loading, setLoading]             = useState(false);
  const [toast, setToast]                 = useState(null);
  const [history, setHistory]             = useState({});      // watch history (continue watching)
  const [settings, setSettings]           = useState(DEFAULT_SETTINGS);
  const [settingsOpen, setSettingsOpen]   = useState(false);
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const loginNonceRef = useRef(0);
  const navRef = useRef({});

  const activeLiveChannel = activePlayable?.type === 'live' ? activePlayable : null;
  const itemType = mode === 'live' ? 'live' : mode === 'movies' ? 'movie' : 'series';

  // Load persisted data on startup
  useEffect(() => {
    Promise.all([
      window.iptv.storeGet('savedAccounts'),
      window.iptv.storeGet('favorites'),
      window.iptv.storeGet('activeAccount'),
    ]).then(async ([accs, favs, activeAcc]) => {
      const s = await getSettings();
      setSettings(s);
      setMode(s.defaultMode || 'live');
      // Migrate legacy bare-id favorites to the typed "live:<id>" form.
      if (Array.isArray(favs)) {
        setFavorites(favs.map((f) => (typeof f === 'string' && f.includes(':') ? f : `live:${f}`)));
      }
      if (Array.isArray(accs)) {
        const dec = await Promise.all(
          accs.map(async (a) => ({ ...a, password: await window.iptv.secureDecrypt(a.password) }))
        );
        setSavedAccounts(dec);
      }
      if (activeAcc) {
        const password = await window.iptv.secureDecrypt(activeAcc.password);
        handleLoginSuccess({ ...activeAcc, password }, false);
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Restore last channel once channels are loaded (if nothing playing yet)
  useEffect(() => {
    if (!channels.length || activePlayable) return;
    window.iptv.storeGet('lastChannel').then((saved) => {
      if (!saved) return;
      const ch = channels.find((c) => c.id === saved.id);
      if (ch) setActivePlayable({ ...ch, type: 'live' });
    });
  }, [channels]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounce the global search so large lists aren't re-filtered on every keystroke.
  useEffect(() => {
    if (!globalQuery) { setDebouncedQuery(''); return; }
    const t = setTimeout(() => setDebouncedQuery(globalQuery), 250);
    return () => clearTimeout(t);
  }, [globalQuery]);

  // Keep watch history fresh across navigation (for the "Weiter" list).
  useEffect(() => {
    if (!account) return;
    getHistory().then(setHistory);
  }, [account, mode, activeGroup, activePlayable, detailItem]);

  // Keyboard: g=Guide, Esc=back, Space=play/pause, ↑/↓=channel (live).
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') {
        if (guideOpen) setGuideOpen(false);
        else if (globalQuery) setGlobalQuery('');
        else if (detailItem) setDetailItem(null);
        return;
      }
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

      if (e.key === 'g' && account && mode === 'live') { setGuideOpen((v) => !v); return; }

      if (e.key === ' ') {
        const v = document.querySelector('video.video-el');
        if (v) { e.preventDefault(); v.paused ? v.play().catch(() => {}) : v.pause(); }
        return;
      }

      const nav = navRef.current;
      if (nav.mode === 'live' && !nav.blocked && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        e.preventDefault();
        const list = nav.visibleItems || [];
        if (!list.length) return;
        const idx = list.findIndex((c) => c.id === nav.activeId);
        const nextIdx = idx < 0 ? 0 : (e.key === 'ArrowDown' ? idx + 1 : idx - 1);
        selectChannel(list[Math.max(0, Math.min(list.length - 1, nextIdx))]);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [account, mode, guideOpen, globalQuery, detailItem]);

  function showToast(msg, type = 'info') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  // ── Navigation ──────────────────────────────────────────────────────────────
  function switchMode(m) {
    setMode(m);
    setActiveGroup('Alle');
    setDetailItem(null);
    setGlobalQuery('');
  }

  function selectChannel(ch) {
    setActivePlayable({ ...ch, type: 'live' });
    setDetailItem(null);
    setGuideOpen(false);
    setGlobalQuery('');
    window.iptv.storeSet('lastChannel', { id: ch.id, name: ch.name });
  }

  function playMovie(movie) {
    setActivePlayable({
      id: movie.id, name: movie.name, url: movieUrl(account, movie), type: 'movie',
      logo: movie.logo, containerExt: movie.containerExt,
    });
    setDetailItem(null);
  }

  function playEpisode(ep, series) {
    const s = series || detailItem?.item || null;
    setActivePlayable({
      id: ep.id, name: ep.name, url: episodeUrl(account, ep), type: 'episode',
      logo: s?.logo || ep.seriesLogo, containerExt: ep.containerExt,
      seriesId: s?.id || ep.seriesId, seriesName: s?.name || ep.seriesName,
      season: ep.season, episodeNum: ep.episodeNum,
    });
    setDetailItem(null);
  }

  // Resume a series from the "Weiter" list (its stored last episode).
  function playContinueSeries(item) {
    const c = item.__episode;
    playEpisode({
      id: c.episodeId, name: c.name, containerExt: c.containerExt,
      season: c.season, episodeNum: c.episodeNum,
      seriesId: c.seriesId, seriesName: c.seriesName, seriesLogo: c.seriesLogo,
    });
  }

  function openDetail(type, item) {
    setDetailItem({ type, item });
    setGlobalQuery('');
  }

  function handleSearchSelect(type, item) {
    if (type === 'live')        { switchMode('live');   selectChannel(item); }
    else if (type === 'movie')  { setMode('movies'); setActiveGroup('Alle'); openDetail('movie', item); }
    else if (type === 'series') { setMode('series'); setActiveGroup('Alle'); openDetail('series', item); }
    setGlobalQuery('');
  }

  // ── Loading ─────────────────────────────────────────────────────────────────
  async function handleLoginSuccess(acc, save = true) {
    const loginId = ++loginNonceRef.current;
    setAccount(acc);
    setLoading(true);
    // Clear the previous account's content so stale data can't linger.
    setMovies([]); setSeries([]); setEpg({});
    setActivePlayable(null); setDetailItem(null); setGlobalQuery('');

    try {
      // Use Xtream Codes JSON API — works even when M3U endpoint is blocked
      const chs = await window.iptv.loadXtreamChannels(acc.baseUrl, acc.username, acc.password);
      if (loginNonceRef.current !== loginId) return; // superseded by a newer login
      setChannels(chs);
      setActiveGroup('Alle');
      showToast(`${chs.length} Kanäle geladen`, 'success');
    } catch (e) {
      if (loginNonceRef.current === loginId) showToast('Kanäle konnten nicht geladen werden: ' + e.message, 'error');
    }

    setLoading(false);

    const stillCurrent = () => loginNonceRef.current === loginId;

    // Load EPG in background (non-blocking) — honor a custom EPG URL from settings.
    const s = await getSettings();
    const epgUrl = s.epgUrl || `${acc.baseUrl}/xmltv.php?username=${encodeURIComponent(acc.username)}&password=${encodeURIComponent(acc.password)}`;
    window.iptv.loadXMLTVUrl(epgUrl)
      .then((data) => { if (stillCurrent()) setEpg(data); })
      .catch(() => {});

    // Load VOD + series in background (needed for the global search)
    setMoviesLoading(true);
    window.iptv.loadXtreamVod(acc.baseUrl, acc.username, acc.password)
      .then((m) => { if (stillCurrent()) setMovies(Array.isArray(m) ? m : []); })
      .catch(() => {})
      .finally(() => { if (stillCurrent()) setMoviesLoading(false); });

    setSeriesLoading(true);
    window.iptv.loadXtreamSeries(acc.baseUrl, acc.username, acc.password)
      .then((s) => { if (stillCurrent()) setSeries(Array.isArray(s) ? s : []); })
      .catch(() => {})
      .finally(() => { if (stillCurrent()) setSeriesLoading(false); });

    if (save) {
      const accToStore = { baseUrl: acc.baseUrl, username: acc.username, password: acc.password };
      const filtered = savedAccounts.filter(
        (a) => !(a.baseUrl === accToStore.baseUrl && a.username === accToStore.username)
      );
      const next = [accToStore, ...filtered].slice(0, 5); // max 5 saved accounts
      setSavedAccounts(next);
      // Persist with passwords encrypted via the OS keyring.
      const encList = await Promise.all(
        next.map(async (a) => ({ ...a, password: await window.iptv.secureEncrypt(a.password) }))
      );
      window.iptv.storeSet('savedAccounts', encList);
      window.iptv.storeSet('activeAccount', { ...accToStore, password: await window.iptv.secureEncrypt(accToStore.password) });
    }
  }

  function handleDeleteAccount(index) {
    const next = savedAccounts.filter((_, i) => i !== index);
    setSavedAccounts(next);
    Promise.all(
      next.map(async (a) => ({ ...a, password: await window.iptv.secureEncrypt(a.password) }))
    ).then((enc) => window.iptv.storeSet('savedAccounts', enc));
  }

  function handleLogout() {
    setAccount(null);
    setChannels([]); setMovies([]); setSeries([]);
    setEpg({});
    setActivePlayable(null);
    setDetailItem(null);
    setGlobalQuery('');
    setMode('live');
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

  function toggleFavorite(type, id) {
    const key = `${type}:${id}`;
    setFavorites((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      window.iptv.storeSet('favorites', next);
      return next;
    });
  }

  function handleReload() {
    if (account) handleLoginSuccess(account, false);
  }

  function handleSaveSettings(next) {
    setSettings(next);
    saveSettings(next);
  }

  function handleClearHistory() {
    clearAllProgress();
    setHistory({});
  }

  // ── Derived: current collection, categories, visible items ───────────────────
  const collection = mode === 'live' ? channels : mode === 'movies' ? movies : series;

  const groups = mode === 'live'
    ? ['Alle', 'Favoriten', ...new Set(channels.map((c) => c.group).filter(Boolean))]
    : ['Alle', 'Weiter', 'Favoriten', ...new Set(collection.map((c) => c.group).filter(Boolean))];

  // "Weiter" (continue watching) list built from watch history.
  function buildContinue() {
    const entries = Object.values(history);
    if (mode === 'movies') {
      return entries.filter((e) => e.card?.kind === 'movie')
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map((e) => ({ id: e.card.id, name: e.card.name, logo: e.card.logo, group: 'Weiter', containerExt: e.card.containerExt }));
    }
    if (mode === 'series') {
      const bySeries = {};
      for (const e of entries) {
        if (e.card?.kind !== 'episode') continue;
        const sid = e.card.seriesId;
        if (!bySeries[sid] || e.updatedAt > bySeries[sid].updatedAt) bySeries[sid] = e;
      }
      return Object.values(bySeries).sort((a, b) => b.updatedAt - a.updatedAt)
        .map((e) => ({ id: e.card.seriesId, name: e.card.seriesName, logo: e.card.seriesLogo, group: 'Weiter', __episode: e.card }));
    }
    return [];
  }

  const visibleItems = (activeGroup === 'Weiter' && mode !== 'live')
    ? buildContinue()
    : collection.filter((c) => {
        if (activeGroup === 'Favoriten') return favorites.includes(`${itemType}:${c.id}`);
        if (activeGroup !== 'Alle' && c.group !== activeGroup) return false;
        return true;
      });

  const activeItemId = detailItem ? detailItem.item.id
    : mode === 'live' ? activeLiveChannel?.id
    : null;

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

  const searching = debouncedQuery.trim().length > 0;
  const epgReady = Object.keys(epg).length > 0;
  const host = (() => { try { return new URL(account.baseUrl).hostname; } catch { return account.baseUrl; } })();

  // Snapshot for the keyboard handler (avoids re-subscribing on every render).
  navRef.current = {
    mode,
    visibleItems,
    activeId: activeLiveChannel?.id,
    blocked: searching || !!detailItem || guideOpen,
  };

  return (
    <div className="app">
      <main className="app-main">
        {searching ? (
          <SearchResults
            query={debouncedQuery}
            live={channels}
            movies={movies}
            series={series}
            moviesLoading={moviesLoading}
            seriesLoading={seriesLoading}
            onSelect={handleSearchSelect}
          />
        ) : detailItem?.type === 'movie' ? (
          <MovieDetail
            movie={detailItem.item}
            account={account}
            onPlay={playMovie}
            onBack={() => setDetailItem(null)}
            isFav={favorites.includes(`movie:${detailItem.item.id}`)}
            onToggleFav={() => toggleFavorite('movie', detailItem.item.id)}
          />
        ) : detailItem?.type === 'series' ? (
          <SeriesDetail
            series={detailItem.item}
            account={account}
            activeEpisodeId={activePlayable?.type === 'episode' ? activePlayable.id : null}
            onPlayEpisode={playEpisode}
            onBack={() => setDetailItem(null)}
            isFav={favorites.includes(`series:${detailItem.item.id}`)}
            onToggleFav={() => toggleFavorite('series', detailItem.item.id)}
          />
        ) : (
          <VideoPlayer channel={activePlayable} epg={epg} showEpg={epgBarOpen} hlsBuffer={settings.hlsBuffer} />
        )}
      </main>

      <Toolbar
        mode={mode}
        onModeChange={switchMode}
        onOpenFile={handleOpenM3UFile}
        onLoadUrl={handleLoadM3UUrl}
        onOpenEPG={handleOpenEPG}
        onLoadEPGUrl={handleLoadEPGUrl}
        onReload={handleReload}
        epgBarOpen={epgBarOpen}
        onToggleEPG={() => setEpgBarOpen((v) => !v)}
        guideOpen={guideOpen}
        onToggleGuide={() => setGuideOpen((v) => !v)}
        onOpenSettings={() => setSettingsOpen(true)}
        loading={loading}
      />

      {mode === 'live' && activeLiveChannel && !searching && !detailItem && (
        <div className="live-tag">
          <span className="live-tag-dot" />
          <span className="live-tag-text">LIVE · {activeLiveChannel.name}</span>
        </div>
      )}

      <button className="account-chip" onClick={handleLogout} title="Abmelden">
        {account.username}@{host} · Abmelden
      </button>

      <Sidebar
        mode={mode}
        items={visibleItems}
        groups={groups}
        activeGroup={activeGroup}
        onGroupChange={setActiveGroup}
        activeItemId={activeItemId}
        onItemSelect={(item) => {
          if (mode === 'live') { selectChannel(item); return; }
          if (activeGroup === 'Weiter') {
            if (mode === 'movies') playMovie(item);
            else playContinueSeries(item);
            return;
          }
          openDetail(mode === 'movies' ? 'movie' : 'series', item);
        }}
        favorites={favorites}
        onToggleFavorite={toggleFavorite}
        globalQuery={globalQuery}
        onGlobalSearch={setGlobalQuery}
        totalCount={collection.length}
        epgReady={epgReady}
        epg={epg}
        listLoading={mode === 'movies' ? moviesLoading : mode === 'series' ? seriesLoading : false}
      />

      {guideOpen && mode === 'live' && (
        <EPGGrid
          channels={visibleItems}
          epg={epg}
          activeChannel={activeLiveChannel}
          onSelect={selectChannel}
          onClose={() => setGuideOpen(false)}
        />
      )}

      {settingsOpen && (
        <Settings
          settings={settings}
          onSave={handleSaveSettings}
          onClearHistory={handleClearHistory}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
    </div>
  );
}
