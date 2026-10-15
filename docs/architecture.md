# Lead Triage — Architecture Note

One page. How it works, the one decision that mattered, and what I'd change for production.

## System

```
Inbound enquiry (webhook POST)
   │
   ▼
n8n — Webhook node
   │
   ▼
Claude (claude-sonnet-5)  ──  reports SEVEN FACTS about the message
   │                          disqualifier, company_size, support_function,
   │                          seniority, timeline, budget_signal, use_case_stated
   │                          …and nothing else. It is told not to assign a priority.
   ▼
n8n — Code node  ──  applies the rubric IN CODE and derives the tier
   │                 Rule 1 (disqualifier override) → Rule 2 (out of profile)
   │                 → Rule 3 grid → one modifier → authority gate
   ▼
HubSpot CRM  ──  contact created with lead_triage_tier and lead_triage_reason
   │
   ▼
Webhook response: { tier, reason, facts }
```

Self-hosted n8n, Claude via HTTP, HubSpot via its v3 REST API. Both external calls use generic
header auth, so setup is two credentials and no OAuth round-trip.

## The decision that mattered

The model is asked for **facts**, never for the **tier**. That split was measured, not assumed:

| | tier accuracy |
|---|---|
| model reports facts, code assigns the tier | **82.7%** |
| model reports facts *and* assigns the tier | 71.3% |
| baseline — always predict the majority tier | 36.0% |

Both arms used identical field definitions and extracted fields at near-identical accuracy, so the
11-point gap is not an extraction problem. Splitting true-D leads by *how* they qualify shows where
it actually comes from:

| direct arm, true-D rows | n | predicted non-D |
|---|---|---|
| D via Rule 1 — a single absolute override | 24 | **0** |
| D via Rules 2/3 — grid → modifier → cap | 30 | **24** |

**The model applies one explicit override rule perfectly and compositional rules badly.** Rule 1 is
a sentence. Rules 2/3 require a table lookup, a conditional modifier, then a cap — and there it
quietly rounds D up to C, which in a sales queue is the expensive direction.

The general principle: **use the model for perception and judgment, use code for bookkeeping.** The
boundary belongs wherever a rule can be written down deterministically.

## One rubric, three consumers

`docs/RUBRIC.md` defines the tier rules once. The same executable implementation is used by:

1. **the labelling tool** — a human judges seven facts, the rules derive the tier, so labels cannot
   drift between the first lead and the fiftieth
2. **the eval harness** — scores the model through identical rules
3. **the production workflow** — `scripts/build-workflow.mjs` injects it into the n8n Code node

So the deployed pipeline cannot silently diverge from the thing that was measured. Changing the
rubric means re-running the builder, and the tests catch contradictions — which they did: the
rubric asserted "A requires director or above" while a modifier allowed a manager to reach A. A
failing test found it; reading the prose had not.

## Model choice

`claude-sonnet-5`, measured against `claude-opus-5`:

| model | tier accuracy | cost per lead |
|---|---|---|
| opus-5 | 82.7% (n=150) | $0.0115 |
| sonnet-5 | 86.0% (n=50) | $0.0040 |

A 3.3-point difference at ~0.6 standard errors — statistically indistinguishable, at a third of the
price. Disqualifier recall stayed perfect with zero false positives on both, so the failure that
would actually cost something is not where the cheaper model gives anything up. At 1,000 leads a
month that's $4.00 against $11.50.

## Integration decisions worth noting

- **Email domains are rewritten at the CRM boundary.** The eval set uses the RFC 2606 reserved
  `.example` TLD so no synthetic record can collide with a real domain. HubSpot rejects it as an
  invalid address. Rather than weaken the test data, `…@x.example` is mapped to `…@x.example.com`
  on the way into HubSpot. Real addresses pass through untouched. Synthetic-data hygiene and a real
  validator conflicted; the boundary is the right place to reconcile that.
- **Service Keys, not private apps.** HubSpot retired private-app creation for newer accounts in
  late 2026. Service Keys are the data-only replacement and authenticate identically
  (`Authorization: Bearer`). A project-based app would add the HubSpot CLI for no benefit here.
- **Header auth over dedicated nodes** for both calls — fewer moving parts, and it survives node
  version drift between n8n releases.

## Known gaps, and what production would need

- **Code runs unsandboxed.** n8n's internal task-runner mode executes Code-node JavaScript inside
  the main process with no isolation. Fine here — the only code is ours and the data is synthetic.
  Real deployments should run the task runner in external mode.
- **n8n runs outside a container**, which n8n has deprecated. Production would use the official
  Docker image.
- **No retry, no dead-letter path.** If HubSpot is down the lead is lost. A real pipeline needs a
  queue and a replay path.
- **One labeller.** Ground truth is a single person's judgment. A second labeller and an
  inter-rater agreement figure would materially strengthen the accuracy claim — several residual
  "errors" are genuine wording ambiguity rather than model failures.
- **The rubric has a gap.** A strong-fit prospect who just signed with a competitor (L47) has no
  category and falls to D through a downgrade. It should be a nurture tier.
- **50 leads, one domain, synthetic.** Enough to find a real design flaw, not enough to certify
  accuracy for live traffic.
