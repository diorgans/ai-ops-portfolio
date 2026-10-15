// Error analysis over a results file. No API calls.
//   node scripts/analyse.mjs results/<file>.json
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let file = process.argv[2];
if (!file) {
  const f = readdirSync(join(root, "results")).filter(x => x.endsWith(".json")).sort().pop();
  file = join(root, "results", f);
}
const R = JSON.parse(readFileSync(file, "utf8"));
const leads = JSON.parse(readFileSync(join(root, "data", "leads.json"), "utf8")).leads;
const truth = JSON.parse(readFileSync(join(root, "data", "labels.json"), "utf8")).labels;
const FIELDS = ["disqualifier","company_size","support_function","seniority","timeline","budget_signal","use_case_stated"];
const TIERS = ["A","B","C","D"];

for (const arm of ["derived","direct"]) {
  const rs = R.filter(r => r.arm === arm && r.parsed);
  console.log(`\n${"=".repeat(64)}\n${arm.toUpperCase()}  —  confusion matrix (rows = truth, cols = predicted)\n`);
  const m = {};
  for (const t of TIERS) m[t] = Object.fromEntries(TIERS.map(x => [x, 0]));
  for (const r of rs) if (m[r.gold_tier] && r.pred_tier) m[r.gold_tier][r.pred_tier]++;
  console.log("       " + TIERS.map(t => t.padStart(5)).join("") + "    (n)");
  for (const t of TIERS) {
    const row = TIERS.map(p => String(m[t][p]).padStart(5)).join("");
    const n = TIERS.reduce((a, p) => a + m[t][p], 0);
    const hit = n ? (m[t][t] / n * 100).toFixed(0) + "%" : "-";
    console.log(`  ${t}  ${row}    ${String(n).padStart(3)}   ${hit} correct`);
  }
}

// Which individual leads fail most, and what drives it.
console.log(`\n${"=".repeat(64)}\nWORST LEADS (derived arm)\n`);
const byLead = {};
for (const r of R.filter(r => r.arm === "derived" && r.parsed)) {
  (byLead[r.id] ||= []).push(r);
}
const ranked = Object.entries(byLead)
  .map(([id, rs]) => ({ id, wrong: rs.filter(r => !r.tier_correct).length, n: rs.length, rs }))
  .filter(x => x.wrong > 0)
  .sort((a, b) => b.wrong - a.wrong || a.id.localeCompare(b.id));

for (const { id, wrong, n, rs } of ranked) {
  const lead = leads.find(l => l.id === id);
  const g = truth[id];
  const preds = rs.map(r => r.pred_tier).join("/");
  // which labelled fields did the model disagree with, and how often
  const bad = FIELDS.filter(f => rs.some(r => !r.fields[f]))
    .map(f => `${f}(${rs.filter(r => !r.fields[f]).length}/${n})`);
  console.log(`${id}  truth ${g.tier}  predicted ${preds}   wrong ${wrong}/${n}`);
  console.log(`   field disagreements: ${bad.join(", ") || "none — rules differ only"}`);
  console.log(`   "${lead.message.slice(0, 110).replace(/\s+/g, " ")}…"`);
  console.log("");
}

// Does a field error actually cause the tier error?
console.log(`${"=".repeat(64)}\nFIELD DISAGREEMENT RATE, split by whether the tier was right (derived)\n`);
const d = R.filter(r => r.arm === "derived" && r.parsed);
const right = d.filter(r => r.tier_correct), wrongR = d.filter(r => !r.tier_correct);
console.log("  field                tier-correct   tier-wrong");
for (const f of FIELDS) {
  const a = right.length ? (right.filter(r => !r.fields[f]).length / right.length * 100) : 0;
  const b = wrongR.length ? (wrongR.filter(r => !r.fields[f]).length / wrongR.length * 100) : 0;
  console.log(`  ${f.padEnd(20)} ${a.toFixed(0).padStart(8)}%  ${b.toFixed(0).padStart(10)}%`);
}

// Run-to-run stability: same lead, same arm, different answers?
console.log(`\n${"=".repeat(64)}\nSTABILITY — leads where the 3 runs disagreed with each other\n`);
for (const arm of ["derived","direct"]) {
  const unstable = Object.entries(
    R.filter(r => r.arm === arm && r.parsed).reduce((m, r) => ((m[r.id] ||= []).push(r.pred_tier), m), {})
  ).filter(([, v]) => new Set(v).size > 1);
  console.log(`  ${arm}: ${unstable.length} of 50 leads varied across runs` +
    (unstable.length ? ` — ${unstable.map(([id, v]) => id + "(" + v.join("/") + ")").join(", ")}` : ""));
}
