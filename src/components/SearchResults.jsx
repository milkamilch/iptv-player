const CAP = 50; // max results shown per section

function ResultCard({ item, onClick }) {
  return (
    <button className="result-card" onClick={onClick} title={item.name}>
      {item.logo
        ? <img className="result-logo" src={item.logo} alt="" onError={(e) => { e.target.style.display = 'none'; }} />
        : <div className="result-logo result-logo-ph" />}
      <span className="result-name">{item.name}</span>
    </button>
  );
}

function Section({ title, type, items, loading, onSelect }) {
  const shown = items.slice(0, CAP);
  if (!items.length && !loading) return null;
  return (
    <div className="result-section">
      <div className="result-section-head">
        {title} <span className="result-count">({items.length}{items.length > CAP ? ` — zeige ${CAP}` : ''})</span>
        {loading && <span className="result-loading">lädt noch…</span>}
      </div>
      {shown.length > 0 && (
        <div className="result-grid">
          {shown.map((it) => (
            <ResultCard key={type + it.id} item={it} onClick={() => onSelect(type, it)} />
          ))}
        </div>
      )}
    </div>
  );
}

const SECTIONS = { live: ['SENDER', 'live'], movies: ['FILME', 'movie'], series: ['SERIEN', 'series'] };

export default function SearchResults({ query, mode, items, loading, onSelect }) {
  const q = query.trim().toLowerCase();
  const hits = q ? items.filter((it) => it.name.toLowerCase().includes(q)) : [];
  const [title, type] = SECTIONS[mode];

  return (
    <div className="search-results">
      <div className="search-results-head">
        Suche: <strong>„{query}"</strong>
        <span className="search-results-total">{hits.length} Treffer</span>
      </div>

      {hits.length === 0 && !loading && (
        <div className="search-results-empty">Keine Treffer für „{query}"</div>
      )}

      <Section title={title} type={type} items={hits} loading={loading} onSelect={onSelect} />
    </div>
  );
}
