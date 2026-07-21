import { useState, useEffect } from 'react';
import { getHistory, getWatched, playableKey } from '../progress.js';

export default function SeriesDetail({ series, account, activeEpisodeId, onPlayEpisode, onBack, isFav, onToggleFav }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [season, setSeason] = useState(null);
  const [history, setHistory] = useState({});
  const [watched, setWatched] = useState({});

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setData(null);
    setSeason(null);
    Promise.all([
      window.iptv.loadXtreamSeriesInfo(account.baseUrl, account.username, account.password, series.id),
      getHistory(),
      getWatched(),
    ])
      .then(([d, h, w]) => {
        if (!alive) return;
        setData(d); setHistory(h); setWatched(w);
        if (d.seasons?.length) setSeason(d.seasons[0].season);
      })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [series, account]);

  const cover = data?.info?.cover || series.logo;
  const meta = [series.year, data?.info?.genre || series.genre].filter(Boolean);
  const currentSeason = data?.seasons?.find((s) => s.season === season);

  function play(ep, seasonNum) {
    onPlayEpisode({ ...ep, season: seasonNum });
  }

  // Most recently watched episode across all seasons (for the resume button).
  let resume = null;
  for (const s of (data?.seasons || [])) {
    for (const ep of s.episodes) {
      const e = history[playableKey('episode', ep.id)];
      if (e && (!resume || e.updatedAt > resume.updatedAt)) resume = { ep, season: s.season, ...e };
    }
  }

  function progressPct(ep) {
    const e = history[playableKey('episode', ep.id)];
    if (!e || !e.duration) return 0;
    return Math.min(100, Math.round((e.position / e.duration) * 100));
  }

  return (
    <div className="detail">
      <button className="detail-back" onClick={onBack}>← Zurück</button>
      <div className="detail-head">
        {cover
          ? <img className="detail-poster" src={cover} alt="" onError={(e) => { e.target.style.display = 'none'; }} />
          : <div className="detail-poster detail-poster-ph" />}
        <div className="detail-info">
          <h1 className="detail-title">{series.name}</h1>
          {meta.length > 0 && <div className="detail-meta">{meta.join(' · ')}</div>}
          {(data?.info?.rating || series.rating) && (
            <div className="detail-rating">★ {data?.info?.rating || series.rating}</div>
          )}
          <div className="detail-actions">
            {resume && (
              <button className="detail-play" onClick={() => play(resume.ep, resume.season)}>
                ▶ Fortsetzen · S{resume.season} E{resume.ep.episodeNum}
              </button>
            )}
            <button
              className={`detail-fav ${isFav ? 'on' : ''}`}
              onClick={onToggleFav}
              title={isFav ? 'Aus Favoriten entfernen' : 'Zu Favoriten'}
            >★</button>
          </div>
          {(data?.info?.plot || series.plot) && (
            <p className="detail-plot">{data?.info?.plot || series.plot}</p>
          )}
        </div>
      </div>

      {loading && <div className="detail-loading detail-loading-block">lädt Episoden…</div>}

      {!loading && !currentSeason && (
        <div className="detail-loading detail-loading-block">Keine Episoden gefunden</div>
      )}

      {data?.seasons?.length > 1 && (
        <div className="season-tabs">
          {data.seasons.map((s) => (
            <button
              key={s.season}
              className={`season-tab ${s.season === season ? 'active' : ''}`}
              onClick={() => setSeason(s.season)}
            >
              Staffel {s.season}
            </button>
          ))}
        </div>
      )}

      {currentSeason && (
        <ul className="episode-list">
          {currentSeason.episodes.map((ep) => {
            const isWatched = !!watched[playableKey('episode', ep.id)];
            const pct = progressPct(ep);
            return (
              <li
                key={ep.id}
                className={`episode-item ${ep.id === activeEpisodeId ? 'active' : ''}`}
                onClick={() => play(ep, currentSeason.season)}
              >
                <span className="episode-num">{ep.episodeNum}</span>
                <div className="episode-body">
                  <span className="episode-name">{ep.name}</span>
                  {ep.plot && <span className="episode-plot">{ep.plot}</span>}
                  {pct > 0 && (
                    <div className="episode-progress"><div className="episode-progress-fill" style={{ width: `${pct}%` }} /></div>
                  )}
                </div>
                {isWatched && <span className="episode-watched" title="Gesehen">✓</span>}
                <span className="episode-play">▶</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
