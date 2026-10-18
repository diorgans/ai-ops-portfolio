import { test } from 'node:test';
import assert from 'node:assert/strict';
import { postcheck } from './postcheck.mjs';
import { validateOutput } from './scoring.mjs';

const pages = { p: 'The error workflow must start with the Error Trigger. It runs if an execution fails.' };
const good = { text: 'Starts with Error Trigger', citations: [{ page: 'p', quote: 'The error workflow must start with the Error Trigger.' }] };
const fake = { text: 'Runs on manual tests', citations: [{ page: 'p', quote: 'It also runs on manual test executions.' }] };
const uncited = { text: 'Probably needs publishing', citations: [] };

test('keeps a fully answered output unchanged', () => {
  const out = postcheck({ status: 'answered', claims: [good], not_covered: [] }, pages);
  assert.equal(out.status, 'answered');
  assert.deepEqual(out.claims, [good]);
  assert.deepEqual(out.removed_claims, []);
});

test('a claim with an invented quote is removed and the answer becomes partial', () => {
  const out = postcheck({ status: 'answered', claims: [good, fake], not_covered: [] }, pages);
  assert.equal(out.status, 'partial');
  assert.deepEqual(out.claims, [good]);
  assert.match(out.not_covered[0], /Runs on manual tests/);
});

test('a bad extra quote is dropped but the claim stays when a valid quote remains', () => {
  const claim = { text: 'Starts with Error Trigger', citations: [good.citations[0], { page: 'p', quote: 'Error Trigger' }] };
  const out = postcheck({ status: 'answered', claims: [claim], not_covered: [] }, pages);
  assert.equal(out.status, 'answered');
  assert.deepEqual(out.claims[0].citations, [good.citations[0]]);
  assert.equal(out.dropped_quotes, 1);
});

test('an uncited claim is removed', () => {
  const out = postcheck({ status: 'answered', claims: [uncited], not_covered: [] }, pages);
  assert.equal(out.status, 'abstained');
  assert.equal(out.removed_claims.length, 1);
});

test('removing every claim turns the answer into an abstention', () => {
  const out = postcheck({ status: 'partial', claims: [fake], not_covered: ['the limit'] }, pages);
  assert.equal(out.status, 'abstained');
  assert.deepEqual(out.claims, []);
  assert.equal(out.not_covered.length, 2);
});

test('the result always passes the output validator', () => {
  for (const o of [
    { status: 'answered', claims: [good], not_covered: [] },
    { status: 'answered', claims: [fake], not_covered: [] },
    { status: 'abstained', claims: [], not_covered: ['x'] },
    { status: 'partial', claims: [good, uncited], not_covered: ['y'] },
  ]) assert.deepEqual(validateOutput(postcheck(o, pages), ['p']), []);
});
