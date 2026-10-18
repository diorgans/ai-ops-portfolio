// Runs one Claude arm over the 45 questions and scores it with score-run.mjs.
//
//   node scripts/run-claude.mjs --arm no-abstain-instruction --dry-run
//   node scripts/run-claude.mjs --arm no-abstain-instruction --budget 1.5
//
// An arm is a prompt file in prompts/<arm>.txt. Everything else is identical between arms:
// same model, same KB in the system prompt, same output schema, thinking off.
//
// Safety rails (lessons from projects 1 and 2):
//   - spend is tracked from the API's own token counts and the run stops before the --budget ceiling
//   - a credit-balance 400 aborts at once instead of retrying
//   - results are written after every question, so a killed run loses nothing
//   - the reply is read from the first TEXT block, not content[0]
// The key is read from --key-file (default: project 2's gitignored key file).

import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { scoreRun, printMetrics } from './score-run.mjs';
import { postcheck } from './postcheck.mjs';

const root = join(import.meta.dirname, '..');
const arg = (name, dflt) => {
  const i = process.argv.indexOf('--' + name);
  return i === -1 ? dflt : process.argv[i + 1];
};
const ARM = arg('arm', null);
const MODEL = arg('model', 'claude-sonnet-5');
const BUDGET = Number(arg('budget', 1.5));
const CONC = Number(arg('concurrency', 3));
const KEYFILE = arg('key-file', join(root, '..', 'lead-triage', '.anthropic_key'));
const DRY = process.argv.includes('--dry-run');
if (!ARM) throw new Error('usage: node scripts/run-claude.mjs --arm <prompt name> [--forced] [--dry-run] [--budget 1.5]');

// $ per million tokens, from the claude-api skill's model table (cached 2026-10-06).
// Cache writes cost 1.25x input; cache reads 0.1x input.
const PRICES = { 'claude-sonnet-5': { in: 2, out: 10 } };
const price = PRICES[MODEL];
if (!price) throw new Error(`no price for ${MODEL}`);

const instructions = readFileSync(join(root, 'prompts', `${ARM}.txt`), 'utf8').trim();
const pagesDir = join(root, 'kb', 'pages');
const pageIds = readdirSync(pagesDir).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3)).sort();
// Drop link URLs, HTML and GitBook tags (about half the tokens, no meaning), keep lines and headings.
// Same substitutions as normalize() in scoring.mjs, minus the whitespace collapse.
const clean = (md) => md
  .replace(/\{%[^%]*%\}/g, '')
  .replace(/<a\b[^>]*>\s*<\/a>/g, '')
  .replace(/<\/?[a-z][^>]*>/gi, '')
  .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
  .replace(/[ \t]+$/gm, '')
  .replace(/\n{3,}/g, '\n\n')
  .trim();
const kb = pageIds.map((id) => `<page id="${id}">\n${clean(readFileSync(join(pagesDir, `${id}.md`), 'utf8'))}\n</page>`).join('\n\n');
const { questions } = JSON.parse(readFileSync(join(root, 'questions', 'questions.json'), 'utf8'));

// The scoring definition's output shape, enforced by structured outputs so every reply parses.
// The status/list consistency rules are NOT enforceable in a schema; validateOutput checks those.
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['status', 'claims', 'not_covered'],
  properties: {
    status: { type: 'string', enum: ['answered', 'partial', 'abstained'] },
    claims: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['text', 'citations'],
        properties: {
          text: { type: 'string' },
          citations: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['page', 'quote'],
              properties: { page: { type: 'string', enum: pageIds }, quote: { type: 'string' } },
            },
          },
        },
      },
    },
    not_covered: { type: 'array', items: { type: 'string' } },
  },
};
// --forced: no status and no not_covered list, so the format offers no way to decline.
// Tests whether the "abstained" option in SCHEMA was itself what made the model refuse.
const FORCED = process.argv.includes('--forced');
// --postcheck: run the code check (scripts/postcheck.mjs) on every answer; both versions are scored.
const POSTCHECK = process.argv.includes('--postcheck');
const pages = Object.fromEntries(pageIds.map((id) => [id, readFileSync(join(pagesDir, `${id}.md`), 'utf8')]));
const FORCED_SCHEMA = { ...SCHEMA, required: ['claims'], properties: { claims: SCHEMA.properties.claims } };

// Stable prefix first (instructions + KB, cached); the question varies per request.
const body = (question) => ({
  model: MODEL,
  max_tokens: 4000,
  thinking: { type: 'disabled' },
  output_config: { format: { type: 'json_schema', schema: FORCED ? FORCED_SCHEMA : SCHEMA } },
  system: [{ type: 'text', text: `${instructions}\n\n<knowledge_base>\n${kb}\n</knowledge_base>`, cache_control: { type: 'ephemeral' } }],
  messages: [{ role: 'user', content: `Question: ${question}` }],
});

