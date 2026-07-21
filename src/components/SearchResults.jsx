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

export default function SearchResults({ query, live, movies, series, moviesLoading, seriesLoading, onSelect }) {
  const q = query.trim().toLowerCase();
  const match = (arr) => arr.filter((it) => it.name.toLowerCase().includes(q));

  const senderHits = q ? match(live) : [];
  const filmHits   = q ? match(movies) : [];
  const serienHits = q ? match(series) : [];
  const total = senderHits.length + filmHits.length + serienHits.length;

  return (
    <div className="search-results">
      <div className="search-results-head">
        Suche: <strong>„{query}"</strong>
        <span className="search-results-total">{total} Treffer</span>
      </div>

      {total === 0 && !moviesLoading && !seriesLoading && (
        <div className="search-results-empty">Keine Treffer für „{query}"</div>
      )}

      <Section title="SENDER"  type="live"   items={senderHits} loading={false}         onSelect={onSelect} />
      <Section title="FILME"   type="movie"  items={filmHits}   loading={moviesLoading} onSelect={onSelect} />
      <Section title="SERIEN"  type="series" items={serienHits} loading={seriesLoading} onSelect={onSelect} />
    </div>
  );
}
