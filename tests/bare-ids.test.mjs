import test from 'node:test';
import assert from 'node:assert/strict';
import { bareIds } from '../scripts/lib/bare-ids.mjs';

test('a bare ID', () => {
  assert.deepEqual(bareIds('Do we keep R13 here? And D40 too, R13 again'), ['R13', 'D40']);
  assert.deepEqual(bareIds('See EXE2a now'), ['EXE2a']);
});

test('an ID after its words in parentheses passes', () => {
  assert.deepEqual(bareIds('Keep the ask short and plain (R13)'), []);
  assert.deepEqual(bareIds('Say it in plain words first (R13, D40) then go'), []);
});

test('an ID in parentheses with one word is bare', () => {
  assert.deepEqual(bareIds('Plain (R13)'), ['R13']);
  assert.deepEqual(bareIds('(R13) comes first'), ['R13']);
  assert.deepEqual(bareIds('Two words (R13) then R14'), ['R14']);
});

test('no ID', () => {
  assert.deepEqual(bareIds('Which option do you want?'), []);
  assert.deepEqual(bareIds(''), []);
});

test('a word like Dx or T-shirt is not an ID', () => {
  assert.deepEqual(bareIds('Dx is fine, a T-shirt, R and XR2000, D5X'), []);
});

test('an ID in a file name is not bare', () => {
  assert.deepEqual(bareIds('Read S3.md, docs/T2.md and ./R4.txt'), []);
});

test('a bare ID at the end of a sentence is still bare', () => {
  assert.deepEqual(bareIds('see R4.'), ['R4']);
  assert.deepEqual(bareIds('see R4. Then go'), ['R4']);
});
