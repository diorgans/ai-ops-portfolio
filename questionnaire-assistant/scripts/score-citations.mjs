// Joins the human citation verdicts (labelling/citation-labels.json) back to the runs and computes
// citation validity with citationMetrics() from scoring.mjs: a claim is valid only if its quotes
// exist on the cited page (code) AND the reviewer judged they support the whole claim (human).
// Uncited claims and claims with missing quotes count as invalid without needing a human verdict.
//
// Two scopes are reported per arm:
//   hardQuestions — questions the docs don't fully answer. Both arms are judged here, blind and
//                   shuffled together, so this is the valid head-to-head comparison.
//   allQuestions  — every question. Only reported for an arm whose cited claims are all judged;
//                   otherwise null, because a partial numerator over a full denominator would
//                   understate the arm. The forced-answer arm's answerable-question claims were
//                   never put in the labelling page, so it reports null here by design.
//
// Writes results/citation-labels.json (verdicts only, no n8n text) and results/citation-metrics.json.
// Usage: node scripts/score-citations.mjs

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { citationMetrics, claimQuotesExist } from './scoring.mjs';

const root = join(import.meta.dirname, '..');
const pagesDir = join(root, 'kb', 'pages');
const pages = Object.fromEntries(
  readdirSync(pagesDir).filter((f) => f.endsWith('.md')).map((f) => [f.slice(0, -3), readFileSync(join(pagesDir, f), 'utf8')]),
);
const gold = Object.fromEntries(JSON.parse(readFileSync(join(root, 'questions', 'gold-labels.json'), 'utf8')).labels.map((l) => [l.id, l.gold]));
const items = JSON.parse(readFileSync(join(root, 'labelling', 'citation-items.json'), 'utf8'));
const review = JSON.parse(readFileSync(join(root, 'labelling', 'citation-labels.json'), 'utf8'));
const verdict = Object.fromEntries(review.labels.map((l) => [l.key, l]));

const joined = items.map((it) => ({ ...it, verdict: verdict[it.key]?.verdict ?? null, note: verdict[it.key]?.note ?? '' }));
// revised_at/revision_note are carried through when the reviewer has changed a verdict after the
// fact, so the committed artifact records that and not only the original export date.
writeFileSync(join(root, 'results', 'citation-labels.json'),
  JSON.stringify({
    exported_at: review.exported_at,
    ...(review.revised_at ? { revised_at: review.revised_at } : {}),
    ...(review.revision_note ? { revision_note: review.revision_note } : {}),
    labels: joined,
  }, null, 2) + '\n');
const lookup = Object.fromEntries(joined.map((j) => [`${j.arm}|${j.qid}|${j.index}`, j.verdict]));

const result = {};
for (const arm of ['claude-forced-answer-r2', 'claude-grounded-v2']) {
  const run = JSON.parse(readFileSync(join(root, 'results', 'raw', `${arm}.json`), 'utf8'));
  const hard = [];
  const all = [];
  let unjudged = 0;
  for (const [qid, o] of Object.entries(run.outputs)) {
    o.claims.forEach((c, i) => {
      const cited = c.citations.length > 0;
      const quotesExist = cited && claimQuotesExist(c, pages);
      const v = lookup[`${arm}|${qid}|${i}`];
      if (quotesExist && !v) unjudged++;
      const claim = { cited, quotesExist, humanSupports: quotesExist ? v === 'supports' : undefined };
      all.push(claim);
      if (gold[qid] !== 'answer') {
        if (quotesExist && !v) throw new Error(`no verdict for ${arm} ${qid} claim ${i}`);
        hard.push(claim);
      }
    });
  }
  result[arm] = { hardQuestions: citationMetrics(hard), allQuestions: unjudged ? null : citationMetrics(all) };
  const say = (label, m) => console.log(`  ${label.padEnd(14)} ${(100 * m.citationValidity.rate).toFixed(0)}% ` +
    `(${m.citationValidity.hits}/${m.totalClaims}); quotes exist ${m.quotesExist}, uncited ${m.uncited}`);
  console.log(`${arm}:`);
  say('hard questions', result[arm].hardQuestions);
  if (result[arm].allQuestions) say('all questions', result[arm].allQuestions);
  else console.log(`  all questions  not reported: ${unjudged} cited claims have no human verdict`);
}
writeFileSync(join(root, 'results', 'citation-metrics.json'), JSON.stringify(result, null, 2) + '\n');
