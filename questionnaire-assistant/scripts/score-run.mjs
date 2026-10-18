// Scores one run file against the human gold labels and prints the decision metrics.
// A run file is { arm, created_at, outputs: { <question id>: <system output> } }.
// Citation *support* needs a human, so here we only check that the quotes exist (code-checkable).
//
// Usage: node scripts/score-run.mjs results/raw/<arm>.json
// Writes results/<arm>.metrics.json next to the committed results.

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { decisionOf, decisionMetrics, claimQuotesExist } from './scoring.mjs';

const root = join(import.meta.dirname, '..');
const pagesDir = join(root, 'kb', 'pages');
const pages = Object.fromEntries(
  readdirSync(pagesDir).filter((f) => f.endsWith('.md')).map((f) => [f.slice(0, -3), readFileSync(join(pagesDir, f), 'utf8')]),
);
const pageIds = Object.keys(pages);
const { questions } = JSON.parse(readFileSync(join(root, 'questions', 'questions.json'), 'utf8'));
const gold = Object.fromEntries(
  JSON.parse(readFileSync(join(root, 'questions', 'gold-labels.json'), 'utf8')).labels.map((l) => [l.id, l.gold]),
);

export function scoreRun(run) {
  const rows = questions.map((q) => {
    const output = run.outputs[q.id];
    if (output === undefined) throw new Error(`run is missing question ${q.id}`);
    return { id: q.id, gold: gold[q.id], subtype: q.type, decision: decisionOf(output, pageIds) };
  });
  const claims = questions.flatMap((q) => {
    const o = run.outputs[q.id];
    return decisionOf(o, pageIds) === 'invalid' ? [] : o.claims;
  });
  const cited = claims.filter((c) => c.citations.length > 0);
  return {
    arm: run.arm,
    questions: rows.length,
    ...decisionMetrics(rows),
    claims: claims.length,
    uncitedClaims: claims.length - cited.length,
    claimsWithQuotesThatExist: cited.filter((c) => claimQuotesExist(c, pages)).length,
    rows,
  };
}

const pct = (r) => (r.rate === null ? 'n/a' : `${(100 * r.rate).toFixed(0)}% (${r.hits}/${r.total})`);

export function printMetrics(m) {
  console.log(`\n== ${m.arm} ==`);
  console.log(`  overclaim rate (headline)   ${pct(m.overclaim)}`);
  console.log(`  abstention recall           ${pct(m.abstentionRecall)}`);
  console.log(`    off-topic                 ${pct(m.abstentionRecallOffTopic)}`);
  console.log(`    near-miss                 ${pct(m.abstentionRecallNearMiss)}`);
  console.log(`  false-refusal rate          ${pct(m.falseRefusal)}`);
  console.log(`  hedge rate                  ${pct(m.hedge)}`);
  console.log(`  invalid outputs             ${pct(m.invalid)}`);
  console.log(`  claims ${m.claims}, uncited ${m.uncitedClaims}, quotes exist ${m.claimsWithQuotesThatExist}`);
  console.log('  confusion (rows = gold, columns = system):');
  for (const [g, cols] of Object.entries(m.matrix)) {
    console.log(`    ${g.padEnd(8)} ${Object.entries(cols).map(([c, n]) => `${c} ${n}`).join('  ')}`);
  }
}

if (process.argv[1] && basename(process.argv[1]) === 'score-run.mjs') {
  const file = process.argv[2];
  if (!file) throw new Error('usage: node scripts/score-run.mjs results/raw/<arm>.json');
  const m = scoreRun(JSON.parse(readFileSync(file, 'utf8')));
  printMetrics(m);
  writeFileSync(join(root, 'results', `${m.arm}.metrics.json`), JSON.stringify(m, null, 2) + '\n');
}
