// Re-applies the current code check (postcheck.mjs) to the model answers saved in a --postcheck run,
// and scores the result. No API calls: the model's answers are reused as they are.
//
// Usage: node scripts/recheck.mjs results/raw/claude-grounded.json v2

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { postcheck } from './postcheck.mjs';
import { scoreRun, printMetrics } from './score-run.mjs';

const root = join(import.meta.dirname, '..');
const [file, tag] = process.argv.slice(2);
if (!file || !tag) throw new Error('usage: node scripts/recheck.mjs results/raw/<arm>.json <tag>');
const pagesDir = join(root, 'kb', 'pages');
const pages = Object.fromEntries(
  readdirSync(pagesDir).filter((f) => f.endsWith('.md')).map((f) => [f.slice(0, -3), readFileSync(join(pagesDir, f), 'utf8')]),
);
const run = JSON.parse(readFileSync(file, 'utf8'));
if (!run.model_outputs) throw new Error('run has no model_outputs; it was not a --postcheck run');

const arm = `${run.arm}-${tag}`;
const outputs = Object.fromEntries(Object.entries(run.model_outputs).map(([id, o]) => [id, postcheck(o, pages)]));
writeFileSync(join(root, 'results', 'raw', `${arm}.json`), JSON.stringify({ ...run, arm, outputs }, null, 2) + '\n');
const m = scoreRun({ arm, outputs });
printMetrics(m);
writeFileSync(join(root, 'results', `${arm}.metrics.json`), JSON.stringify(m, null, 2) + '\n');
const sum = (k) => Object.values(outputs).reduce((n, o) => n + (Array.isArray(o[k]) ? o[k].length : o[k] ?? 0), 0);
console.log(`\ncode check removed ${sum('removed_claims')} claim(s) and dropped ${sum('dropped_quotes')} quote(s)`);
