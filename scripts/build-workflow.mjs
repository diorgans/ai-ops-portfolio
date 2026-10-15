// Generates workflows/lead-triage.json for import into n8n.
//
// The Claude prompt and the tier rules are pulled from the SAME files the eval
// scored, so the deployed pipeline cannot silently drift from the thing that
// was measured. Re-run this after changing either.
//
//   node scripts/build-workflow.mjs
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PROMPT = readFileSync(join(root, "prompts", "facts-only.txt"), "utf8");

// Lift the executable rubric out of the labelling template so the workflow
// applies exactly the rules the humans laboured under and the eval scored.
const tpl = readFileSync(join(root, "scripts", "label.template.html"), "utf8");
const rubric = tpl.slice(tpl.indexOf("const ORDER ="), tpl.indexOf("const KEY =")).trim();

const MODEL = "claude-sonnet-5";   // measured: same accuracy as Opus 5, ~1/3 the cost

const codeJs = `// Parse Claude's reply, then apply the rubric IN CODE.
// Measured: deriving the tier here scores 82.7% vs 71.3% when the model is
// asked to decide it. The model is reliable at reporting facts and unreliable
// at multi-step rule composition, so the composition happens here.

const FIELDS = [
  { key: "disqualifier" }, { key: "company_size" }, { key: "support_function" },
  { key: "seniority" }, { key: "timeline" }, { key: "budget_signal" }, { key: "use_case_stated" },
];

${rubric}

const out = [];
for (const item of $input.all()) {
  const blocks = item.json.content || [];
  const textBlock = blocks.find((b) => b.type === "text");
  const raw = (textBlock && textBlock.text) || "";

  let facts = null;
  try {
    let c = raw.replace(/\`\`\`json\\s*/gi, "").replace(/\`\`\`\\s*/g, "").trim();
    const a = c.indexOf("{"), b = c.lastIndexOf("}");
    if (a !== -1 && b > a) c = c.slice(a, b + 1);
    facts = JSON.parse(c);
  } catch (e) {
    out.push({ json: { ok: false, error: "could not parse model reply", raw: raw.slice(0, 400) } });
    continue;
  }

  const { tier, why } = deriveTier(facts);
  const lead = $('Webhook').first().json.body || {};

  out.push({ json: {
    ok: true,
    tier,
    tier_reason: why,
    facts,
    lead,
    model: item.json.model || null,
    usage: item.json.usage || null,
  }});
}
return out;`;

