import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';

export default function VideoPlayer({ channel }) {
  const videoRef = useRef(null);
  const hlsRef   = useRef(null);
  const [error, setError]     = useState(null);
  const [loading, setLoading] = useState(false);
  const [muted, setMuted]     = useState(false);
  const [volume, setVolume]   = useState(1);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Cleanup previous instance
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    video.src = '';
    setError(null);

    if (!channel) return;

    const url = channel.url;
    setLoading(true);

    const isHLS = url.includes('.m3u8') || url.includes('m3u8');

    if (isHLS && Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true, lowLatencyMode: true });
      hlsRef.current = hls;
      hls.loadSource(url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setLoading(false);
        video.play().catch(() => {});
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          setLoading(false);
          setError(`Stream-Fehler: ${data.type}`);
        }
      });
    } else {
      // Try native (works for some streams in Electron/Chromium)
      video.src = url;
      video.oncanplay = () => { setLoading(false); video.play().catch(() => {}); };
      video.onerror = () => { setLoading(false); setError('Stream konnte nicht geladen werden.'); };
    }

    return () => {
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
      video.src = '';
    };
  }, [channel]);

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
          <button onClick={() => { setError(null); /* retry */ }}>Neu versuchen</button>
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
