// Builds labelling/citations.html: a human judges whether each claim's quotes actually support it.
// This is the part the code cannot check: a quote can exist word for word and still not back the claim.
//
// Only claims whose quotes exist are judged (the rest already fail in code). Claims are shuffled and
// shown without saying which run wrote them, so the reviewer can't favour one system.
// The key from item to run is written separately to labelling/citation-items.json.
// Both files embed n8n excerpts, so labelling/ is gitignored.
//
// Order: claims on questions the docs don't fully answer first (forced + grounded, mixed),
// then the grounded system's claims on answerable questions. Stopping early still leaves the key comparison.
//
// Usage: node scripts/build-citation-page.mjs

import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { normalize, claimQuotesExist } from './scoring.mjs';

const root = join(import.meta.dirname, '..');
const pagesDir = join(root, 'kb', 'pages');
const pages = Object.fromEntries(
  readdirSync(pagesDir).filter((f) => f.endsWith('.md')).map((f) => [f.slice(0, -3), readFileSync(join(pagesDir, f), 'utf8')]),
);
const text = Object.fromEntries(Object.entries(pages).map(([id, md]) => [id, normalize(md)]));
const sources = Object.fromEntries(
  readFileSync(join(root, 'kb', 'SOURCES.tsv'), 'utf8').trim().split('\n').map((l) => l.split('\t')).map(([id, url]) => [id, url]),
);
const { questions } = JSON.parse(readFileSync(join(root, 'questions', 'questions.json'), 'utf8'));
const gold = Object.fromEntries(JSON.parse(readFileSync(join(root, 'questions', 'gold-labels.json'), 'utf8')).labels.map((l) => [l.id, l.gold]));
const qText = Object.fromEntries(questions.map((q) => [q.id, q.question]));
const load = (arm) => JSON.parse(readFileSync(join(root, 'results', 'raw', `${arm}.json`), 'utf8'));

const CONTEXT = 200;
function excerpt(c) {
  const t = text[c.page]; const quote = normalize(c.quote); const at = t.indexOf(quote);
  const start = Math.max(0, at - CONTEXT); const end = Math.min(t.length, at + quote.length + CONTEXT);
  return { page: c.page, url: sources[c.page], before: (start > 0 ? '…' : '') + t.slice(start, at),
    match: t.slice(at, at + quote.length), after: t.slice(at + quote.length, end) + (end < t.length ? '…' : '') };
}

function claimsOf(arm, keep) {
  const run = load(arm); const out = [];
  for (const [qid, o] of Object.entries(run.outputs)) {
    if (!keep(qid)) continue;
    o.claims.forEach((c, i) => {
      if (c.citations.length && claimQuotesExist(c, pages)) out.push({ arm, qid, index: i, claim: c.text, quotes: c.citations.map(excerpt) });
    });
  }
  return out;
}

// Deterministic shuffle so a rebuild gives the same order.
let seed = 20261017;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

const risky = (qid) => gold[qid] !== 'answer';
const first = shuffle([...claimsOf('claude-forced-answer-r2', risky), ...claimsOf('claude-grounded-v2', risky)]);
const second = shuffle(claimsOf('claude-grounded-v2', (qid) => !risky(qid)));
const items = [...first, ...second].map((it, n) => ({ key: `c${String(n + 1).padStart(3, '0')}`, ...it }));

mkdirSync(join(root, 'labelling'), { recursive: true });
writeFileSync(join(root, 'labelling', 'citation-items.json'),
  JSON.stringify(items.map(({ key, arm, qid, index }) => ({ key, arm, qid, index })), null, 2) + '\n');
const data = JSON.stringify({
  version: 'citations-v1', priorityCount: first.length,
  items: items.map(({ key, qid, claim, quotes }) => ({ key, question: qText[qid], claim, quotes })),
}).replace(/</g, '\\u003c');
const html = readFileSync(join(import.meta.dirname, 'citation-page.template.html'), 'utf8').replace('__DATA__', data);
writeFileSync(join(root, 'labelling', 'citations.html'), html);
console.log(`labelling/citations.html written: ${items.length} claims (${first.length} priority, ${second.length} after)`);
