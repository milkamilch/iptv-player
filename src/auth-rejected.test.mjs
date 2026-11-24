import test from 'node:test';
import assert from 'node:assert/strict';
import { AUTH_REJECTED, assertAuthorized, isAuthRejected } from './auth-rejected.mjs';

test('auth 0 wirft „Ungültige Zugangsdaten.“', () => {
  assert.throws(() => assertAuthorized({ user_info: { auth: 0 } }, []), { message: 'Ungültige Zugangsdaten.' });
});

test('auth 0 nur in der zweiten Antwort wirft ebenfalls', () => {
  assert.throws(() => assertAuthorized([], { user_info: { auth: 0 } }), { message: AUTH_REJECTED });
});

test('Listen und andere Antworten gehen durch', () => {
  for (const r of [[], [{ category_id: '1' }], null, undefined, {}, { user_info: { auth: 1 } }]) {
    assert.doesNotThrow(() => assertAuthorized(r, r));
  }
});

test('erkennt die Meldung direkt und durch den IPC-Wrapper', () => {
  assert.equal(isAuthRejected(new Error(AUTH_REJECTED)), true);
  assert.equal(isAuthRejected(new Error("Error invoking remote method 'load-xtream-vod': Error: Ungültige Zugangsdaten.")), true);
});

test('andere Fehler sind keine Ablehnung', () => {
  for (const m of ['HTTP 513', 'Ungültige JSON-Antwort', 'TypeError: (categories || []) is not iterable', 'Ungültige Zugangsdaten. und mehr']) {
    assert.equal(isAuthRejected(new Error(m)), false, m);
  }
  assert.equal(isAuthRejected(undefined), false);
  assert.equal(isAuthRejected(null), false);
});
