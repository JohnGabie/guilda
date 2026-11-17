import test from 'node:test';
import assert from 'node:assert/strict';
import { check, readTurns } from '../scripts/check-turn-budget.mjs';

const trace = (n) => ['{"type":"system"}', JSON.stringify({ type: 'result', num_turns: n })].join('\n');

test('a run over its budget is flagged (3 planted traces)', () => {
  for (const [turns, budget] of [[31, 30], [89, 30], [42, 20]]) {
    assert.equal(check('planted', budget, trace(turns)).status, 'over');
  }
});
test('a run at or under its budget is ok', () => {
  assert.equal(check('c', 30, trace(30)).status, 'ok');
  assert.equal(check('c', 30, trace(5)).status, 'ok');
});
test('a trace with no result event is unreadable, not ok', () => {
  assert.equal(check('c', 30, '{"type":"system"}\nnot json').status, 'unreadable');
  assert.equal(readTurns(''), null);
});
