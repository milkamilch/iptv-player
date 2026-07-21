import { useState, useEffect } from 'react';

export default function MovieDetail({ movie, account, onPlay, onBack, isFav, onToggleFav }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setDetail(null);
    window.iptv
      .loadXtreamVodInfo(account.baseUrl, account.username, account.password, movie.id)
      .then((d) => { if (alive) setDetail(d); })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [movie, account]);

  const poster = detail?.image || movie.logo;
  const meta = [detail?.year || movie.year, detail?.genre, detail?.duration].filter(Boolean);

  function handlePlay() {
    onPlay({ ...movie, containerExt: detail?.containerExt || movie.containerExt });
  }

  return (
    <div className="detail">
      <button className="detail-back" onClick={onBack}>← Zurück</button>
      <div className="detail-head">
        {poster
          ? <img className="detail-poster" src={poster} alt="" onError={(e) => { e.target.style.display = 'none'; }} />
          : <div className="detail-poster detail-poster-ph" />}
        <div className="detail-info">
          <h1 className="detail-title">{movie.name}</h1>
          {meta.length > 0 && <div className="detail-meta">{meta.join(' · ')}</div>}
          {(detail?.rating || movie.rating) && (
            <div className="detail-rating">★ {detail?.rating || movie.rating}</div>
          )}
          <div className="detail-actions">
            <button className="detail-play" onClick={handlePlay}>▶ Abspielen</button>
            <button
              className={`detail-fav ${isFav ? 'on' : ''}`}
              onClick={onToggleFav}
              title={isFav ? 'Aus Favoriten entfernen' : 'Zu Favoriten'}
            >★</button>
          </div>
          {loading && <span className="detail-loading">lädt Infos…</span>}
          {detail?.plot && <p className="detail-plot">{detail.plot}</p>}
          {detail?.cast && <p className="detail-cast"><strong>Mit:</strong> {detail.cast}</p>}
          {detail?.director && <p className="detail-cast"><strong>Regie:</strong> {detail.director}</p>}
        </div>
      </div>
    </div>
  );
}
