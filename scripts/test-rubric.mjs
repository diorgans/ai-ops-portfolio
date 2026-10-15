// Tests the executable tier rules inside the labelling page against docs/RUBRIC.md.
// If this is wrong, every hand label is wrong, so it runs before any labelling.
//   node scripts/test-rubric.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(join(root, "scripts", "label.template.html"), "utf8");

const start = src.indexOf("const ORDER =");
const end = src.indexOf("const KEY =");
if (start === -1 || end === -1) throw new Error("could not locate the rule block in the template");
const FIELD_KEYS = ["disqualifier","company_size","support_function","seniority","timeline","budget_signal","use_case_stated"];
const shim = `const FIELDS = ${JSON.stringify(FIELD_KEYS.map(k => ({ key:k })))};`;
const deriveTier = new Function(shim + src.slice(start, end) + "; return deriveTier;")();

const base = {
  disqualifier:"none", company_size:"mid", support_function:"yes",
  seniority:"manager", timeline:"exploratory", budget_signal:"no", use_case_stated:"yes",
};
const F = (o) => Object.assign({}, base, o);

const cases = [
  // Rule 1 — absolute
  ["job seeker at a perfect-fit company is still D",
    F({ disqualifier:"job_seeker", seniority:"director", timeline:"immediate", budget_signal:"yes", company_size:"large" }), "D"],
  ["competitor is D",      F({ disqualifier:"competitor", seniority:"exec" }), "D"],
  ["spam is D",            F({ disqualifier:"spam" }), "D"],
  ["consumer is D",        F({ disqualifier:"consumer", company_size:"unknown", support_function:"no" }), "D"],

  // Rule 2
  ["micro with no support function is D", F({ company_size:"micro", support_function:"no" }), "D"],
  ["micro WITH a support function is C",  F({ company_size:"micro", support_function:"yes" }), "C"],
  ["no support context and no use case is C",
    F({ support_function:"no", use_case_stated:"no", seniority:"exec", timeline:"immediate" }), "C"],

  // Rule 3 grid
  ["exec + immediate = A",        F({ seniority:"exec", timeline:"immediate" }), "A"],
  ["director + this_quarter = A", F({ seniority:"director", timeline:"this_quarter" }), "A"],
  ["director + exploratory = B",  F({ seniority:"director", timeline:"exploratory" }), "B"],
  ["director + none_stated = B",  F({ seniority:"director", timeline:"none_stated" }), "B"],
  ["manager + immediate = B",     F({ seniority:"manager", timeline:"immediate" }), "B"],
  ["manager + exploratory = B",   F({ seniority:"manager", timeline:"exploratory" }), "B"],
  ["manager + none_stated = C",   F({ seniority:"manager", timeline:"none_stated" }), "C"],
  ["ic + immediate = B",          F({ seniority:"ic", timeline:"immediate" }), "B"],
  ["ic + exploratory = C",        F({ seniority:"ic", timeline:"exploratory" }), "C"],
  ["unknown + none_stated = C",   F({ seniority:"unknown", timeline:"none_stated" }), "C"],

  // Modifiers
  ["budget + manager upgrades C to B",
    F({ seniority:"manager", timeline:"none_stated", budget_signal:"yes" }), "B"],
  ["budget + director upgrades B to A",
    F({ seniority:"director", timeline:"exploratory", budget_signal:"yes" }), "A"],
  ["no use case downgrades B to C",
    F({ seniority:"manager", timeline:"immediate", use_case_stated:"no" }), "C"],
  ["no use case downgrades A to B",
    F({ seniority:"exec", timeline:"immediate", use_case_stated:"no" }), "B"],
  ["budget does NOT upgrade an IC",
    F({ seniority:"ic", timeline:"exploratory", budget_signal:"yes" }), "C"],

  // The authority gate stated in the rubric: "A cannot be reached without
  // seniority of director or above." A manager with budget must cap at B.
  ["budget cannot push a MANAGER to A",
    F({ seniority:"manager", timeline:"immediate", budget_signal:"yes" }), "B"],
  ["budget cannot push an IC to A",
    F({ seniority:"ic", timeline:"immediate", budget_signal:"yes" }), "B"],

  // Incomplete input yields no tier
  ["missing an answer yields null", { disqualifier:"none" }, null],
];

let pass = 0, fail = 0;
for (const [name, fields, expected] of cases) {
  const got = deriveTier(fields).tier;
  if (got === expected) { pass++; }
  else { fail++; console.log(`  FAIL  ${name}\n        expected ${expected}, got ${got}`); }
}
console.log(`\nrubric rules: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
