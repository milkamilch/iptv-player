import { useState } from 'react';

export default function LoginModal({ onLogin, savedAccounts, onSelectAccount, onDeleteAccount }) {
  const [url, setUrl]       = useState('');
  const [user, setUser]     = useState('');
  const [pass, setPass]     = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [tab, setTab]           = useState(savedAccounts.length > 0 ? 'saved' : 'new');

  function normalizeUrl(raw) {
    let u = raw.trim().replace(/\/+$/, '');
    if (!u.startsWith('http://') && !u.startsWith('https://')) u = 'http://' + u;
    return u;
  }

  async function handleLogin(e) {
    e.preventDefault();
    setError(null);
    const baseUrl = normalizeUrl(url);
    if (!baseUrl || !user.trim() || !pass.trim()) {
      setError('Bitte alle Felder ausfüllen.');
      return;
    }
    setLoading(true);
    try {
      // Verify credentials via Xtream Codes API
      const apiUrl = `${baseUrl}/player_api.php?username=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}`;
      const info = await window.iptv.fetchXtream(apiUrl);
      if (info.user_info?.auth === 0) {
        setError('Ungültige Zugangsdaten.');
        return;
      }
      onLogin({ baseUrl, username: user.trim(), password: pass.trim(), info });
    } catch (err) {
      // If API check fails, still allow login (some providers don't support it)
      if (err.message?.includes('auth')) {
        setError('Ungültige Zugangsdaten.');
      } else {
        // Try anyway — provider might not have player_api.php
        onLogin({ baseUrl, username: user.trim(), password: pass.trim(), info: null });
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-overlay">
      <div className="login-box">
        <div className="login-logo">📺</div>
        <h1 className="login-title">IPTV Player</h1>

        {savedAccounts.length > 0 && (
          <div className="login-tabs">
            <button
              className={`login-tab ${tab === 'saved' ? 'active' : ''}`}
              onClick={() => setTab('saved')}
            >
              Gespeicherte Zugänge
            </button>
            <button
              className={`login-tab ${tab === 'new' ? 'active' : ''}`}
              onClick={() => setTab('new')}
            >
              Neu einloggen
            </button>
          </div>
        )}

        {tab === 'saved' && savedAccounts.length > 0 ? (
          <div className="saved-accounts">
            {savedAccounts.map((acc, i) => (
              <div key={i} className="saved-account-row">
                <button
                  className="saved-account-btn"
                  onClick={() => onSelectAccount(acc)}
                >
                  <span className="saved-acc-host">{new URL(acc.baseUrl).hostname}</span>
                  <span className="saved-acc-user">@{acc.username}</span>
                </button>
                <button
                  className="saved-acc-delete"
                  onClick={() => onDeleteAccount(i)}
                  title="Zugang löschen"
                >
                  ✕
                </button>
              </div>
            ))}
            <button className="login-new-btn" onClick={() => setTab('new')}>
              + Neuen Zugang hinzufügen
            </button>
          </div>
        ) : (
          <form className="login-form" onSubmit={handleLogin}>
            <div className="login-field">
              <label className="login-label">Server-URL</label>
              <input
                className="login-input"
                type="text"
                placeholder="http://provider.example.com:8080"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                autoFocus
                disabled={loading}
              />
            </div>
            <div className="login-field">
              <label className="login-label">Benutzername</label>
              <input
                className="login-input"
                type="text"
                placeholder="username"
                value={user}
                onChange={(e) => setUser(e.target.value)}
                disabled={loading}
                autoComplete="username"
              />
            </div>
            <div className="login-field">
              <label className="login-label">Passwort</label>
              <div className="login-pass-row">
                <input
                  className="login-input"
                  type={showPass ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={pass}
                  onChange={(e) => setPass(e.target.value)}
                  disabled={loading}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="pass-toggle"
                  onClick={() => setShowPass((v) => !v)}
                  tabIndex={-1}
                >
                  {showPass ? '🙈' : '👁'}
                </button>
              </div>
            </div>

            {error && <p className="login-error">{error}</p>}

            <button
              className="login-submit"
              type="submit"
              disabled={loading || !url.trim() || !user.trim() || !pass.trim()}
            >
              {loading ? <span className="login-spinner" /> : 'Verbinden'}
            </button>
          </form>
        )}

        <p className="login-hint">
          Xtream Codes kompatibel — einfach URL, User und Passwort vom IPTV-Anbieter eingeben.
        </p>
      </div>
    </div>
  );
}
