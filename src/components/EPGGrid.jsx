import { useState, useEffect, useMemo, useRef } from 'react';
import { matchProgrammes } from '../epg.js';

const PPM = 6;                 // pixels per minute (30 min = 180px)
const LABEL_W = 180;           // channel column width
const SLOT_MIN = 30;           // time-axis grid step (minutes)
const MAX_HOURS = 24;          // cap the visible window so the track stays sane

function floorToHalfHour(d) {
  const r = new Date(d);
  r.setMinutes(r.getMinutes() < 30 ? 0 : 30, 0, 0);
  return r;
}

function fmtTime(d) {
  return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

export default function EPGGrid({ channels, epg, activeChannel, onSelect, onClose }) {
  const [now, setNow] = useState(new Date());
  const scrollRef = useRef(null);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  // Resolve programmes per channel once per channels/epg change.
  const rows = useMemo(
    () => channels.map((ch) => ({ ch, progs: matchProgrammes(epg, ch) })),
    [channels, epg]
  );

  // Window: floor(now) → latest stop across channels, capped, min 6h.
  const windowStart = useMemo(() => floorToHalfHour(now), [now]);
  const windowEnd = useMemo(() => {
    let max = 0;
    for (const { progs } of rows) {
      for (const p of progs) if (p.stopDate && p.stopDate > max) max = +p.stopDate;
    }
    const start = +windowStart;
    const cap = start + MAX_HOURS * 3600000;
    const min = start + 6 * 3600000;
    return new Date(Math.min(cap, Math.max(min, max)));
  }, [rows, windowStart]);

  const totalMin = (windowEnd - windowStart) / 60000;
  const trackW = totalMin * PPM;
  const nowX = ((now - windowStart) / 60000) * PPM;

  const slots = useMemo(() => {
    const out = [];
    for (let m = 0; m <= totalMin; m += SLOT_MIN) {
      out.push({ x: m * PPM, label: fmtTime(new Date(+windowStart + m * 60000)) });
    }
    return out;
  }, [totalMin, windowStart]);

  const scrollToNow = () => {
    if (scrollRef.current) scrollRef.current.scrollLeft = Math.max(0, nowX - 120);
  };

  // Jump to "now" once on mount.
  useEffect(scrollToNow, []); // eslint-disable-line react-hooks/exhaustive-deps

  function blockLayout(p) {
    const start = Math.max(+p.startDate, +windowStart);
    const stop = p.stopDate ? +p.stopDate : start + 30 * 60000;
    if (stop <= +windowStart) return null;        // already over
    const left = ((start - windowStart) / 60000) * PPM;
    const width = Math.max(2, ((stop - start) / 60000) * PPM);
    const live = +p.startDate <= now && (!p.stopDate || +p.stopDate > now);
    return { left, width, live };
  }

  return (
    <div className="epg-grid-overlay">
      <div className="epg-grid-bar">
        <span className="epg-grid-title">TV-Guide</span>
        <span className="epg-grid-sub">{rows.length} Kanäle</span>
        <div className="epg-grid-bar-spacer" />
        <button className="toolbar-btn" onClick={scrollToNow} title="Zur aktuellen Zeit">Jetzt</button>
        <button className="toolbar-btn" onClick={onClose} title="Schließen (Esc)">✕</button>
      </div>

      <div className="epg-grid-scroll" ref={scrollRef}>
        <div className="epg-grid-inner" style={{ width: LABEL_W + trackW }}>
          {/* time axis */}
          <div className="epg-grid-timeline" style={{ height: 32 }}>
            <div className="epg-grid-corner" style={{ width: LABEL_W }} />
            <div className="epg-grid-slots" style={{ width: trackW }}>
              {slots.map((s, i) => (
                <span key={i} className="epg-grid-slot" style={{ left: s.x }}>{s.label}</span>
              ))}
            </div>
          </div>

          {/* now line (spans all rows, below the timeline) */}
          {nowX >= 0 && nowX <= trackW && (
            <div className="epg-grid-nowline" style={{ left: LABEL_W + nowX, top: 32 }} />
          )}

          {/* channel rows */}
          {rows.map(({ ch, progs }) => (
            <div
              key={ch.id}
              className={`epg-grid-row ${activeChannel?.id === ch.id ? 'active' : ''}`}
            >
              <div
                className="epg-grid-channel"
                style={{ width: LABEL_W }}
                onClick={() => onSelect(ch)}
                title={ch.name}
              >
                {ch.logo
                  ? <img className="epg-grid-logo" src={ch.logo} alt="" onError={(e) => { e.target.style.display = 'none'; }} />
                  : <div className="epg-grid-logo-ph" />}
                <span className="epg-grid-chname">{ch.name}</span>
              </div>

              <div className="epg-grid-track" style={{ width: trackW }}>
                {progs.length === 0 && <span className="epg-grid-noepg">Kein EPG</span>}
                {progs.map((p, i) => {
                  const l = blockLayout(p);
                  if (!l) return null;
                  return (
                    <button
                      key={i}
                      className={`epg-grid-prog ${l.live ? 'live' : ''}`}
                      style={{ left: l.left, width: l.width }}
                      onClick={() => onSelect(ch)}
                      title={`${p.title}\n${fmtTime(p.startDate)}${p.stopDate ? '–' + fmtTime(p.stopDate) : ''}${p.desc ? '\n\n' + p.desc : ''}`}
                    >
                      <span className="epg-grid-prog-title">{p.title}</span>
                      <span className="epg-grid-prog-time">{fmtTime(p.startDate)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
