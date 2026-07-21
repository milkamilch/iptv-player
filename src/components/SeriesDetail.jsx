import { useState, useEffect } from 'react';

export default function SeriesDetail({ series, account, activeEpisodeId, onPlayEpisode, onBack }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [season, setSeason] = useState(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setData(null);
    setSeason(null);
    window.iptv
      .loadXtreamSeriesInfo(account.baseUrl, account.username, account.password, series.id)
      .then((d) => {
        if (!alive) return;
        setData(d);
        if (d.seasons?.length) setSeason(d.seasons[0].season);
      })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [series, account]);

  const cover = data?.info?.cover || series.logo;
  const meta = [series.year, data?.info?.genre || series.genre].filter(Boolean);
  const currentSeason = data?.seasons?.find((s) => s.season === season);

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
          {currentSeason.episodes.map((ep) => (
            <li
              key={ep.id}
              className={`episode-item ${ep.id === activeEpisodeId ? 'active' : ''}`}
              onClick={() => onPlayEpisode(ep)}
            >
              <span className="episode-num">{ep.episodeNum}</span>
              <div className="episode-body">
                <span className="episode-name">{ep.name}</span>
                {ep.plot && <span className="episode-plot">{ep.plot}</span>}
              </div>
              <span className="episode-play">▶</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