const key = existsSync(KEYFILE) ? readFileSync(KEYFILE, 'utf8').trim() : process.env.ANTHROPIC_API_KEY?.trim();
if (!key) throw new Error(`no API key at ${KEYFILE} and ANTHROPIC_API_KEY is unset`);
const headers = { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let spent = 0;
let abortAll = null;
const cost = (u) =>
  ((u.input_tokens ?? 0) * price.in + (u.cache_creation_input_tokens ?? 0) * price.in * 1.25 +
   (u.cache_read_input_tokens ?? 0) * price.in * 0.1 + (u.output_tokens ?? 0) * price.out) / 1e6;

if (DRY) {
  // count_tokens is free: it proves the key, the request shape and the prompt size without spending.
  const { system, messages } = body(questions[0].question);
  const res = await fetch('https://api.anthropic.com/v1/messages/count_tokens', {
    method: 'POST', headers, body: JSON.stringify({ model: MODEL, system, messages }),
  });
  if (!res.ok) throw new Error(`count_tokens HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const { input_tokens: tok } = await res.json();
  const outEst = 600;
  const est = (tok * price.in * 1.25 + (questions.length - 1) * tok * price.in * 0.1 + questions.length * outEst * price.out) / 1e6;
  const uncached = (questions.length * (tok * price.in + outEst * price.out)) / 1e6;
  console.log(`DRY RUN, nothing spent. arm ${ARM}, model ${MODEL}, ${questions.length} questions`);
  console.log(`  input per request: ${tok} tokens (measured by count_tokens)`);
  console.log(`  estimate: ~$${est.toFixed(2)} with caching, ~$${uncached.toFixed(2)} if caching fails; ceiling $${BUDGET}`);
} else {
  await liveRun();
}

async function call(question, attempt = 0) {
  let res;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers, signal: AbortSignal.timeout(180000), body: JSON.stringify(body(question)),
    });
  } catch (e) {
    if (attempt < 4) { await sleep(2000 * (attempt + 1)); return call(question, attempt + 1); }
    return { error: `network: ${String(e?.message || e).slice(0, 140)}` };
  }
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 400 && /credit balance/i.test(text)) { abortAll = 'credit balance exhausted'; return { error: 'credit balance' }; }
    if ((res.status === 429 || res.status >= 500) && attempt < 4) { await sleep(3000 * (attempt + 1)); return call(question, attempt + 1); }
    return { error: `HTTP ${res.status}: ${text.slice(0, 300)}` };
  }
  const data = await res.json();
  const t = (data.content ?? []).find((c) => c.type === 'text');
  return { text: t?.text ?? '', usage: data.usage, stop: data.stop_reason };
}

async function liveRun() {
mkdirSync(join(root, 'results', 'raw'), { recursive: true });
// --tag r2 keeps a repeat run from overwriting an earlier one with the same prompt.
const TAG = arg('tag', null);
const arm = `claude-${ARM}${TAG ? '-' + TAG : ''}`;
const outFile = join(root, 'results', 'raw', `${arm}.json`);
const run = { arm, model: MODEL, forced: FORCED, postcheck: POSTCHECK, created_at: new Date().toISOString(), outputs: {}, log: {},
  ...(POSTCHECK ? { model_outputs: {} } : {}) };
const save = () => writeFileSync(outFile, JSON.stringify(run, null, 2) + '\n');

async function one(q) {
  if (abortAll) return;
  if (spent + 0.05 > BUDGET) { abortAll = `budget ceiling $${BUDGET}`; return; }
  const r = await call(q.question);
  if (r.usage) spent += cost(r.usage);
  if (r.error) {
    // An API failure is not the model's answer: record it, leave the output missing, and the run is incomplete.
    run.log[q.id] = { error: r.error };
  } else {
    let parsed = null;
    try { parsed = JSON.parse(r.text); } catch { /* counts as an invalid output */ }
    // Forced arm: the model could only give claims, so it "answered" by construction.
    const out = parsed && FORCED ? { status: 'answered', claims: parsed.claims, not_covered: [] } : parsed;
    if (POSTCHECK && out) {
      run.model_outputs[q.id] = out;
      run.outputs[q.id] = postcheck(out, pages);
    } else {
      run.outputs[q.id] = out;
    }
    run.log[q.id] = { stop: r.stop, usage: r.usage, ...(parsed ? {} : { raw: r.text }) };
  }
  save();
  console.log(`  ${q.id} ${r.error ? 'ERROR ' + r.error : run.outputs[q.id]?.status ?? 'unparsed'}  $${spent.toFixed(3)}`);
}

// First request alone so it writes the cache; the rest read it.
await one(questions[0]);
// Second request alone too: if it did not read the cache, caching is broken and the run would cost
// ~5x the estimate, so stop now rather than at the budget ceiling with half the answers missing.
await one(questions[1]);
if (!abortAll && !(run.log[questions[1].id]?.usage?.cache_read_input_tokens > 0)) abortAll = 'prompt cache not read';
let next = 2;
await Promise.all(Array.from({ length: CONC }, async () => {
  while (next < questions.length && !abortAll) await one(questions[next++]);
}));

run.spent_usd = Number(spent.toFixed(4));
run.halted = abortAll;
save();
console.log(`\nwrote ${outFile}\nspent $${spent.toFixed(3)}${abortAll ? `   HALTED: ${abortAll}` : ''}`);

const missing = questions.filter((q) => !(q.id in run.outputs)).map((q) => q.id);
if (missing.length) {
  console.log(`incomplete run, not scored. Missing: ${missing.join(', ')}`);
  process.exitCode = 1;
  return;
}
const m = scoreRun(run);
printMetrics(m);
writeFileSync(join(root, 'results', `${arm}.metrics.json`), JSON.stringify(m, null, 2) + '\n');
if (POSTCHECK) {
  // The same answers before the code check, to show what the check itself contributes.
  const before = scoreRun({ arm: `${arm}-before-postcheck`, outputs: run.model_outputs });
  printMetrics(before);
  writeFileSync(join(root, 'results', `${before.arm}.metrics.json`), JSON.stringify(before, null, 2) + '\n');
  const removed = Object.values(run.outputs).reduce((n, o) => n + (o.removed_claims?.length ?? 0), 0);
  console.log(`\npost-check removed ${removed} claim(s) whose quote was missing or not on the cited page`);
}
}
