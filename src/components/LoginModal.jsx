import { useState } from 'react';
import BrandMark from './BrandMark.jsx';
import { parseUrlList, verifyLogin } from '../servers.mjs';

export default function LoginModal({ onLogin, savedAccounts, onSelectAccount, onDeleteAccount }) {
  const [url, setUrl]       = useState('');
  const [user, setUser]     = useState('');
  const [pass, setPass]     = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  // Default to the saved list: savedAccounts is loaded asynchronously and is
  // still empty on first render, so deriving the initial tab from it would
  // permanently strand users with saved accounts on the empty form. The render
  // below falls back to the form on its own while the list is empty.
  const [tab, setTab]           = useState('saved');

  async function handleLogin(e) {
    e.preventDefault();
    setError(null);
    const baseUrls = parseUrlList(url);
    if (!baseUrls.length || !user.trim() || !pass.trim()) {
      setError('Bitte alle Felder ausfüllen.');
      return;
    }
    setLoading(true);
    try {
      // Verify credentials via Xtream Codes API, URL für URL
      // 2xx ohne JSON: Login ohne API-Prüfung (nur als Rückfall)
      const { baseUrl, info } = await verifyLogin(baseUrls, (u) =>
        window.iptv.fetchXtream(`${u}/player_api.php?username=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}`)
      );
      onLogin({ baseUrl, baseUrls, username: user.trim(), password: pass.trim(), info });
    } catch (err) {
      // Anything but wrong credentials is a genuine connection problem. Logging
      // in regardless would turn a typo'd URL into an empty app instead of an error.
      setError(err?.stop ? 'Ungültige Zugangsdaten.' : 'Server nicht erreichbar — bitte URL prüfen.');
    } finally {
      setLoading(false);
    }
  }

  function hostOf(acc) {
    try { return new URL(acc.baseUrl).hostname; } catch { return acc.baseUrl; }
  }

  return (
    <div className="login-overlay">
      <div className="login-box" role="dialog" aria-modal="true" aria-label="Anmeldung">
        <div className="login-logo">
          <BrandMark className="login-logo-mark" size={28} />
          Nightwave
        </div>
        <div className="login-subtitle">Xtream Codes kompatibel</div>

        {savedAccounts.length > 0 && (
          <div className="login-tabs">
            <button
              className={`login-tab ${tab === 'saved' ? 'active' : ''}`}
              onClick={() => setTab('saved')}
            >
              Gespeicherte
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
              <div
                key={i}
                className="saved-account-row"
                onClick={() => onSelectAccount(acc)}
              >
                <div className="saved-acc-avatar" style={i === 0 ? undefined : { background: 'linear-gradient(135deg,#3a3a42,#26262b)', color: '#9a9aa2' }}>
                  {hostOf(acc)[0]?.toUpperCase() || '?'}
                </div>
                <div className="saved-acc-info">
                  <span className="saved-acc-host">{hostOf(acc)}</span>
                  <span className="saved-acc-user">@{acc.username}</span>
                </div>
                <button
                  className="saved-acc-delete"
                  onClick={(e) => { e.stopPropagation(); onDeleteAccount(i); }}
                  title="Zugang löschen"
                >✕</button>
              </div>
            ))}
            <button className="login-new-btn" onClick={() => setTab('new')}>
              + Neuen Zugang hinzufügen
            </button>
          </div>
        ) : (
          <form className="login-form" onSubmit={handleLogin}>
            <div className="login-field">
              <label className="login-label">Server-URLs</label>
              <textarea
                className="login-input login-urls"
                rows={3}
                placeholder={'http://provider.example.com:8080\nhttp://backup.example.com:8080'}
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
      </div>
    </div>
  );
}
