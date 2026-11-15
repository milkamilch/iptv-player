import test from 'node:test';
import assert from 'node:assert/strict';
import { createAutoHide } from './autohide.mjs';

function setup(t) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const calls = [];
  const ah = createAutoHide({ delayMs: 3000, onChange: (v) => calls.push(v) });
  return { ah, calls, tick: (ms) => t.mock.timers.tick(ms) };
}

test('startet sichtbar und meldet ohne Aktivität nichts', (t) => {
  const { calls, tick } = setup(t);
  tick(10000);
  assert.deepEqual(calls, []);
});

test('blendet 3 s nach der letzten Aktivität aus', (t) => {
  const { ah, calls, tick } = setup(t);
  ah.activity();
  tick(2999);
  assert.deepEqual(calls, []);
  tick(1);
  assert.deepEqual(calls, [false]);
});

test('jede Aktivität startet die Frist neu', (t) => {
  const { ah, calls, tick } = setup(t);
  ah.activity();
  tick(2000);
  ah.activity();
  tick(2999);
  assert.deepEqual(calls, []);
  tick(1);
  assert.deepEqual(calls, [false]);
});

test('Aktivität blendet eine ausgeblendete Leiste wieder ein', (t) => {
  const { ah, calls, tick } = setup(t);
  ah.activity();
  tick(3000);
  ah.activity();
  assert.deepEqual(calls, [false, true]);
  tick(3000);
  assert.deepEqual(calls, [false, true, false]);
});

test('Aktivität bei sichtbarer Leiste meldet nichts doppelt', (t) => {
  const { ah, calls } = setup(t);
  ah.activity();
  ah.activity();
  ah.activity();
  assert.deepEqual(calls, []);
});

test('bleibt sichtbar, solange die Maus auf der Leiste steht', (t) => {
  const { ah, calls, tick } = setup(t);
  ah.activity();
  ah.hold();
  tick(60000);
  assert.deepEqual(calls, []);
  ah.activity();
  tick(60000);
  assert.deepEqual(calls, []);
});

test('blendet 3 s nach dem Verlassen der Leiste aus', (t) => {
  const { ah, calls, tick } = setup(t);
  ah.hold();
  ah.release();
  tick(2999);
  assert.deepEqual(calls, []);
  tick(1);
  assert.deepEqual(calls, [false]);
});

test('hold blendet eine ausgeblendete Leiste ein', (t) => {
  const { ah, calls, tick } = setup(t);
  ah.activity();
  tick(3000);
  ah.hold();
  assert.deepEqual(calls, [false, true]);
});

test('nach dispose feuert kein Timer mehr', (t) => {
  const { ah, calls, tick } = setup(t);
  ah.activity();
  ah.dispose();
  tick(10000);
  assert.deepEqual(calls, []);
});
