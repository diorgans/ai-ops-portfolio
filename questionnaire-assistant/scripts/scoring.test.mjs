// Tests for scoring.mjs. Each block names the section of docs/scoring-definition.md it checks.
// Run: node --test scripts/scoring.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  goldLabel, validateOutput, decisionOf, normalize, quoteExists, claimQuotesExist,
  decisionMetrics, citationMetrics, answerAccuracy,
} from './scoring.mjs';

const PAGE_IDS = ['loop', 'wait'];
// Short excerpts in the same Markdown style as the real pages, so tests run without kb/pages/.
const PAGES = {
  loop: 'Use the [Loop Over Items](/integrations/x.md) node when you want to loop until all items are processed. ' +
    'To process each item individually, set **Batch Size** to `1`.\n\n' +
    '* [Code](/x.md) node in **Run Once for All Items** mode: processes all the items based on the entered code snippet.',
  wait: '## Waiting <a href="#waiting" id="waiting"></a>\n\nYou can wait for a specified duration, or until a webhook fires.',
};

const cite = (page, quote) => ({ page, quote });
const answered = { status: 'answered', claims: [{ text: 'x', citations: [cite('wait', 'until a webhook fires')] }], not_covered: [] };

// ---------- section 3: gold labels ----------

test('gold label follows mechanically from the points', () => {
  assert.equal(goldLabel([{ supported: true }, { supported: true }]), 'answer');
  assert.equal(goldLabel([{ supported: false }, { supported: false }]), 'abstain');
  assert.equal(goldLabel([{ supported: true }, { supported: false }]), 'partial');
});

test('a question with no points is an error, not silently "answer"', () => {
  assert.throws(() => goldLabel([]));
});

test('only an explicit true counts as supported', () => {
  assert.equal(goldLabel([{ supported: 'yes' }]), 'abstain');
});

// ---------- section 4: output rules ----------

test('valid outputs of each status pass', () => {
  assert.deepEqual(validateOutput(answered, PAGE_IDS), []);
  assert.deepEqual(validateOutput({ status: 'abstained', claims: [], not_covered: ['all of it'] }, PAGE_IDS), []);
  assert.deepEqual(validateOutput({ ...answered, status: 'partial', not_covered: ['the rest'] }, PAGE_IDS), []);
});

test('status must agree with the lists', () => {
  assert.notDeepEqual(validateOutput({ status: 'abstained', claims: answered.claims, not_covered: ['x'] }, PAGE_IDS), []);
  assert.notDeepEqual(validateOutput({ status: 'abstained', claims: [], not_covered: [] }, PAGE_IDS), []);
  assert.notDeepEqual(validateOutput({ ...answered, not_covered: ['x'] }, PAGE_IDS), []);
  assert.notDeepEqual(validateOutput({ ...answered, claims: [] }, PAGE_IDS), []);
  assert.notDeepEqual(validateOutput({ ...answered, status: 'partial' }, PAGE_IDS), []);
});

test('unknown status, unknown page, missing quote and non-objects are invalid', () => {
  assert.notDeepEqual(validateOutput({ ...answered, status: 'maybe' }, PAGE_IDS), []);
  assert.notDeepEqual(validateOutput({ ...answered, claims: [{ text: 'x', citations: [cite('queue-mode', 'some long quote here')] }] }, PAGE_IDS), []);
  assert.notDeepEqual(validateOutput({ ...answered, claims: [{ text: 'x', citations: [{ page: 'wait' }] }] }, PAGE_IDS), []);
  assert.notDeepEqual(validateOutput(null, PAGE_IDS), []);
  assert.notDeepEqual(validateOutput('answered', PAGE_IDS), []);
});

test('an uncited claim does NOT make the output invalid (it is counted in citation metrics)', () => {
  const out = { ...answered, claims: [{ text: 'x', citations: [] }] };
  assert.deepEqual(validateOutput(out, PAGE_IDS), []);
  assert.equal(decisionOf(out, PAGE_IDS), 'answered');
});

