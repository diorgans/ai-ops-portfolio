// Runs the extraction over data/leads.json and scores it against data/labels.json.
//
//   node scripts/run-extraction.mjs --dry-run
//   node scripts/run-extraction.mjs --model claude-opus-5 --runs 3 --budget 6
//
// Two arms, because the interesting question is whether the model should decide
// the tier at all:
//   derived  - model reports the seven facts; CODE applies the rubric  (prompts/facts-only.txt)
//   direct   - model reports the facts AND the tier itself             (prompts/facts-and-tier.txt)
//
// The key is read from --key-file (default: the ANTHROPIC_API_KEY env var).
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const arg = (name, dflt) => {
  const i = process.argv.indexOf("--" + name);
  return i === -1 ? dflt : (process.argv[i + 1] ?? true);
};
const DRY      = process.argv.includes("--dry-run");
const MODEL    = arg("model", "claude-opus-5");
const RUNS     = Number(arg("runs", 3));
const BUDGET   = Number(arg("budget", 6));
const EFFORT   = arg("effort", "low");       // classification: low effort is plenty
const CONC     = Number(arg("concurrency", 2));
const KEYFILE  = arg("key-file", null);
// --arms derived          run one arm only (half the calls, half the spend)
// --arms derived,direct   both (default)
const ARMS = String(arg("arms", "derived,direct")).split(",").map(s => s.trim()).filter(Boolean);

// $ per million tokens. Update from the live pricing page rather than memory.
const PRICES = {
  "claude-opus-5":   { in: 5,  out: 25 },
  "claude-sonnet-5": { in: 2,  out: 10 },
  "claude-sonnet-4-6": { in: 3, out: 15 },
  "claude-haiku-4-5": { in: 1, out: 5 },
};
const price = PRICES[MODEL];
if (!price) { console.error(`Unknown model "${MODEL}". Known: ${Object.keys(PRICES).join(", ")}`); process.exit(1); }

const leads  = JSON.parse(readFileSync(join(root, "data", "leads.json"), "utf8")).leads;
const truth  = JSON.parse(readFileSync(join(root, "data", "labels.json"), "utf8")).labels;
const PROMPTS = {
  derived: readFileSync(join(root, "prompts", "facts-only.txt"), "utf8"),
  direct:  readFileSync(join(root, "prompts", "facts-and-tier.txt"), "utf8"),
};

// The executable rubric, shared with the labelling tool and its tests.
const tplSrc = readFileSync(join(root, "scripts", "label.template.html"), "utf8");
const FIELD_KEYS = ["disqualifier","company_size","support_function","seniority","timeline","budget_signal","use_case_stated"];
const deriveTier = new Function(
  `const FIELDS = ${JSON.stringify(FIELD_KEYS.map(k => ({ key: k })))};` +
  tplSrc.slice(tplSrc.indexOf("const ORDER ="), tplSrc.indexOf("const KEY =")) +
  "; return deriveTier;"
)();

const SYSTEM = "You are a JSON-only API. You output exactly one JSON object and nothing else — no prose, no markdown fences, no explanation before or after. Your entire response must be valid JSON starting with { and ending with }.";

const leadText = (l) =>
  `Submitted: ${l.submitted_at}\nFrom: ${l.first_name} ${l.last_name} <${l.email}>\n` +
  `Company field: ${l.company || "(blank)"}\n\nMessage:\n${l.message}`;

let inTok = 0, outTok = 0, abortAll = null;
const spend = () => (inTok / 1e6) * price.in + (outTok / 1e6) * price.out;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function getKey() {
  if (KEYFILE && existsSync(KEYFILE)) return readFileSync(KEYFILE, "utf8").trim();
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY.trim();
  return null;
}

async function call(key, prompt, lead, attempt = 0) {
  let res;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: AbortSignal.timeout(180000),
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1200,
        system: SYSTEM,
        output_config: { effort: EFFORT },
        messages: [{ role: "user", content: prompt + "\n\n---\n\n" + leadText(lead) }],
      }),
    });
  } catch (e) {
    if (attempt < 5) { await sleep(1500 * (attempt + 1)); return call(key, prompt, lead, attempt + 1); }
    return { error: `network: ${String(e?.message || e).slice(0, 140)}` };
  }
  if (!res.ok) {
    const body = await res.text();
    if (res.status === 400 && /credit balance/i.test(body)) { abortAll = "credit balance exhausted"; return { error: "credit balance" }; }
    if ((res.status === 429 || res.status >= 500) && attempt < 5) { await sleep(2000 * (attempt + 1)); return call(key, prompt, lead, attempt + 1); }
    return { error: `HTTP ${res.status}: ${body.slice(0, 160)}` };
  }
  const data = await res.json();
  // Take the first TEXT block. On models where thinking cannot be disabled,
  // content[0] is a thinking block whose .text is empty.
  const t = (data.content || []).find(c => c.type === "text");
  return { text: t?.text ?? "", usage: data.usage };
}

function extractJson(text) {
  let c = String(text || "").replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const a = c.indexOf("{"), b = c.lastIndexOf("}");
  if (a !== -1 && b > a) c = c.slice(a, b + 1);
  try { return JSON.parse(c); } catch { return null; }
}

