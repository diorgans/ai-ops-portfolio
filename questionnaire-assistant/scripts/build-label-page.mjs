// Builds labelling/label.html: a single offline page where a human confirms or corrects every
// proposed label in questions/questions.json. It saves progress in the browser and exports
// gold-labels.json, which becomes the ground truth.
// The page embeds short excerpts of the n8n pages, so labelling/ is gitignored.
//
// Usage: node scripts/build-label-page.mjs

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { normalize } from './scoring.mjs';

const root = join(import.meta.dirname, '..');
// --set hard labels only the questions tagged with that set, so a reviewer never redoes earlier rounds.
const setArg = process.argv.includes('--set') ? process.argv[process.argv.indexOf('--set') + 1] : null;
const all = JSON.parse(readFileSync(join(root, 'questions', 'questions.json'), 'utf8'));
const questions = setArg ? all.questions.filter((q) => q.set === setArg) : all.questions;
const version = setArg ? `${all.version}-${setArg}` : all.version;
const sources = Object.fromEntries(
  readFileSync(join(root, 'kb', 'SOURCES.tsv'), 'utf8').trim().split('\n').map((l) => l.split('\t')).map(([id, url]) => [id, url]),
);
const pageText = (id) => normalize(readFileSync(join(root, 'kb', 'pages', `${id}.md`), 'utf8'));

// Show each quote with ~250 characters of surrounding page text, so the labeller judges it in context.
const CONTEXT = 250;
for (const q of questions) for (const p of q.points) for (const e of p.evidence ?? []) {
  const text = pageText(e.page);
  const at = text.indexOf(normalize(e.quote));
  const start = Math.max(0, at - CONTEXT);
  const end = Math.min(text.length, at + normalize(e.quote).length + CONTEXT);
  e.before = (start > 0 ? '…' : '') + text.slice(start, at);
  e.match = text.slice(at, at + normalize(e.quote).length);
  e.after = text.slice(at + normalize(e.quote).length, end) + (end < text.length ? '…' : '');
  e.url = sources[e.page];
}

const data = JSON.stringify({ version, questions }).replace(/</g, '\\u003c');
const html = readFileSync(join(import.meta.dirname, 'label-page.template.html'), 'utf8').replace('__DATA__', data);
mkdirSync(join(root, 'labelling'), { recursive: true });
writeFileSync(join(root, 'labelling', 'label.html'), html);
console.log(`labelling/label.html written: ${questions.length} questions`);
