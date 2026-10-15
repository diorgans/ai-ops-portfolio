# Lead Triage Rubric v1

The scoring definition. Written **before** any extraction code exists, so the system is
built against a fixed target rather than the target being adjusted to flatter the system.

All data in this project is **synthetic**. No real person, company, or customer record appears
anywhere in it.

---

## The scenario

Leads are inbound "contact us" / demo-request form submissions for a fictional B2B SaaS company:

> **Northwind Analytics** — a customer-support analytics platform. It ingests support tickets and
> chat transcripts and reports on resolution time, deflection, CSAT drivers, and agent workload.

**Ideal customer profile (ICP)**

| dimension | in profile |
|---|---|
| company size | 50–5,000 employees |
| has a support/CX function | yes — a team of ≥5 support agents |
| buyer personas | Head of Support, Director/VP of CX, Support Operations, Customer Service Manager |
| geography | any English-speaking market |

Out of profile: companies under ~50 people (no dedicated support org), pure consumer/personal use,
and anyone with no support function at all.

---

## What the system must extract

For each lead, produce exactly these fields:

| field | type | notes |
|---|---|---|
| `company_name` | string or null | null if not stated — do **not** infer from an email domain |
| `company_size` | `micro` \| `small` \| `mid` \| `large` \| `unknown` | <50 / 50–249 / 250–1999 / 2000+ |
| `industry` | string or null | as stated or clearly implied |
| `role_title` | string or null | verbatim if given |
| `seniority` | `exec` \| `director` \| `manager` \| `ic` \| `unknown` | |
| `use_case` | string or null | one short phrase, in their words where possible |
| `timeline` | `immediate` \| `this_quarter` \| `exploratory` \| `none_stated` | |
| `budget_signal` | boolean | true only if budget, pricing approval, or spend is explicitly referenced |
| `disqualifier` | `none` \| `job_seeker` \| `student` \| `competitor` \| `vendor_pitch` \| `consumer` \| `spam` | |
| `tier` | `A` \| `B` \| `C` \| `D` | per the rules below |
| `rationale` | string | one sentence, must cite something actually present in the message |

---

## Tier rules

Apply in order. **The first rule that matches wins.**

### Rule 1 — Disqualifiers override everything → `D`

If `disqualifier != none`, the tier is **D**, regardless of how good the company looks.

This is the rule most likely to be broken, and it is deliberate. A support director at a
perfect-ICP company who is **asking about open roles** is a `D`, not an `A`. So is a competitor
"evaluating the market", and a vendor pitching their own service through the contact form.

- `job_seeker` — asking about employment, careers, internships, or sending a CV
- `student` — academic project, thesis, coursework, student society
- `competitor` — works at a company offering overlapping support-analytics tooling
- `vendor_pitch` — selling something to Northwind rather than buying
- `consumer` — individual wanting the product for personal use, no company context
- `spam` — incoherent, link farm, unrelated solicitation

### Rule 2 — Out of ICP → `C` or `D`

- Company is `micro` (<50) **and** no indication of a real support team → **D**
- Company is `micro` but describes a growing support function → **C**
- No support/CX context at all and no stated use case → **C**

### Rule 3 — In ICP, graded on authority + intent

| | `immediate` or `this_quarter` | `exploratory` | `none_stated` |
|---|---|---|---|
| **exec / director** | **A** | **B** | **B** |
| **manager** | **B** | **B** | **C** |
| **ic / unknown** | **B** | **C** | **C** |

Then apply one modifier, at most once (the upgrade is checked first):

- **Upgrade one tier** (C→B, B→A) if `budget_signal` is true **and** seniority is manager or above.
- **Downgrade one tier** (A→B, B→C) if the message is so vague that `use_case` would be null —
  i.e. no stated problem at all.

**Finally, the authority gate.** `A` cannot be reached without seniority of director or above; a
computed `A` from anyone more junior is capped at `B`. A hot-looking message from someone with no
purchasing influence is a B, and the system should not inflate it.

> This cap is applied **last**, after the modifiers. It exists because the budget upgrade would
> otherwise lift a manager with an immediate timeline from B to A, contradicting the sentence above.
> That contradiction was live in the first draft of this rubric and was caught by
> `scripts/test-rubric.mjs`, not by re-reading the prose — which is the argument for making a
> rubric executable rather than leaving it as a document.

---

## Borderline cases, decided in advance

Writing these down now prevents the labels drifting to match whatever the model happens to do.

1. **Great company, junior contact, urgent tone** → `B`. Urgency does not substitute for authority.
2. **Perfect fit but the message is one line with no use case** → downgrade one tier (Rule 3 modifier).
3. **Agency or consultancy asking on behalf of a client** → treat as in-ICP if the *end client*
   fits and they say so; `C` if they do not name the client's situation.
4. **Someone who is both a potential buyer and a job seeker** → `D`. Rule 1 is absolute.
5. **Company size not stated but a well-known large brand is named** → infer `large`. Size may be
   inferred from a named company; it may not be inferred from an email domain alone.
6. **Non-English message** → label on content as normal; language is not a disqualifier.

---

## How this gets measured

The eval reports, against Noah's hand labels:

- **Tier accuracy** — exact match rate, plus a confusion matrix (A/B/C/D)
- **Adjacent-tier rate** — how often it is off by one (B vs A matters less than D vs A)
- **Disqualifier recall** — of leads with a true disqualifier, how many were caught. This is the
  metric that matters most: a missed disqualifier puts a job seeker into a sales queue.
- **Field-level accuracy** — per extracted field, separately from the tier
- **Cost per lead**

Baseline to beat: always predicting the majority tier. If the system cannot beat that, it is not
working, regardless of how reasonable its rationales sound.

---

## Open decisions for Noah

These are my choices, not yours. Change any of them and I will regenerate the data to match.

1. **Leads, not candidates.** Your CLAUDE.md says "lead/candidate triage"; I picked inbound sales
   leads because HubSpot is a CRM and the mapping is natural. Candidate triage is the same
   machinery with a different rubric if you'd rather do that.
2. **Four tiers rather than a 0–100 score.** Tiers are far easier to hand-label consistently, and
   consistency in the labels is what makes the eval trustworthy. A numeric score invites
   disagreement over whether something is a 71 or a 76.
3. **Rule 1 is absolute.** I made disqualifiers override everything, which creates deliberately
   trappy cases. If you'd rather a strong-fit job seeker be a `C`, say so.
4. **The fictional company.** Northwind Analytics is invented so there is a concrete ICP to judge
   against. Swap it for anything you know better and the rubric still holds.
