// Downloads the knowledge-base pages listed in kb/SOURCES.tsv into kb/pages/.
// The pages are n8n's content, so they are not committed; this script recreates them.
// docs.n8n.io serves a Markdown version of any page when ".md" is added to its URL, with the
// shared snippets filled in (the GitHub source leaves them as placeholders).
//
// Usage: node scripts/fetch-kb.mjs

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const sourcesPath = join(root, 'kb', 'SOURCES.tsv');
const pagesDir = join(root, 'kb', 'pages');
mkdirSync(pagesDir, { recursive: true });

const today = new Date().toISOString().slice(0, 10);
const rows = readFileSync(sourcesPath, 'utf8').trim().split('\n').map((line) => line.split('\t'));

const updated = [];
for (const [id, url] of rows) {
  const res = await fetch(`${url}.md`);
  if (!res.ok) throw new Error(`${id}: HTTP ${res.status} from ${url}.md`);
  const text = await res.text();
  if (text.includes('{% include')) throw new Error(`${id}: page still contains unresolved includes`);
  writeFileSync(join(pagesDir, `${id}.md`), text);
  updated.push([id, url, today].join('\t'));
  console.log(`${String(text.split(/\s+/).length).padStart(5)} words  ${id}`);
}

writeFileSync(sourcesPath, updated.join('\n') + '\n');
console.log(`\n${rows.length} pages saved to kb/pages/, download date ${today} recorded in kb/SOURCES.tsv`);