function scoreOne(arm, pred, gold) {
  if (!pred) return { parsed: false };
  const fields = {};
  for (const k of FIELD_KEYS) fields[k] = pred[k] === gold[k];
  const predTier = arm === "direct" ? pred.tier : deriveTier(pred).tier;
  const ORD = { D: 0, C: 1, B: 2, A: 3 };
  const adjacent = predTier && Math.abs((ORD[predTier] ?? -9) - ORD[gold.tier]) === 1;
  return {
    parsed: true, pred_tier: predTier, gold_tier: gold.tier,
    tier_correct: predTier === gold.tier, tier_adjacent: !!adjacent,
    gold_dq: gold.disqualifier, pred_dq: pred.disqualifier,
    dq_correct: pred.disqualifier === gold.disqualifier,
    dq_caught: gold.disqualifier !== "none" ? pred.disqualifier !== "none" : null,
    dq_false_alarm: gold.disqualifier === "none" ? pred.disqualifier !== "none" : null,
    fields,
  };
}

// ---- dry run: verify the plumbing and estimate cost without spending ----
if (DRY) {
  const sample = PROMPTS.derived + "\n\n---\n\n" + leadText(leads[0]);
  const estIn = Math.round(sample.length / 3.6);          // rough chars-per-token
  const nCalls = leads.length * RUNS * ARMS.length;
  const estOut = 220;
  const est = (estIn * nCalls / 1e6) * price.in + (estOut * nCalls / 1e6) * price.out;
  console.log(`DRY RUN — nothing called, nothing spent\n`);
  console.log(`  model        : ${MODEL}  (effort ${EFFORT})`);
  console.log(`  leads        : ${leads.length}`);
  console.log(`  arms         : ${ARMS.join(", ")}`);
  console.log(`  runs per arm : ${RUNS}`);
  console.log(`  total calls  : ${nCalls}`);
  console.log(`  est input    : ~${estIn} tok/call`);
  console.log(`  ESTIMATED    : ~$${est.toFixed(2)}   (ceiling set to $${BUDGET})`);
  console.log(`\n  key available: ${getKey() ? "yes" : "NO — pass --key-file or set ANTHROPIC_API_KEY"}`);
  // Exercise the scorer on a fabricated perfect prediction so the plumbing is proven.
  const gold = truth[leads[0].id];
  const fake = Object.fromEntries(FIELD_KEYS.map(k => [k, gold[k]]));
  const s = scoreOne("derived", fake, gold);
  console.log(`\n  scorer self-check on ${leads[0].id}: derived tier ${s.pred_tier} vs gold ${s.gold_tier} -> ${s.tier_correct ? "match" : "MISMATCH"}`);
  process.exit(s.tier_correct ? 0 : 1);
}

// ---- live run ----
const key = getKey();
if (!key) { console.error("No API key. Pass --key-file <path> or set ANTHROPIC_API_KEY."); process.exit(1); }

const jobs = [];
for (let r = 0; r < RUNS; r++) for (const l of leads) for (const arm of ARMS) jobs.push({ arm, l, r });

const outDir = join(root, "results");
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outFile = join(outDir, `run-${MODEL}-${stamp}.json`);

const results = [];
let cur = 0, done = 0;
async function worker() {
  while (cur < jobs.length) {
    if (abortAll) return;
    if (spend() + 0.05 > BUDGET) { abortAll = `budget ceiling $${BUDGET}`; return; }
    const j = jobs[cur++];
    const resp = await call(key, PROMPTS[j.arm], j.l);
    if (resp.usage) { inTok += resp.usage.input_tokens || 0; outTok += resp.usage.output_tokens || 0; }
    const pred = resp.error ? null : extractJson(resp.text);
    results.push({ arm: j.arm, id: j.l.id, run: j.r, error: resp.error || null,
                   raw: resp.error ? null : resp.text, ...scoreOne(j.arm, pred, truth[j.l.id]) });
    if (++done % 20 === 0) {
      writeFileSync(outFile, JSON.stringify(results, null, 1));   // incremental: a kill loses nothing
      console.log(`  ${done}/${jobs.length}  $${spend().toFixed(2)}`);
    }
  }
}
await Promise.all(Array.from({ length: CONC }, worker));
writeFileSync(outFile, JSON.stringify(results, null, 1));

console.log(`\nwrote ${outFile}`);
console.log(`tokens in ${inTok} out ${outTok}   COST $${spend().toFixed(2)}${abortAll ? `   HALTED: ${abortAll}` : ""}\n`);

const ORD = { D: 0, C: 1, B: 2, A: 3 };
for (const arm of ARMS) {
  const rs = results.filter(r => r.arm === arm);
  const ok = rs.filter(r => r.parsed);
  if (!ok.length) { console.log(`--- ${arm.toUpperCase()}: no parsed results ---\n`); continue; }
  const tier = ok.filter(r => r.tier_correct).length;
  const adj  = ok.filter(r => r.tier_adjacent).length;
  const dqGold = ok.filter(r => r.gold_dq !== "none");
  const dqCaught = dqGold.filter(r => r.dq_caught).length;
  const falseAlarms = ok.filter(r => r.dq_false_alarm).length;
  console.log(`--- ${arm.toUpperCase()}  (n=${rs.length}, parsed ${ok.length}, errors ${rs.filter(r => r.error).length}) ---`);
  console.log(`  tier exact      : ${tier}/${ok.length}  (${(tier / ok.length * 100).toFixed(1)}%)`);
  console.log(`  tier off-by-one : ${adj}/${ok.length}`);
  console.log(`  disqualifier recall  : ${dqCaught}/${dqGold.length}`);
  console.log(`  false disqualifiers  : ${falseAlarms}/${ok.filter(r => r.gold_dq === "none").length}`);
  for (const k of FIELD_KEYS) {
    const n = ok.filter(r => r.fields[k]).length;
    console.log(`    ${k.padEnd(18)} ${(n / ok.length * 100).toFixed(0).padStart(3)}%`);
  }
  console.log("");
}
console.log(`BASELINE: always predict the majority tier = ${(Object.values(truth).filter(v => v.tier === "D").length / leads.length * 100).toFixed(1)}%`);
