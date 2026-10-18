// The two no-model baselines (scoring definition, section 7):
//   always-answer : return the best-matching KB paragraph for every question, never abstain
//   keyword       : the same, but abstain when the match score is below a fixed threshold
// They share one matcher, so the only difference between them is the decision to abstain.
//
// Matcher: split every KB page into paragraphs; score a paragraph by the share of the question's
// keywords it contains, weighted so rare words count more than words on every page ("workflow").
//
// The keyword threshold (0.5) is fixed here before looking at results. Tuning it on these 45
// questions would be tuning on the test set, so the sweep below is reported, not used to pick it.
//
// Usage: node scripts/baselines.mjs

import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { normalize, wordCount, MIN_QUOTE_WORDS } from './scoring.mjs';
import { scoreRun, printMetrics } from './score-run.mjs';

const THRESHOLD = 0.5;
const root = join(import.meta.dirname, '..');
const pagesDir = join(root, 'kb', 'pages');
const { questions } = JSON.parse(readFileSync(join(root, 'questions', 'questions.json'), 'utf8'));

const STOP = new Set(('a an and are as at be by can do does for from has have how i if in is it its of on or our ' +
  'should so than that the their them then there these they this to us was we what when where which who why ' +
  'will with would you your any all into not no yes').split(' '));
const terms = (text) => [...new Set(text.toLowerCase().match(/[a-z0-9]+/g)?.filter((w) => w.length > 1 && !STOP.has(w)) ?? [])];

const paragraphs = readdirSync(pagesDir).filter((f) => f.endsWith('.md')).flatMap((f) =>
  readFileSync(join(pagesDir, f), 'utf8').split(/\n\s*\n/).map((raw) => normalize(raw))
    .filter((text) => wordCount(text) >= MIN_QUOTE_WORDS)
    .map((text) => ({ page: f.slice(0, -3), text, terms: new Set(terms(text)) })),
);
const df = new Map();
for (const p of paragraphs) for (const t of p.terms) df.set(t, (df.get(t) ?? 0) + 1);
const idf = (t) => Math.log((paragraphs.length + 1) / ((df.get(t) ?? 0) + 1));

function bestMatch(question) {
  const qt = terms(question);
  const total = qt.reduce((s, t) => s + idf(t), 0);
  let best = { score: 0, paragraph: null };
  for (const p of paragraphs) {
    const score = qt.filter((t) => p.terms.has(t)).reduce((s, t) => s + idf(t), 0) / total;
    if (score > best.score) best = { score, paragraph: p };
  }
  return best;
}

const answer = (p) => ({ status: 'answered', claims: [{ text: p.text, citations: [{ page: p.page, quote: p.text }] }], not_covered: [] });
const abstain = (q) => ({ status: 'abstained', claims: [], not_covered: [q.question] });

const matches = Object.fromEntries(questions.map((q) => [q.id, bestMatch(q.question)]));
const runWith = (arm, threshold) => ({
  arm,
  created_at: new Date().toISOString(),
  threshold,
  outputs: Object.fromEntries(questions.map((q) => {
    const m = matches[q.id];
    return [q.id, m.paragraph && m.score >= threshold ? answer(m.paragraph) : abstain(q)];
  })),
});

mkdirSync(join(root, 'results', 'raw'), { recursive: true });
for (const run of [runWith('baseline-always-answer', 0), runWith('baseline-keyword', THRESHOLD)]) {
  writeFileSync(join(root, 'results', 'raw', `${run.arm}.json`), JSON.stringify(run, null, 2) + '\n');
  const m = scoreRun(run);
  printMetrics(m);
  writeFileSync(join(root, 'results', `${run.arm}.metrics.json`), JSON.stringify(m, null, 2) + '\n');
}

// How the keyword baseline trades overclaiming against false refusals as the threshold moves.
console.log('\nkeyword threshold sweep (reported only; the threshold above was fixed in advance):');
console.log('  threshold  overclaim  false-refusal  abstention-recall');
const sweep = [];
for (const t of [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]) {
  const m = scoreRun(runWith(`sweep-${t}`, t));
  sweep.push({ threshold: t, overclaim: m.overclaim, falseRefusal: m.falseRefusal, abstentionRecall: m.abstentionRecall });
  const f = (r) => `${(100 * r.rate).toFixed(0)}%`.padStart(4);
  console.log(`  ${String(t).padEnd(9)}  ${f(m.overclaim)}       ${f(m.falseRefusal)}           ${f(m.abstentionRecall)}`);
}
writeFileSync(join(root, 'results', 'baseline-keyword.sweep.json'), JSON.stringify(sweep, null, 2) + '\n');
