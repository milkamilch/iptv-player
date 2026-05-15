import { useState, useEffect } from 'react';

function fmtTime(isoStr) {
  if (!isoStr) return '';
  return new Date(isoStr).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

export default function EPGBar({ channel, epg }) {
  const [programmes, setProgrammes] = useState([]);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!channel || !epg) { setProgrammes([]); return; }

    // Try to match by tvgId
    const tvgId = channel.tvgId;
    let progs = epg[tvgId] || [];

    // Fallback: try matching by channel name (lowercase)
    if (!progs.length) {
      const nameLower = channel.name.toLowerCase();
      for (const [key, val] of Object.entries(epg)) {
        if (key.toLowerCase().includes(nameLower) || nameLower.includes(key.toLowerCase())) {
          progs = val;
          break;
        }
      }
    }

    // Resolve dates and sort
    const resolved = progs.map((p) => ({
      ...p,
      startDate: parseXMLTVDateStr(p.start),
      stopDate:  p.stop ? parseXMLTVDateStr(p.stop) : null,
    })).sort((a, b) => a.startDate - b.startDate);

    setProgrammes(resolved);
  }, [channel, epg]);

  if (!programmes.length) {
    return (
      <div className="epg-bar epg-bar-empty">
        <span>Kein EPG verfügbar</span>
        {channel?.tvgId && <span className="epg-tvg-id">tvg-id: {channel.tvgId}</span>}
      </div>
    );
  }

  const current = programmes.find(
    (p) => p.startDate <= now && (!p.stopDate || p.stopDate > now)
  );
  const upcoming = programmes.filter(
    (p) => p.startDate > now
  ).slice(0, 5);

  function progressPercent(prog) {
    if (!prog.stopDate) return 0;
    const total = prog.stopDate - prog.startDate;
    const elapsed = now - prog.startDate;
    return Math.min(100, Math.max(0, (elapsed / total) * 100));
  }

  return (
    <div className="epg-bar">
      {current && (
        <div className="epg-current">
          <div className="epg-now-label">JETZT</div>
          <div className="epg-current-info">
            <span className="epg-current-title">{current.title}</span>
            <span className="epg-time">
              {fmtTime(current.startDate?.toISOString())} – {fmtTime(current.stopDate?.toISOString())}
            </span>
            {current.desc && <span className="epg-desc">{current.desc}</span>}
          </div>
          <div className="epg-progress-bar">
            <div className="epg-progress-fill" style={{ width: `${progressPercent(current)}%` }} />
          </div>
        </div>
      )}

      <div className="epg-upcoming">
        {upcoming.map((p, i) => (
          <div key={i} className="epg-upcoming-item">
            <span className="epg-upcoming-time">{fmtTime(p.startDate?.toISOString())}</span>
            <span className="epg-upcoming-title">{p.title}</span>
            {p.category && <span className="epg-category">{p.category}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function parseXMLTVDateStr(str) {
  if (!str || str.length < 14) return null;
  return new Date(
    parseInt(str.slice(0, 4)),
    parseInt(str.slice(4, 6)) - 1,
    parseInt(str.slice(6, 8)),
    parseInt(str.slice(8, 10)),
    parseInt(str.slice(10, 12)),
    parseInt(str.slice(12, 14))
  );
}
