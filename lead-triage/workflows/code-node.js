// Parse Claude's reply, then apply the rubric IN CODE.
// Measured: deriving the tier here scores 82.7% vs 71.3% when the model is
// asked to decide it. The model is reliable at reporting facts and unreliable
// at multi-step rule composition, so the composition happens here.

const FIELDS = [
  { key: "disqualifier" }, { key: "company_size" }, { key: "support_function" },
  { key: "seniority" }, { key: "timeline" }, { key: "budget_signal" }, { key: "use_case_stated" },
];

const ORDER = ["D","C","B","A"];

// Executable form of docs/RUBRIC.md. The human labels the seven facts;
// the tier follows from the rules so labels stay internally consistent.
function deriveTier(f) {
  for (const x of FIELDS) if (!f[x.key]) return { tier:null, why:"Answer all seven to see the tier." };
  if (f.disqualifier !== "none") return { tier:"D", why:"Rule 1 — " + f.disqualifier.replace("_"," ") + " overrides fit." };
  if (f.company_size === "micro")
    return f.support_function === "yes"
      ? { tier:"C", why:"Rule 2 — micro company but a real support function." }
      : { tier:"D", why:"Rule 2 — micro company, no support function." };
  if (f.support_function === "no" && f.use_case_stated === "no")
    return { tier:"C", why:"Rule 2 — no support context and no stated use case." };

  const senior = f.seniority === "exec" || f.seniority === "director";
  const manager = f.seniority === "manager";
  const urgent = f.timeline === "immediate" || f.timeline === "this_quarter";
  let tier, why;
  if (senior)       { tier = urgent ? "A" : "B"; }
  else if (manager) { tier = urgent ? "B" : (f.timeline === "exploratory" ? "B" : "C"); }
  else              { tier = urgent ? "B" : "C"; }
  why = "Rule 3 grid → " + tier;

  if (f.budget_signal === "yes" && (senior || manager)) {
    const i = ORDER.indexOf(tier);
    if (i < 3) { tier = ORDER[i+1]; why += ", upgraded for budget signal"; }
  } else if (f.use_case_stated === "no") {
    const i = ORDER.indexOf(tier);
    if (i > 0) { tier = ORDER[i-1]; why += ", downgraded — no use case stated"; }
  }

  // Authority gate: A requires director or above. Without this the budget
  // upgrade can lift a manager to A, which contradicts the rubric. Applied
  // last so it caps whatever the modifiers produced.
  if (tier === "A" && !senior) { tier = "B"; why += ", capped at B — A needs director or above"; }

  return { tier, why };
}

// Leads arrived in Sept 2026. Timeline is judged relative to when the enquiry
// landed — that is the information a triage system has at scoring time.
function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { weekday:"short", day:"numeric", month:"short", year:"numeric" });
}

const out = [];
for (const item of $input.all()) {
  const blocks = item.json.content || [];
  const textBlock = blocks.find((b) => b.type === "text");
  const raw = (textBlock && textBlock.text) || "";

  let facts = null;
  try {
    let c = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
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
return out;