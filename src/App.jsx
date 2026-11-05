import { useState, useEffect, useRef, useMemo } from 'react';
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
import { buildCountryIndex, categoryCounts, FAVORITES, CONTINUE } from './country.mjs';
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
  // null = Kategorienliste, sonst 'Alle' | Kategoriename | FAVORITES | CONTINUE
  // (die beiden Sentinels nur ohne Länderebene, mit ihr sind sie ein Pseudo-Land).
  const [activeGroup, setActiveGroup]     = useState(null);
  const [activeCountry, setActiveCountry] = useState(null); // null = Länderliste
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
  const toastTimerRef = useRef(null);

  const activeLiveChannel = activePlayable?.type === 'live' ? activePlayable : null;
  const itemType = mode === 'live' ? 'live' : mode === 'movies' ? 'movie' : 'series';

  // Länderebene für alle Modi: ein gemeinsames Land (einmal "Deutschland"
  // wählen gilt für Sender, Filme und Serien), je Liste ein Index, der nur
  // neu entsteht, wenn die Liste neu geladen wird. VOD-Kategorien tragen
  // selten ein Länderpräfix, die Titel fast immer (titlePrefix).
  const liveIndex = useMemo(() => buildCountryIndex(channels), [channels]);
  const movieIndex = useMemo(() => buildCountryIndex(movies, { titlePrefix: true }), [movies]);
  const seriesIndex = useMemo(() => buildCountryIndex(series, { titlePrefix: true }), [series]);
  const countryIndex = mode === 'live' ? liveIndex : mode === 'movies' ? movieIndex : seriesIndex;
  const countryMode = countryIndex.enabled;
  const collection = mode === 'live' ? channels : mode === 'movies' ? movies : series;
  const favoriteCount = useMemo(
    () => collection.filter((c) => favorites.includes(`${itemType}:${c.id}`)).length,
    [collection, favorites, itemType],
  );
  const continueCount = useMemo(
    () => (mode === 'live' ? 0 : buildContinue().length),
    [history, mode], // eslint-disable-line react-hooks/exhaustive-deps
  );
  // Gültigkeit wird im Render abgeleitet statt per Effekt auf null gesetzt:
  // ein Land, das es im aktuellen Modus nicht gibt (oder solange die Liste
  // noch lädt), zeigt dort die Länderliste, bleibt aber gemerkt und gilt im
  // nächsten Modus weiter.
  const countryValid = activeCountry === FAVORITES ? favoriteCount > 0
    : activeCountry === CONTINUE ? continueCount > 0
    : activeCountry !== null && countryIndex.countries.some((c) => c.code === activeCountry);
  const countryView = countryMode && !countryValid;
  // Favoriten/Weiter als Pseudo-Land haben keine Kategorieebene: Liste direkt.
  const pseudoCountry = countryMode && (activeCountry === FAVORITES || activeCountry === CONTINUE);
  // Ein Favoriten-/Weiter-Sentinel in activeGroup gilt nur ohne Länderebene
  // (z. B. angeklickt, solange die Filme noch laden). Mit Länderebene ist es
  // veraltet und zählt wie null: Kategorienliste.
  const group = countryMode && (activeGroup === FAVORITES || activeGroup === CONTINUE) ? null : activeGroup;
  const categoryView = !countryView && !pseudoCountry && group === null;
  // Die eine Stelle, die entscheidet, was die Liste zeigt: das Pseudo-Land
  // (mit Länderebene) bzw. der Sentinel in activeGroup (ohne).
  const level = countryMode ? activeCountry : group;

  // Load persisted data on startup
  useEffect(() => {
    Promise.all([
      window.iptv.storeGet('savedAccounts'),
      window.iptv.storeGet('favorites'),
      window.iptv.storeGet('activeAccount'),
      window.iptv.storeGet('lastCountry'),
    ]).then(async ([accs, favs, activeAcc, lastCountry]) => {
      const s = await getSettings();
      setSettings(s);
      setMode(s.defaultMode || 'live');
      // Migrate legacy bare-id favorites to the typed "live:<id>" form.
      if (Array.isArray(favs)) {
        setFavorites(favs.map((f) => (typeof f === 'string' && f.includes(':') ? f : `live:${f}`)));
      }
      if (typeof lastCountry === 'string') setActiveCountry(lastCountry);
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

  // Restore last channel once channels are loaded (if nothing playing yet).
  // Only in live mode — otherwise a "Filme"/"Serien" start mode would still
  // fire up live TV in the background.
  // Läuft über selectChannel statt über setActivePlayable, damit die Leiste
  // beim Start dasselbe Land zeigt, aus dem der wiederhergestellte Kanal
  // stammt. lastCountry und lastChannel liegen unabhängig voneinander im
  // Store und können auseinanderlaufen (leaveCountry löscht nur das Land, ein
  // Landwechsel ohne Kanalwahl schreibt nur das Land) — der laufende Kanal
  // gewinnt, sonst zeigt die Liste ein Land, in dem der Kanal nicht vorkommt.
  useEffect(() => {
    if (!channels.length || activePlayable || mode !== 'live') return;
    // Ein Moduswechsel während des Lesens bricht den Restore ab (#7).
    let cancelled = false;
    window.iptv.storeGet('lastChannel').then((saved) => {
      if (cancelled || !saved) return;
      const ch = channels.find((c) => c.id === saved.id);
      if (ch) selectChannel(ch);
    });
    return () => { cancelled = true; };
  }, [channels, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounce the global search so large lists aren't re-filtered on every keystroke.
  useEffect(() => {
    if (!globalQuery) { setDebouncedQuery(''); return; }
    const t = setTimeout(() => setDebouncedQuery(globalQuery), 250);
    return () => clearTimeout(t);
  }, [globalQuery]);

  // Keep watch history fresh across navigation (for the "Weiter" list).
  // activeCountry: mit Länderebene ist "Weiter" ein Pseudo-Land.
  useEffect(() => {
    if (!account) return;
    getHistory().then(setHistory);
  }, [account, mode, activeGroup, activeCountry, activePlayable, detailItem]);

  // Keyboard: g=Guide, Esc=back, Space=play/pause, ↑/↓=channel (live).
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') {
        if (settingsOpen) setSettingsOpen(false);
        else if (guideOpen) setGuideOpen(false);
        else if (globalQuery) setGlobalQuery('');
        else if (detailItem) setDetailItem(null);
        else goBack();
        return;
      }
      // The settings modal is modal — don't let shortcuts act on what's behind it.
      if (settingsOpen) return;
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
  }, [account, mode, guideOpen, globalQuery, detailItem, settingsOpen, countryMode, countryView, activeGroup, activeCountry]);

  function showToast(msg, type = 'info') {
    // Drop the pending hide timer, else an older toast's timeout cuts this one short.
    clearTimeout(toastTimerRef.current);
    setToast({ msg, type });
    toastTimerRef.current = setTimeout(() => setToast(null), 3500);
  }

  // ── Navigation ──────────────────────────────────────────────────────────────
  function switchMode(m) {
    setMode(m);
    setActiveGroup(null);
    setDetailItem(null);
    setGlobalQuery('');
  }

  function selectChannel(ch) {
    const m = liveIndex.meta.get(ch.id);
    // Eine Regel: steht der Kanal nicht in der offenen Liste (Suche, Guide,
    // Restore), wechselt die Leiste in sein Land und auf "Alle", damit die
    // Zeile sichtbar und markiert ist. Klick und Pfeiltaste liegen in der
    // offenen Liste und lassen Land und Kategorie stehen.
    // navRef statt visibleItems: der Key-Handler hält eine ältere Closure.
    // `liveIndex`, NICHT `countryIndex`: der folgt dem Modus und ist beim
    // Aufruf aus handleSearchSelect render-veraltet. Jeder Aufrufer wählt einen
    // Live-Kanal.
    if (!navRef.current.visibleItems?.some((c) => c.id === ch.id)) {
      if (liveIndex.enabled && m) selectCountry(m.code);
      setActiveGroup('Alle');
    }
    setActivePlayable({ ...ch, type: 'live' });
    setDetailItem(null);
    setGuideOpen(false);
    setGlobalQuery('');
    window.iptv.storeSet('lastChannel', { id: ch.id, name: ch.name });
  }

  function selectCountry(code) {
    setActiveCountry(code);
    setActiveGroup(null);
    window.iptv.storeSet('lastCountry', code);
  }

  function leaveCountry() {
    setActiveCountry(null);
    setActiveGroup(null);
    window.iptv.storeDelete('lastCountry');
  }

  // Esc und Breadcrumb: genau eine Ebene zurück. Ohne Länderebene ist die
  // Kategorienliste die erste Ebene, dort gibt es nichts mehr zu verlassen.
  function goBack() {
    if (countryView) return;
    if (categoryView || pseudoCountry) { if (countryMode) leaveCountry(); return; }
    setActiveGroup(null);
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
    // Kein switchMode: der Modus stimmt (Suche gilt nur für ihn) und es würde
    // die Kategorie, die selectChannel gerade setzt, wieder zurücksetzen.
    // "Alle", damit der Titel in der Liste sichtbar und markiert ist.
    if (type === 'live')        selectChannel(item);
    else if (type === 'movie')  { setActiveGroup('Alle'); openDetail('movie', item); }
    else if (type === 'series') { setActiveGroup('Alle'); openDetail('series', item); }
    setGlobalQuery('');
  }

  // ── Loading ─────────────────────────────────────────────────────────────────
  // The provider's own XMLTV endpoint — used whenever no custom EPG URL is set.
  function providerEpgUrl(acc) {
    return `${acc.baseUrl}/xmltv.php?username=${encodeURIComponent(acc.username)}&password=${encodeURIComponent(acc.password)}`;
  }

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
      setActiveGroup(null);
      showToast(`${chs.length} Kanäle geladen`, 'success');
    } catch (e) {
      if (loginNonceRef.current === loginId) showToast('Kanäle konnten nicht geladen werden: ' + e.message, 'error');
    }

    setLoading(false);

    const stillCurrent = () => loginNonceRef.current === loginId;

    // Load EPG in background (non-blocking) — honor a custom EPG URL from settings.
    const s = await getSettings();
    window.iptv.loadXMLTVUrl(s.epgUrl || providerEpgUrl(acc))
      .then((data) => { if (stillCurrent()) setEpg(data); })
      .catch(() => {});

    // Load VOD + series in background (needed for Filme/Serien)
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

  async function handleDeleteAccount(index) {
    const removed = savedAccounts[index];
    const next = savedAccounts.filter((_, i) => i !== index);
    setSavedAccounts(next);
    const enc = await Promise.all(
      next.map(async (a) => ({ ...a, password: await window.iptv.secureEncrypt(a.password) }))
    );
    window.iptv.storeSet('savedAccounts', enc);

    // Drop the auto-login entry too, otherwise a deleted account signs itself
    // back in on the next start.
    const active = await window.iptv.storeGet('activeAccount');
    if (active && removed && active.baseUrl === removed.baseUrl && active.username === removed.username) {
      window.iptv.storeDelete('activeAccount');
    }
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
        setActiveGroup(null);
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
      setActiveGroup(null);
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
    const epgChanged = next.epgUrl !== settings.epgUrl;
    setSettings(next);
    saveSettings(next);
    // Apply a changed EPG source right away instead of waiting for the next login.
    if (epgChanged && account) handleLoadEPGUrl(next.epgUrl || providerEpgUrl(account));
  }

  function handleClearHistory() {
    clearAllProgress();
    setHistory({});
  }

  // ── Derived: current collection, categories, visible items ───────────────────
  // Kategorienliste: ein O(n)-Lauf je Land (oder je Liste ohne Länderebene).
  // "Alle" ist app-eigen — Provider-Kategorien, die wörtlich so heißen (auch
  // der Rückfall für unkategorisierte Streams), fliegen raus, sonst gäbe es
  // doppelte Keys. Favoriten/Weiter als Pseudo-Land haben keine Kategorien.
  const categories = useMemo(() => {
    if (countryView || pseudoCountry) return [];
    const categoryOf = countryMode
      ? (c) => { const m = countryIndex.meta.get(c.id); return m && m.code === activeCountry ? m.category : null; }
      : (c) => c.group;
    return categoryCounts(collection, categoryOf).filter((c) => c.name !== 'Alle');
  }, [countryView, pseudoCountry, countryMode, countryIndex, activeCountry, collection]);
  const allCount = countryMode
    ? countryIndex.countries.find((c) => c.code === activeCountry)?.count ?? 0
    : collection.length;
  const groupName = pseudoCountry || group === null ? null
    : group === FAVORITES ? 'Favoriten'
    : group === CONTINUE ? 'Weiter'
    : group;

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

  // Memoised so the list keeps its identity across unrelated renders (typing in
  // the search box, clock ticks) — the sidebar memoises its EPG lookups on it.
  const visibleItems = useMemo(() => {
    if (countryView || categoryView) return [];
    if (level === CONTINUE) return buildContinue();
    if (level === FAVORITES) return collection.filter((c) => favorites.includes(`${itemType}:${c.id}`));
    return collection.filter((c) => {
      if (!countryMode) return group === 'Alle' || c.group === group;
      const m = countryIndex.meta.get(c.id);
      if (!m || m.code !== activeCountry) return false;
      return group === 'Alle' || m.category === group;
    });
  }, [countryMode, countryView, categoryView, level, activeCountry, countryIndex, group, mode, collection, favorites, itemType, history]); // eslint-disable-line react-hooks/exhaustive-deps

  // Highlight whatever the list is currently showing for the active playable —
  // for series that's the parent series of the running episode.
  const activeItemId = detailItem ? detailItem.item.id
    : mode === 'live'   ? activeLiveChannel?.id
    : mode === 'movies' ? (activePlayable?.type === 'movie' ? activePlayable.id : null)
    : (activePlayable?.type === 'episode' ? activePlayable.seriesId : null);

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
    blocked: searching || !!detailItem || guideOpen || settingsOpen,
  };

  return (
    <div className="app">
      <main className="app-main">
        {/* The player stays mounted and keeps playing — search and detail pages
            are laid over it instead of replacing it. */}
        <VideoPlayer channel={activePlayable} epg={epg} showEpg={epgBarOpen} hlsBuffer={settings.hlsBuffer} />

        {searching ? (
          <SearchResults
            query={debouncedQuery}
            mode={mode}
            items={collection}
            loading={mode === 'movies' ? moviesLoading : mode === 'series' ? seriesLoading : false}
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
        ) : null}
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
        activeItemId={activeItemId}
        onItemSelect={(item) => {
          if (mode === 'live') { selectChannel(item); return; }
          if (level === CONTINUE) {
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
        epgReady={epgReady}
        epg={epg}
        listLoading={mode === 'movies' ? moviesLoading : mode === 'series' ? seriesLoading : false}
        countryView={countryView}
        countries={countryIndex.countries}
        countryName={
          !countryMode ? null
            : activeCountry === FAVORITES ? 'Favoriten'
            : activeCountry === CONTINUE ? 'Weiter'
            : countryIndex.countries.find((c) => c.code === activeCountry)?.name || null
        }
        // Mit Länderebene stehen Favoriten/Weiter nur in der Länderliste.
        favoriteCount={categoryView && countryMode ? 0 : favoriteCount}
        continueCount={categoryView && countryMode ? 0 : continueCount}
        onSelectCountry={selectCountry}
        onLeaveCountry={leaveCountry}
        categoryView={categoryView}
        categories={categories}
        allCount={allCount}
        groupName={groupName}
        onSelectGroup={setActiveGroup}
        onLeaveGroup={() => setActiveGroup(null)}
      />

      {guideOpen && mode === 'live' && (
        <EPGGrid
          // In Länder- und Kategorienliste ist `visibleItems` leer (noch keine
          // Liste gewählt) — der Guide zeigt dort alle Live-Kanäle statt einer
          // leeren Tabelle.
          // Das ist genau der Zustand nach einer Neuinstallation, und die
          // Zeilen sind gefenstert, kosten also auch bei voller Playlist
          // nichts. Ein Klick im Guide trägt über selectChannel ins Land des
          // gewählten Senders. Guide-Knopf und 'g' bleiben deshalb in beiden
          // Ansichten aktiv und stimmen miteinander überein.
          channels={countryView || categoryView ? channels : visibleItems}
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
