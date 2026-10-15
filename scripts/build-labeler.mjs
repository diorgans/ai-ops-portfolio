// Builds scripts/label.html from label.template.html + data/leads.json.
// The data is inlined so the labelling page works by double-clicking it —
// a file:// page cannot fetch() a sibling JSON file (CORS blocks it).
//
//   node scripts/build-labeler.mjs
import { readFileSync, writeFileSync, renameSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tpl = join(root, "scripts", "label.template.html");
const out = join(root, "scripts", "label.html");

// First run: the template was authored as label.html — move it into place.
if (!existsSync(tpl) && existsSync(out) && readFileSync(out, "utf8").includes("__LEADS__")) {
  renameSync(out, tpl);
}

const template = readFileSync(tpl, "utf8");
const data = JSON.parse(readFileSync(join(root, "data", "leads.json"), "utf8"));

if (!template.includes("__LEADS__")) throw new Error("template is missing the __LEADS__ placeholder");
if (!Array.isArray(data.leads) || !data.leads.length) throw new Error("no leads found in data/leads.json");

const html = template.replace("__LEADS__", JSON.stringify(data.leads, null, 1));
writeFileSync(out, html, "utf8");

console.log(`built ${out}`);
console.log(`  leads inlined : ${data.leads.length}`);
console.log(`  size          : ${(html.length / 1024).toFixed(1)} KB`);