test('the decision is the status field, or "invalid"', () => {
  assert.equal(decisionOf(answered, PAGE_IDS), 'answered');
  assert.equal(decisionOf({ ...answered, not_covered: ['x'] }, PAGE_IDS), 'invalid');
});

// ---------- section 5: quotes ----------

test('a quote matches across Markdown formatting and whitespace', () => {
  assert.ok(quoteExists(cite('loop', 'set Batch Size to 1'), PAGES));
  assert.ok(quoteExists(cite('loop', 'Use the Loop Over Items node when you want to loop'), PAGES));
  assert.ok(quoteExists(cite('loop', 'Code node in Run Once for All Items mode'), PAGES));
  assert.ok(quoteExists(cite('wait', 'Waiting You can wait for a specified duration'), PAGES));
  assert.ok(quoteExists(cite('wait', 'wait  for a\nspecified duration'), PAGES));
});

test('a quote that keeps the Markdown also matches', () => {
  assert.ok(quoteExists(cite('loop', 'set **Batch Size** to `1`'), PAGES));
});

test('case and wording are NOT normalised', () => {
  assert.ok(!quoteExists(cite('wait', 'you can wait for a specified duration'), PAGES));
  assert.ok(!quoteExists(cite('wait', 'You can wait for a set duration'), PAGES));
});

test('a real quote attributed to the wrong page fails', () => {
  assert.ok(!quoteExists(cite('loop', 'until a webhook fires'), PAGES));
});

test('quotes under 4 words do not count, even if they appear', () => {
  assert.ok(!quoteExists(cite('loop', 'Batch Size'), PAGES));
  assert.ok(!quoteExists(cite('loop', ''), PAGES));
  assert.ok(quoteExists(cite('wait', 'until a webhook fires'), PAGES));
});

test('quote words are counted after removing formatting', () => {
  assert.ok(!quoteExists(cite('loop', '**Batch** **Size** `1`'), PAGES));
});

test('normalize leaves plain text alone apart from whitespace', () => {
  assert.equal(normalize('  Hello,\n\tworld.  '), 'Hello, world.');
});

test('a claim\'s quotes exist only if it has citations and all of them exist', () => {
  assert.ok(claimQuotesExist({ citations: [cite('wait', 'until a webhook fires'), cite('loop', 'set Batch Size to 1')] }, PAGES));
  assert.ok(!claimQuotesExist({ citations: [cite('wait', 'until a webhook fires'), cite('loop', 'made up quote text here')] }, PAGES));
  assert.ok(!claimQuotesExist({ citations: [] }, PAGES));
});

// ---------- section 5: decision metrics ----------

const ROWS = [
  { gold: 'answer', decision: 'answered' },
  { gold: 'answer', decision: 'abstained' },     // false refusal
  { gold: 'answer', decision: 'partial' },       // hedge
  { gold: 'answer', decision: 'answered' },
  { gold: 'partial', decision: 'answered' },     // overclaim
  { gold: 'partial', decision: 'partial' },
  { gold: 'abstain', subtype: 'off_topic', decision: 'abstained' },
  { gold: 'abstain', subtype: 'near_miss', decision: 'answered' },  // overclaim
  { gold: 'abstain', subtype: 'near_miss', decision: 'invalid' },
  { gold: 'abstain', subtype: 'near_miss', decision: 'abstained' },
];

test('confusion matrix counts every row once', () => {
  const { matrix } = decisionMetrics(ROWS);
  const total = Object.values(matrix).flatMap((r) => Object.values(r)).reduce((a, b) => a + b, 0);
  assert.equal(total, ROWS.length);
  assert.equal(matrix.answer.answered, 2);
  assert.equal(matrix.abstain.invalid, 1);
});

test('overclaim: answered when gold is abstain or partial', () => {
  assert.deepEqual(decisionMetrics(ROWS).overclaim, { hits: 2, total: 6, rate: 2 / 6 });
});

