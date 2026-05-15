import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';

// Save position every 5s, but only for non-live streams (duration > 0 and finite)
const SAVE_INTERVAL_MS = 5000;
// Don't save position for the last 10s of a stream (treat as "finished")
const NEAR_END_THRESHOLD = 10;

function isLiveStream(channel) {
  // Live channels have stream_type 'live' or their URL contains /live/
  return channel?.stream_type === 'live' || channel?.url?.includes('/live/');
}

export default function VideoPlayer({ channel }) {
  const videoRef    = useRef(null);
  const hlsRef      = useRef(null);
  const saveTimerRef = useRef(null);
  const [error, setError]         = useState(null);
  const [loading, setLoading]     = useState(false);
  const [muted, setMuted]         = useState(false);
  const [volume, setVolume]       = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [resumePos, setResumePos]   = useState(null); // seconds to resume from
  const [showResume, setShowResume] = useState(false);

  // Save position to persistent store
  function savePosition(channelId, seconds) {
    if (!channelId || seconds < 5) return;
    window.iptv.storeGet('playbackPositions').then((positions) => {
      const next = { ...(positions || {}), [channelId]: Math.floor(seconds) };
      window.iptv.storeSet('playbackPositions', next);
    });
  }

  // Clear saved position (stream finished or near end)
  function clearPosition(channelId) {
    if (!channelId) return;
    window.iptv.storeGet('playbackPositions').then((positions) => {
      if (!positions?.[channelId]) return;
      const next = { ...positions };
      delete next[channelId];
      window.iptv.storeSet('playbackPositions', next);
    });
  }

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Stop position-saving timer from previous stream
    clearInterval(saveTimerRef.current);

    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
    video.src = '';
    setError(null);
    setShowResume(false);
    setResumePos(null);

    if (!channel) return;

    const url  = channel.url;
    const live = isLiveStream(channel);
    setLoading(true);

    // Check for saved position (only for non-live)
    const tryResume = !live
      ? window.iptv.storeGet('playbackPositions').then((positions) => positions?.[channel.id] || 0)
      : Promise.resolve(0);

    function startPlayback(savedPos) {
      const isHLS = url.includes('.m3u8') || url.includes('m3u8');

      function onReady() {
        setLoading(false);
        if (savedPos > 5) {
          setResumePos(savedPos);
          setShowResume(true);
        } else {
          video.play().catch(() => {});
        }
        // Start periodic position saving for non-live
        if (!live) {
          saveTimerRef.current = setInterval(() => {
            if (!video.paused && video.currentTime > 5 && isFinite(video.duration)) {
              const nearEnd = video.duration - video.currentTime < NEAR_END_THRESHOLD;
              if (nearEnd) {
                clearPosition(channel.id);
              } else {
                savePosition(channel.id, video.currentTime);
              }
            }
          }, SAVE_INTERVAL_MS);
        }
      }

      if (isHLS && Hls.isSupported()) {
        const hls = new Hls({ enableWorker: true, lowLatencyMode: live });
        hlsRef.current = hls;
        hls.loadSource(url);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, onReady);
        hls.on(Hls.Events.ERROR, (_e, data) => {
          if (data.fatal) { setLoading(false); setError(`Stream-Fehler: ${data.type}`); }
        });
      } else {
        video.src = url;
        video.oncanplay = onReady;
        video.onerror = () => { setLoading(false); setError('Stream konnte nicht geladen werden.'); };
      }
    }

    tryResume.then(startPlayback);

    // Save position when leaving this channel
    return () => {
      clearInterval(saveTimerRef.current);
      if (!live && video.currentTime > 5 && isFinite(video.duration)) {
        const nearEnd = video.duration - video.currentTime < NEAR_END_THRESHOLD;
        if (!nearEnd) savePosition(channel.id, video.currentTime);
        else clearPosition(channel.id);
      }
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
      video.src = '';
    };
  }, [channel]);

  function handleResume() {
    const video = videoRef.current;
    if (!video || !resumePos) return;
    video.currentTime = resumePos;
    video.play().catch(() => {});
    setShowResume(false);
  }

  function handleRestartFromBeginning() {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = 0;
    video.play().catch(() => {});
    clearPosition(channel.id);
    setShowResume(false);
  }

  function handleVolumeChange(e) {
    const v = parseFloat(e.target.value);
    setVolume(v);
    if (videoRef.current) videoRef.current.volume = v;
    setMuted(v === 0);
  }

  function handleMuteToggle() {
    if (!videoRef.current) return;
    const next = !muted;
    setMuted(next);
    videoRef.current.muted = next;
  }

  function handleFullscreen() {
    if (!document.fullscreenElement) {
      videoRef.current?.parentElement?.requestFullscreen();
      setFullscreen(true);
    } else {
      document.exitFullscreen();
      setFullscreen(false);
    }
  }

  function fmtTime(s) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
    return `${m}:${String(sec).padStart(2,'0')}`;
  }

  return (
    <div className="video-wrapper">
      {!channel && (
        <div className="video-empty">
          <div className="video-empty-icon">📺</div>
          <p>Kanal auswählen</p>
          <p className="video-empty-sub">Lade eine M3U-Playlist und wähle einen Kanal links</p>
        </div>
      )}

      <video
        ref={videoRef}
        className="video-el"
        style={{ display: channel ? 'block' : 'none' }}
        muted={muted}
        playsInline
      />

      {loading && channel && (
        <div className="video-overlay">
          <div className="spinner" />
          <span>Verbinde…</span>
        </div>
      )}

      {error && (
        <div className="video-overlay video-error">
          <span>⚠ {error}</span>
          <button onClick={() => { setError(null); }}>Neu versuchen</button>
        </div>
      )}

      {/* Resume prompt */}
      {showResume && !loading && !error && (
        <div className="video-overlay resume-overlay">
          <div className="resume-box">
            <p className="resume-title">Weiterschauen?</p>
            <p className="resume-time">Zuletzt bei <strong>{fmtTime(resumePos)}</strong></p>
            <div className="resume-actions">
              <button className="resume-btn-primary" onClick={handleResume}>
                ▶ Fortsetzen
              </button>
              <button className="resume-btn-secondary" onClick={handleRestartFromBeginning}>
                ↺ Von vorne
              </button>
            </div>
          </div>
        </div>
      )}

      {channel && (
        <div className="video-controls">
          <span className="video-ch-name">{channel.name}</span>
          <div className="video-ctrl-right">
            <button className="ctrl-btn" onClick={handleMuteToggle} title="Ton">
              {muted ? '🔇' : '🔊'}
            </button>
            <input
              className="volume-slider"
              type="range" min="0" max="1" step="0.05"
              value={muted ? 0 : volume}
              onChange={handleVolumeChange}
            />
            <button className="ctrl-btn" onClick={handleFullscreen} title="Vollbild">
              {fullscreen ? '⊡' : '⛶'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