const wf = {
  name: "Lead Triage — Claude + rubric → HubSpot",
  nodes: [
    {
      parameters: { httpMethod: "POST", path: "lead-triage", responseMode: "responseNode", options: {} },
      id: "a1000000-0000-4000-8000-000000000001",
      name: "Webhook",
      type: "n8n-nodes-base.webhook",
      typeVersion: 2,
      position: [-220, 0],
      webhookId: "a1000000-0000-4000-8000-000000000001",
    },
    {
      parameters: {
        method: "POST",
        url: "https://api.anthropic.com/v1/messages",
        authentication: "genericCredentialType",
        genericAuthType: "httpHeaderAuth",
        sendHeaders: true,
        headerParameters: { parameters: [{ name: "anthropic-version", value: "2023-06-01" }] },
        sendBody: true,
        specifyBody: "json",
        jsonBody:
          "={{ JSON.stringify({\n" +
          `  model: ${JSON.stringify(MODEL)},\n` +
          "  max_tokens: 1200,\n" +
          '  system: "You are a JSON-only API. You output exactly one JSON object and nothing else.",\n' +
          "  output_config: { effort: \"low\" },\n" +
          "  messages: [{ role: \"user\", content: " +
          JSON.stringify(PROMPT) +
          ' + "\\n\\n---\\n\\nSubmitted: " + ($json.body.submitted_at || new Date().toISOString())' +
          ' + "\\nFrom: " + ($json.body.first_name || "") + " " + ($json.body.last_name || "")' +
          ' + " <" + ($json.body.email || "") + ">"' +
          ' + "\\nCompany field: " + ($json.body.company || "(blank)")' +
          ' + "\\n\\nMessage:\\n" + ($json.body.message || "") }]\n' +
          "}) }}",
        options: { timeout: 120000 },
      },
      id: "a1000000-0000-4000-8000-000000000002",
      name: "Claude — extract facts",
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      position: [0, 0],
    },
    {
      parameters: { jsCode: codeJs },
      id: "a1000000-0000-4000-8000-000000000003",
      name: "Apply rubric (code)",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [220, 0],
    },
    {
      parameters: {
        method: "POST",
        url: "https://api.hubapi.com/crm/v3/objects/contacts",
        authentication: "genericCredentialType",
        genericAuthType: "httpHeaderAuth",
        sendBody: true,
        specifyBody: "json",
        jsonBody:
          // HubSpot validates the email domain and rejects the RFC 2606 .example
          // TLD outright (INVALID_EMAIL). The eval set uses .example on purpose so
          // no synthetic record can collide with a real domain, so rather than
          // weaken the test data, map it at the CRM boundary: foo@bar.example
          // becomes foo@bar.example.com. Still reserved, still obviously fake,
          // but a real TLD so validation passes. Real addresses pass through
          // untouched.
          "={{ JSON.stringify({ properties: {\n" +
          "  email: String($json.lead.email || '').replace(/\\.example$/i, '.example.com'),\n" +
          "  firstname: $json.lead.first_name,\n" +
          "  lastname: $json.lead.last_name,\n" +
          "  company: $json.lead.company,\n" +
          "  lead_triage_tier: $json.tier,\n" +
          "  lead_triage_reason: $json.tier_reason\n" +
          "} }) }}",
        options: { timeout: 30000 },
      },
      id: "a1000000-0000-4000-8000-000000000004",
      name: "HubSpot — create contact",
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      position: [440, 0],
    },
    {
      parameters: {
        respondWith: "json",
        responseBody:
          "={{ JSON.stringify({ tier: $('Apply rubric (code)').first().json.tier, reason: $('Apply rubric (code)').first().json.tier_reason, facts: $('Apply rubric (code)').first().json.facts }) }}",
        options: {},
      },
      id: "a1000000-0000-4000-8000-000000000005",
      name: "Respond",
      type: "n8n-nodes-base.respondToWebhook",
      typeVersion: 1,
      position: [660, 0],
    },
  ],
  connections: {
    Webhook: { main: [[{ node: "Claude — extract facts", type: "main", index: 0 }]] },
    "Claude — extract facts": { main: [[{ node: "Apply rubric (code)", type: "main", index: 0 }]] },
    "Apply rubric (code)": { main: [[{ node: "HubSpot — create contact", type: "main", index: 0 }]] },
    "HubSpot — create contact": { main: [[{ node: "Respond", type: "main", index: 0 }]] },
  },
  settings: { executionOrder: "v1" },
  pinData: {},
};

if (!existsSync(join(root, "workflows"))) mkdirSync(join(root, "workflows"), { recursive: true });
const out = join(root, "workflows", "lead-triage.json");
writeFileSync(out, JSON.stringify(wf, null, 2), "utf8");

// Also emit the Code node body on its own, so the pipeline can be rebuilt by
// hand if the import format does not match this n8n version.
writeFileSync(join(root, "workflows", "code-node.js"), codeJs, "utf8");

console.log(`wrote ${out}`);
console.log(`  model        : ${MODEL}`);
console.log(`  nodes        : ${wf.nodes.length}`);
console.log(`  prompt chars : ${PROMPT.length}`);
console.log(`  rubric chars : ${rubric.length}`);
console.log(`wrote workflows/code-node.js (fallback for manual rebuild)`);