test('abstention recall, overall and by subtype; invalid counts as a miss', () => {
  const m = decisionMetrics(ROWS);
  assert.deepEqual(m.abstentionRecall, { hits: 2, total: 4, rate: 0.5 });
  assert.deepEqual(m.abstentionRecallOffTopic, { hits: 1, total: 1, rate: 1 });
  assert.deepEqual(m.abstentionRecallNearMiss, { hits: 1, total: 3, rate: 1 / 3 });
});

test('invalid is not an overclaim', () => {
  const m = decisionMetrics([{ gold: 'abstain', subtype: 'near_miss', decision: 'invalid' }]);
  assert.equal(m.overclaim.hits, 0);
  assert.equal(m.abstentionRecall.hits, 0);
});

test('false refusal and hedge are separate', () => {
  const m = decisionMetrics(ROWS);
  assert.deepEqual(m.falseRefusal, { hits: 1, total: 4, rate: 0.25 });
  assert.deepEqual(m.hedge, { hits: 1, total: 4, rate: 0.25 });
});

test('always-abstain scores perfect abstention recall but 100% false refusal', () => {
  const m = decisionMetrics(ROWS.map((r) => ({ ...r, decision: 'abstained' })));
  assert.equal(m.abstentionRecall.rate, 1);
  assert.equal(m.overclaim.rate, 0);
  assert.equal(m.falseRefusal.rate, 1);
});

test('always-answer scores zero abstention recall and 100% overclaim', () => {
  const m = decisionMetrics(ROWS.map((r) => ({ ...r, decision: 'answered' })));
  assert.equal(m.abstentionRecall.rate, 0);
  assert.equal(m.overclaim.rate, 1);
});

test('an empty category reports null, not 0', () => {
  assert.equal(decisionMetrics([{ gold: 'answer', decision: 'answered' }]).abstentionRecall.rate, null);
});

test('rows with unknown labels are rejected', () => {
  assert.throws(() => decisionMetrics([{ gold: 'answer', decision: 'maybe' }]));
  assert.throws(() => decisionMetrics([{ gold: 'yes', decision: 'answered' }]));
});

// ---------- section 5: citation metrics ----------

test('citation validity: exists AND supports; uncited claims count against it', () => {
  const m = citationMetrics([
    { cited: true, quotesExist: true, humanSupports: true },   // valid
    { cited: true, quotesExist: true, humanSupports: false },  // real quote, doesn't support
    { cited: true, quotesExist: false },                       // made-up quote, no human label needed
    { cited: false, quotesExist: false },                      // uncited
  ]);
  assert.deepEqual(m.citationValidity, { hits: 1, total: 4, rate: 0.25 });
  assert.equal(m.quotesExist, 2);
  assert.equal(m.uncited, 1);
});

test('a claim with existing quotes but no human label is an error, not silently valid', () => {
  assert.throws(() => citationMetrics([{ cited: true, quotesExist: true }]));
});

// ---------- section 5: answer accuracy ----------

test('accuracy is the share of points covered; wrong ones are counted', () => {
  const a = answerAccuracy(['covered', 'covered', 'missing', 'wrong']);
  assert.deepEqual(a.accuracy, { hits: 2, total: 4, rate: 0.5 });
  assert.equal(a.wrong, 1);
  assert.throws(() => answerAccuracy(['partly']));
});

// ---------- real pages (skipped if kb/pages/ has not been downloaded) ----------

const realLoop = join(import.meta.dirname, '..', 'kb', 'pages', 'loop.md');
test('real page: formatted passage matches, and the source typo is kept', { skip: !existsSync(realLoop) }, () => {
  const pages = { loop: readFileSync(realLoop, 'utf8') };
  assert.ok(quoteExists(cite('loop', 'To process each item individually, set Batch Size to 1.'), pages));
  // The page is missing a full stop after "that node". A quote that "fixes" it must fail.
  assert.ok(quoteExists(cite('loop', 'in the Settings tab of that node This setting is helpful'), pages));
  assert.ok(!quoteExists(cite('loop', 'in the Settings tab of that node. This setting is helpful'), pages));
});
