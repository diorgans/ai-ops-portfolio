// Validates data/labels.json against data/leads.json and the rubric, then
// reports the distribution and the majority-class baseline the system must beat.
//   node scripts/validate-labels.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const leads = JSON.parse(readFileSync(join(root, "data", "leads.json"), "utf8")).leads;
const raw = JSON.parse(readFileSync(join(root, "data", "labels.json"), "utf8"));
const labels = raw.labels || raw;

// Re-use the executable rubric from the labelling template.
const src = readFileSync(join(root, "scripts", "label.template.html"), "utf8");
const FIELD_KEYS = ["disqualifier","company_size","support_function","seniority","timeline","budget_signal","use_case_stated"];
const shim = `const FIELDS = ${JSON.stringify(FIELD_KEYS.map(k => ({ key:k })))};`;
const deriveTier = new Function(
  shim + src.slice(src.indexOf("const ORDER ="), src.indexOf("const KEY =")) + "; return deriveTier;"
)();

let problems = 0;
const flag = (m) => { problems++; console.log("  ISSUE  " + m); };

// 1. coverage
const missing = leads.filter(l => !labels[l.id]).map(l => l.id);
if (missing.length) flag(`not labelled: ${missing.join(", ")}`);
const extra = Object.keys(labels).filter(id => !leads.some(l => l.id === id));
if (extra.length) flag(`labels for unknown ids: ${extra.join(", ")}`);

// 2. completeness + internal consistency
for (const l of leads) {
  const v = labels[l.id];
  if (!v) continue;
  const blank = FIELD_KEYS.filter(k => !v[k]);
  if (blank.length) flag(`${l.id} missing: ${blank.join(", ")}`);
  if (!v.tier) { flag(`${l.id} has no tier`); continue; }
  if (blank.length) continue;
  const recomputed = deriveTier(v).tier;
  if (recomputed !== v.tier) flag(`${l.id} stored tier ${v.tier} but rubric derives ${recomputed}`);
}

console.log(problems === 0 ? "validation: clean\n" : `\nvalidation: ${problems} issue(s)\n`);

// 3. distribution
const count = (key) => {
  const m = {};
  for (const l of leads) { const v = labels[l.id]; if (v && v[key]) m[v[key]] = (m[v[key]] || 0) + 1; }
  return Object.entries(m).sort((a, b) => b[1] - a[1]);
};
const show = (title, rows) => {
  console.log(title);
  for (const [k, n] of rows) {
    const pct = (n / leads.length * 100).toFixed(0).padStart(3);
    console.log(`  ${String(k).padEnd(16)} ${String(n).padStart(2)}  ${pct}%  ${"█".repeat(Math.round(n / leads.length * 40))}`);
  }
  console.log("");
};

show("TIER", count("tier"));
show("DISQUALIFIER", count("disqualifier"));
show("SENIORITY", count("seniority"));
show("TIMELINE", count("timeline"));
show("COMPANY SIZE", count("company_size"));

// 4. the baseline to beat
const tiers = count("tier");
const [majTier, majN] = tiers[0];
console.log("BASELINE TO BEAT");
console.log(`  Always predict "${majTier}": ${majN}/${leads.length} = ${(majN / leads.length * 100).toFixed(1)}% tier accuracy`);

const dq = leads.filter(l => labels[l.id] && labels[l.id].disqualifier !== "none");
console.log(`  Disqualifiers present: ${dq.length}/${leads.length} (${(dq.length / leads.length * 100).toFixed(0)}%) — ${dq.map(l => l.id).join(", ")}`);
console.log(`  Always predict "none": ${(100 - dq.length / leads.length * 100).toFixed(1)}% disqualifier accuracy, but 0% recall`);

// 5. notes worth discussing
const notes = leads.filter(l => labels[l.id] && (labels[l.id].note || "").trim());
console.log(`\nNOTES LEFT (${notes.length})`);
for (const l of notes) console.log(`  ${l.id} [${labels[l.id].tier}] ${labels[l.id].note.trim()}`);

process.exit(problems === 0 ? 0 : 1);
