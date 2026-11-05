import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCategory, buildCountryIndex, categoryCounts, OTHER } from './country.mjs';

test('erkennt Präfixe mit allen Trennzeichen', () => {
  for (const sep of ['|', '-', ':', '/', '>']) {
    const r = parseCategory(`DE ${sep} Sport HD`);
    assert.equal(r.code, 'DE');
    assert.equal(r.category, 'Sport HD');
  }
});

test('toleriert fehlende Leerzeichen und Kleinschreibung', () => {
  assert.deepEqual(parseCategory('de|Sport'), { code: 'DE', category: 'Sport' });
  assert.deepEqual(parseCategory('  US - News '), { code: 'US', category: 'News' });
});

test('mappt UK auf GB', () => {
  assert.equal(parseCategory('UK: Documentary').code, 'GB');
});

test('EN ist kein Land — das ist die Sprache, nicht Großbritannien', () => {
  const r = parseCategory('EN | Sport');
  assert.equal(r.code, OTHER);
  assert.equal(r.category, 'EN | Sport');
});

test('AR ist Arabisch, nicht Argentinien', () => {
  const item = { id: '1', name: 'AR-SUBS - Street Fighter (1994)', group: 'NETFLIX MOVIES' };
  const index = buildCountryIndex([item], { titlePrefix: true });
  assert.equal(parseCategory('AR| BEIN SPORTS').code, 'AR');
  assert.deepEqual(index.countries.find((c) => c.code === 'AR'), { code: 'AR', name: 'Arabisch', flag: '🌐', count: 1 });
});

test('unbekannte Codes sind kein Land und behalten den vollen Namen', () => {
  for (const g of ['XX | Irgendwas', 'HD | Sport', 'VIP - Kino', '4K: Filme']) {
    const r = parseCategory(g);
    assert.equal(r.code, OTHER, `${g} darf kein Land sein`);
    assert.equal(r.category, g.trim());
  }
});

test('Gruppenname ohne Präfix landet in Sonstige', () => {
  assert.deepEqual(parseCategory('Nachrichten'), { code: OTHER, category: 'Nachrichten' });
});

test('leerer oder fehlender Gruppenname fällt auf Alle zurück', () => {
  assert.deepEqual(parseCategory(''), { code: OTHER, category: 'Alle' });
  assert.deepEqual(parseCategory(undefined), { code: OTHER, category: 'Alle' });
});

const CHANNELS = [
  { id: '1', group: 'DE | Sport' },
  { id: '2', group: 'DE | Nachrichten' },
  { id: '3', group: 'AT | Sport' },
  { id: '4', group: 'US - News' },
  { id: '5', group: 'Irgendwas' },
];

test('Index zählt, sortiert deutsch und hängt Sonstige ans Ende', () => {
  const idx = buildCountryIndex(CHANNELS);
  assert.deepEqual(idx.countries.map((c) => c.code), ['DE', 'AT', 'US', OTHER]);
  assert.deepEqual(idx.countries.map((c) => c.name),
    ['Deutschland', 'Österreich', 'USA', 'Sonstige']);
  assert.deepEqual(idx.countries.map((c) => c.count), [2, 1, 1, 1]);
  assert.equal(idx.enabled, true);
});

test('Index legt Metadaten je Kanal-ID ab', () => {
  const idx = buildCountryIndex(CHANNELS);
  assert.deepEqual(idx.meta.get('1'), { code: 'DE', category: 'Sport' });
  assert.deepEqual(idx.meta.get('5'), { code: OTHER, category: 'Irgendwas' });
});

test('enabled ist false, wenn sich nur ein Eimer ergibt', () => {
  assert.equal(buildCountryIndex([{ id: 'a', group: 'DE | Sport' }]).enabled, false);
  assert.equal(buildCountryIndex([{ id: 'a', group: 'Sport' }, { id: 'b', group: 'News' }]).enabled, false);
  assert.equal(buildCountryIndex([]).enabled, false);
});

test('categoryCounts zählt je Kategorie, deutsch sortiert', () => {
  const items = ['Sport', 'Österreich-Spezial', 'Sport', 'Nachrichten'].map((g, i) => ({ id: String(i), group: g }));
  assert.deepEqual(categoryCounts(items, (c) => c.group), [
    { name: 'Nachrichten', count: 1 },
    { name: 'Österreich-Spezial', count: 1 },
    { name: 'Sport', count: 2 },
  ]);
});

test('categoryCounts überspringt leere Kategorien', () => {
  const items = [{ id: '1' }, { id: '2' }, { id: '3' }];
  const values = [null, '', undefined];
  assert.deepEqual(categoryCounts(items, (c) => values[Number(c.id) - 1]), []);
});

