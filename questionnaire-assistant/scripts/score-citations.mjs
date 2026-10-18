// Joins the human citation verdicts (labelling/citation-labels.json) back to the runs and computes
// citation validity with citationMetrics() from scoring.mjs: a claim is valid only if its quotes
// exist on the cited page (code) AND the reviewer judged they support the whole claim (human).
// Uncited claims and claims with missing quotes count as invalid without needing a human verdict.
//
// Scope: the reviewer judged the 122 claims on questions the docs don't fully answer. The final
// system's 69 claims on answerable questions were not judged, so they are not reported.
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
writeFileSync(join(root, 'results', 'citation-labels.json'),
  JSON.stringify({ exported_at: review.exported_at, labels: joined }, null, 2) + '\n');
const lookup = Object.fromEntries(joined.map((j) => [`${j.arm}|${j.qid}|${j.index}`, j.verdict]));

const result = {};
for (const arm of ['claude-forced-answer-r2', 'claude-grounded-v2']) {
  const run = JSON.parse(readFileSync(join(root, 'results', 'raw', `${arm}.json`), 'utf8'));
  const claims = [];
  for (const [qid, o] of Object.entries(run.outputs)) {
    if (gold[qid] === 'answer') continue; // not judged
    o.claims.forEach((c, i) => {
      const cited = c.citations.length > 0;
      const quotesExist = cited && claimQuotesExist(c, pages);
      const v = lookup[`${arm}|${qid}|${i}`];
      if (quotesExist && !v) throw new Error(`no verdict for ${arm} ${qid} claim ${i}`);
      claims.push({ cited, quotesExist, humanSupports: quotesExist ? v === 'supports' : undefined });
    });
  }
  result[arm] = citationMetrics(claims);
  const m = result[arm];
  console.log(`${arm}: citation validity ${(100 * m.citationValidity.rate).toFixed(0)}% ` +
    `(${m.citationValidity.hits}/${m.totalClaims}); quotes exist ${m.quotesExist}, uncited ${m.uncited}`);
}
writeFileSync(join(root, 'results', 'citation-metrics.json'), JSON.stringify(result, null, 2) + '\n');
