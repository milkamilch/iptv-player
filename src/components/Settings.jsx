import { useState } from 'react';

const MODES = [
  { key: 'live', label: 'Live' },
  { key: 'movies', label: 'Filme' },
  { key: 'series', label: 'Serien' },
];
const BUFFERS = [
  { key: 'klein', label: 'Klein' },
  { key: 'normal', label: 'Normal' },
  { key: 'groß', label: 'Groß' },
];

export default function Settings({ settings, onSave, onClearHistory, onClose }) {
  const [defaultMode, setDefaultMode] = useState(settings.defaultMode);
  const [hlsBuffer, setHlsBuffer]     = useState(settings.hlsBuffer);
  const [epgUrl, setEpgUrl]           = useState(settings.epgUrl || '');
  const [cleared, setCleared]         = useState(false);

  function handleSave() {
    onSave({ defaultMode, hlsBuffer, epgUrl: epgUrl.trim() });
    onClose();
  }

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-box" onClick={(e) => e.stopPropagation()}>
        <div className="settings-head">
          <span className="settings-title">Einstellungen</span>
          <button className="guide-close" onClick={onClose}>✕</button>
        </div>

        <div className="settings-field">
          <label className="settings-label">Start-Modus</label>
          <div className="settings-seg">
            {MODES.map((m) => (
              <button
                key={m.key}
                className={`settings-seg-btn ${defaultMode === m.key ? 'active' : ''}`}
                onClick={() => setDefaultMode(m.key)}
              >{m.label}</button>
            ))}
          </div>
        </div>

        <div className="settings-field">
          <label className="settings-label">Puffer (Latenz ↔ Stabilität)</label>
          <div className="settings-seg">
            {BUFFERS.map((b) => (
              <button
                key={b.key}
                className={`settings-seg-btn ${hlsBuffer === b.key ? 'active' : ''}`}
                onClick={() => setHlsBuffer(b.key)}
              >{b.label}</button>
            ))}
          </div>
        </div>

        <div className="settings-field">
          <label className="settings-label">Eigene EPG-URL (optional)</label>
          <input
            className="settings-input"
            type="url"
            placeholder="http://…xmltv.php — leer = Standard des Anbieters"
            value={epgUrl}
            onChange={(e) => setEpgUrl(e.target.value)}
          />
        </div>

        <div className="settings-field">
          <label className="settings-label">Wiedergabe-Verlauf</label>
          <button
            className="settings-danger"
            onClick={() => { onClearHistory(); setCleared(true); }}
            disabled={cleared}
          >
            {cleared ? 'Verlauf gelöscht' : 'Weiterschauen-Verlauf löschen'}
          </button>
        </div>

        <div className="settings-actions">
          <button className="settings-cancel" onClick={onClose}>Abbrechen</button>
          <button className="settings-save" onClick={handleSave}>Speichern</button>
        </div>
      </div>
    </div>
  );
}
