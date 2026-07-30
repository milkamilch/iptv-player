import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCategory, buildCountryIndex, categoriesOf, OTHER } from './country.mjs';

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

test('categoriesOf liefert gekürzte Namen ohne Duplikate, deutsch sortiert', () => {
  const chans = [...CHANNELS, { id: '6', group: 'DE | Sport' }, { id: '7', group: 'DE | Österreich-Spezial' }];
  const idx = buildCountryIndex(chans);
  assert.deepEqual(categoriesOf(idx, chans, 'DE'), ['Nachrichten', 'Österreich-Spezial', 'Sport']);
});
