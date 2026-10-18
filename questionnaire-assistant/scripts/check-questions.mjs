// Checks questions/questions.json against the KB before anyone labels it:
//   1. every supported point's quotes really exist in the cited KB page (same check the scorer uses)
//   2. every unsupported point's absent_terms really are absent from the whole KB (case-insensitive)
//      - a sanity check, not proof: absence of a phrase doesn't prove absence of the fact
//   3. the question type agrees with the gold label derived from its points
//   4. (with --outside) each true_outside_kb quote exists on that live n8n page
//
// Usage: node scripts/check-questions.mjs [--outside]

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { goldLabel, quoteExists, normalize } from './scoring.mjs';

const root = join(import.meta.dirname, '..');
const pagesDir = join(root, 'kb', 'pages');
const pages = Object.fromEntries(
  readdirSync(pagesDir).filter((f) => f.endsWith('.md')).map((f) => [f.slice(0, -3), readFileSync(join(pagesDir, f), 'utf8')]),
);
const wholeKb = normalize(Object.values(pages).join('\n')).toLowerCase();
const { questions } = JSON.parse(readFileSync(join(root, 'questions', 'questions.json'), 'utf8'));

const EXPECTED_GOLD = { answerable: 'answer', partial: 'partial', near_miss: 'abstain', off_topic: 'abstain' };
const problems = [];
const ids = new Set();

for (const q of questions) {
  if (ids.has(q.id)) problems.push(`${q.id}: duplicate id`);
  ids.add(q.id);
  if (goldLabel(q.points) !== EXPECTED_GOLD[q.type]) {
    problems.push(`${q.id}: type ${q.type} but points give gold "${goldLabel(q.points)}"`);
  }
  q.points.forEach((p, i) => {
    if (p.supported) {
      if (!p.evidence?.length) problems.push(`${q.id} point ${i}: supported but no evidence`);
      for (const e of p.evidence ?? []) {
        if (!quoteExists(e, pages)) problems.push(`${q.id} point ${i}: quote not found in ${e.page}: "${e.quote}"`);
      }
    } else {
      if (!p.absent_terms?.length) problems.push(`${q.id} point ${i}: unsupported but no absent_terms`);
      for (const t of p.absent_terms ?? []) {
        if (wholeKb.includes(normalize(t).toLowerCase())) problems.push(`${q.id} point ${i}: "absent" term IS in the KB: "${t}"`);
      }
    }
  });
}

if (process.argv.includes('--outside')) {
  for (const q of questions) for (const p of q.points) if (p.true_outside_kb) {
    const { url, quote } = p.true_outside_kb;
    const res = await fetch(`${url}.md`);
    const text = res.ok ? normalize(await res.text()) : '';
    if (!text.includes(normalize(quote))) problems.push(`${q.id}: outside quote not found at ${url}: "${quote}"`);
  }
}

const counts = Object.entries(Object.groupBy(questions, (q) => q.type)).map(([t, qs]) => `${t} ${qs.length}`).join(', ');
console.log(`${questions.length} questions (${counts})`);
if (problems.length) {
  console.log(`\n${problems.length} problem(s):`);
  for (const p of problems) console.log('  - ' + p);
  process.exit(1);
}
console.log('All checks passed.');