test('categoryCounts über Index-Metadaten zählt nur das Land', () => {
  const chans = [...CHANNELS, { id: '6', group: 'DE | Sport' }, { id: '7', group: 'DE | Österreich-Spezial' }];
  const idx = buildCountryIndex(chans);
  const cats = categoryCounts(chans, (c) => {
    const m = idx.meta.get(c.id);
    return m.code === 'DE' ? m.category : null;
  });
  assert.deepEqual(cats.map((c) => c.name), ['Nachrichten', 'Österreich-Spezial', 'Sport']);
  assert.deepEqual(cats.map((c) => c.count), [1, 1, 2]);
});

test('Titelpräfix liefert das Land ohne Kategoriepräfix', () => {
  const item = { id: '1', name: 'DE - Haustausch (2026) (SE)', group: 'GERMANY NETFLIX' };
  const index = buildCountryIndex([item], { titlePrefix: true });
  assert.deepEqual(index.meta.get('1'), { code: 'DE', category: 'GERMANY NETFLIX' });
});

test('Kategoriepräfix gewinnt gegen den Titelpräfix', () => {
  const item = { id: '1', name: 'FR - X', group: 'DE | Kino' };
  const index = buildCountryIndex([item], { titlePrefix: true });
  assert.deepEqual(index.meta.get('1'), { code: 'DE', category: 'Kino' });
});

test('EN im Titel ist kein Land', () => {
  const item = { id: '1', name: 'EN - Street Fighter (2026)', group: 'NETFLIX MOVIES' };
  const index = buildCountryIndex([item], { titlePrefix: true });
  assert.deepEqual(index.meta.get('1'), { code: OTHER, category: 'NETFLIX MOVIES' });
});

test('ohne Option bleibt der Titel unbeachtet', () => {
  const item = { id: '1', name: 'DE - Haustausch (2026) (SE)', group: 'GERMANY NETFLIX' };
  const index = buildCountryIndex([item]);
  assert.deepEqual(index.meta.get('1'), { code: OTHER, category: 'GERMANY NETFLIX' });
});

test('unbekannte oder fehlende Titelpräfixe landen in Sonstige', () => {
  const items = [
    { id: '1', name: 'NF - Foo', group: 'X' },
    { id: '2', name: '4K - Bar', group: 'X' },
    { id: '3', group: 'X' },
  ];
  const index = buildCountryIndex(items, { titlePrefix: true });
  for (const it of items) assert.equal(index.meta.get(it.id).code, OTHER);
});

test('Titel, die mit einem normalen Wort beginnen, bekommen kein Land', () => {
  const items = [
    { id: '1', name: 'It: Capítulo 2 (2019)', group: 'X' },
    { id: '2', name: 'In - Bruges (2008)', group: 'X' },
    { id: '3', name: 'IT - La vita è bella (1997)', group: 'X' },
  ];
  const index = buildCountryIndex(items, { titlePrefix: true });
  assert.equal(index.meta.get('1').code, OTHER);
  assert.equal(index.meta.get('2').code, OTHER);
  assert.equal(index.meta.get('3').code, 'IT');
});

test('categoryCounts liefert beim Titel-Land die Kategorie, nicht den Titel', () => {
  const items = [
    { id: '1', name: 'DE - Haustausch (2026) (SE)', group: 'GERMANY NETFLIX' },
    { id: '2', name: 'DE - Street Fighter (2026)', group: 'NETFLIX MOVIES' },
  ];
  const index = buildCountryIndex(items, { titlePrefix: true });
  assert.deepEqual(categoryCounts(items, (c) => index.meta.get(c.id).category), [
    { name: 'GERMANY NETFLIX', count: 1 },
    { name: 'NETFLIX MOVIES', count: 1 },
  ]);
});

test('Index über 200.000 Titel dauert unter einer Sekunde', () => {
  const items = Array.from({ length: 200000 }, (_, i) => ({
    id: String(i), name: `${i % 2 ? 'DE' : 'FR'} - Titel ${i}`, group: 'NETFLIX MOVIES',
  }));
  const t0 = performance.now();
  buildCountryIndex(items, { titlePrefix: true });
  assert.ok(performance.now() - t0 < 1000);
});

test('categoryCounts über 200.000 Titel dauert unter einer Sekunde', () => {
  const items = Array.from({ length: 200000 }, (_, i) => ({ id: String(i), group: `Kategorie ${i % 300}` }));
  const t0 = performance.now();
  categoryCounts(items, (c) => c.group);
  assert.ok(performance.now() - t0 < 1000);
});
