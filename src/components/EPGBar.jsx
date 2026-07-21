import { useState, useEffect } from 'react';
import { matchProgrammes } from '../epg.js';

function fmtTime(d) {
  if (!d) return '';
  return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

export default function EPGBar({ channel, epg }) {
  const [programmes, setProgrammes] = useState([]);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    setProgrammes(matchProgrammes(epg, channel));
  }, [channel, epg]);

  if (!programmes.length) return null;

  const current = programmes.find((p) => p.startDate <= now && (!p.stopDate || p.stopDate > now));
  const upcoming = programmes.filter((p) => p.startDate > now).slice(0, 3);

  function progressPercent(prog) {
    if (!prog?.stopDate) return 0;
    const total = prog.stopDate - prog.startDate;
    return Math.min(100, Math.max(0, ((now - prog.startDate) / total) * 100));
  }

  return (
    <div className="nownext">
      {current && (
        <div className="nn-now">
          <div className="nn-label">JETZT · {fmtTime(current.startDate)}</div>
          <div className="nn-title">{current.title}</div>
          <div className="nn-progress">
            <div className="nn-fill" style={{ width: `${progressPercent(current)}%` }} />
          </div>
        </div>
      )}

      {upcoming.length > 0 && (
        <div className="nn-upcoming">
          {upcoming.map((p, i) => (
            <div key={i} className="nn-tile">
              <div className="nn-time">{fmtTime(p.startDate)}</div>
              <div className="nn-tiletitle">{p.title}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
