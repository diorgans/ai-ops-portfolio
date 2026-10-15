# Lead Triage — Automated Scoring with a Measured Accuracy Baseline

An n8n workflow that takes inbound sales enquiries, uses Claude to extract structured fields and
assign a priority tier, writes the result to HubSpot, and is **measured against a hand-labelled
sample** rather than assumed to work.

All data is synthetic. No real person, company, or customer record appears anywhere in this repo.

**Status:** complete. Rubric written, 50 leads hand-labelled, two designs measured, pipeline built
and running end to end into HubSpot.

## Results

50 synthetic leads, hand-labelled, 3 runs per arm on `claude-opus-5` at `effort: low`. 300 calls,
$3.46.

| | tier accuracy | off-by-one | disqualifier recall |
|---|---|---|---|
| baseline — always predict the majority tier | 36.0% | — | 0% |
| **derived** — model reports facts, code applies the rubric | **82.7%** | 23/150 | **24/24** |
| **direct** — model reports facts *and* decides the tier | 71.3% | 40/150 | **24/24** |

Taking the tier decision away from the model is worth **+11.4 points** (~2.4 standard errors).
Across 3 runs only 1 of 50 leads varied in each arm, so the gap is systematic, not sampling noise.

### Where the gap actually comes from

Not from the disqualifier traps — both arms caught **24/24** with **zero** false positives,
including a support director at a perfect-fit company who was asking about jobs. The entire
difference is in how true-D leads are reached:

| direct arm, true-D rows | n | predicted non-D |
|---|---|---|
| D because of a disqualifier (Rule 1 — one absolute override) | 24 | **0** |
| D via Rules 2/3 (grid → modifier → cap) | 30 | **24** |

**The model applies a single explicit override rule perfectly and compositional rules badly.**
Rule 1 is one sentence with no arithmetic. Rules 2/3 require a table lookup, then a conditional
modifier, then an authority cap — and there it quietly rounds D up to C. In a sales queue that is
the expensive direction to be wrong in.

The derived arm doesn't have the problem because the composition happens in code, where it is
deterministic and unit-tested.

### Does it need the expensive model?

No. The derived arm was re-run on `claude-sonnet-5` — 50 calls, $0.20.

| model | tier accuracy | disqualifier recall | cost per lead |
|---|---|---|---|
| `claude-opus-5` | 82.7% (n=150) | 24/24 | $0.0115 |
| `claude-sonnet-5` | **86.0%** (n=50) | 8/8 | **$0.0040** |

Sonnet scores 3.3 points higher at **2.9× lower cost per lead**. That difference is about 0.6
standard errors, so the honest claim is **"no measurable difference at a third of the price"**, not
"Sonnet is better". Either way the cheaper model is the right production choice: at 1,000 leads a
month that is $4.00 versus $11.50, for accuracy that is indistinguishable on this sample.

Worth noting what did *not* degrade: disqualifier recall stayed perfect with zero false positives.
The thing that would actually hurt — a job seeker reaching a sales queue — is not where the cheaper
model gives anything up.

### Which field errors actually matter

Field accuracy is near-identical between arms (same prompt), so the tier gap isn't an extraction
problem. Within the derived arm, comparing rows where the tier was right against rows where it was
wrong:

| field | disagreement when tier correct | when tier wrong |
|---|---|---|
| `use_case_stated` | 4% | **58%** |
| `timeline` | 15% | 35% |
| `seniority` | 5% | 31% |
| `budget_signal` | 0% | 23% |
| `support_function` | 24% | 12% |

`use_case_stated` is the dominant error source — and `support_function`, despite being the
*least* accurate field overall at 78%, barely propagates to the tier at all. Accuracy per field is
the wrong thing to optimise; what matters is which field errors change the outcome.

### Honest caveat on the error count

Several of the 26 derived-arm misses are **label-vs-model disagreements on genuinely ambiguous
wording**, not clear model failures:

- **L03** — *"I lead support operations"*: labelled `manager`, model said `director`. Defensible
  either way, and it moves the tier.
- **L22** — Norwegian, *"Jeg er leder for kundeservice"*: same ambiguity, in translation.
- **L47** — a strong-fit prospect who *just signed with a competitor*. The rubric has no category
  for "good lead, wrong time", so it falls to D through a downgrade. That is a gap in the rubric,
  not a model error.

Tightening the `use_case_stated` and `seniority` definitions is the highest-value next change, and
it should be measured the same way rather than assumed to help.

### What the eval itself cost, and what I'd do differently

| run | calls | cost |
|---|---|---|
| Opus 5, both arms, 3 runs each | 300 | $3.46 |
| Sonnet 5, derived arm, 1 run | 50 | $0.20 |

**Three runs per arm was 3× more than this task needed.** Scored run-by-run, a single pass gives
the same answer:

| | derived | direct | gap |
|---|---|---|---|
| run 0 alone | 82.0% | 70.0% | 12.0pp |
| run 1 alone | 84.0% | 72.0% | 12.0pp |
| run 2 alone | 82.0% | 72.0% | 10.0pp |
| pooled | 82.7% | 71.3% | 11.4pp |

The repetition was carried over from a previous project where the failure *was* stochastic and a
single run per item genuinely told you nothing. Here only 1 of 50 leads varied across runs, so the
extra passes bought precision nobody needed and cost 3× as much.

The rule that falls out of it: **pilot with one run, measure the run-to-run variance, and only add
passes if the variance is large enough to change the conclusion.**

---

## The method, and why this order

The eval comes first. The rubric, the sample, and the labels are all finished **before** any
extraction prompt is written, so the system is built against a fixed target instead of the target
quietly being adjusted to flatter whatever the system happens to do.

This ordering comes from a previous project where it mattered concretely: measuring a screenshot
grader first revealed it was correct **34%** of the time on its main task, and the obvious fix — a
stronger prompt instruction — made it *worse* (34% → 24%). Only measurement distinguished the two.
Building the eval afterwards would have produced a number chosen to look good.

### Labels are produced by a human, not a model

The system under test is Claude. If the labels were also generated by a model, the eval would
measure **self-agreement**, not correctness — a system can agree with itself enthusiastically while
being wrong. So `data/leads.json` ships with no labels at all, and the ground truth in
`data/labels.json` is produced by a person working through `docs/RUBRIC.md`.

---

## What's here

| path | what it is |
|---|---|
| `docs/RUBRIC.md` | the scoring definition — ICP, extracted fields, tier rules, borderline cases decided in advance |
| `data/leads.json` | 50 synthetic inbound enquiries, hand-written, deliberately unlabelled |
| `scripts/label.html` | a local labelling tool — open it in a browser, no server needed |
| `scripts/label.template.html` | source for the above, before the data is inlined |
| `scripts/build-labeler.mjs` | rebuilds `label.html` from the template + `leads.json` |
| `scripts/test-rubric.mjs` | unit tests for the tier rules |
| `workflows/lead-triage.json` | the n8n workflow, importable |
| `workflows/code-node.js` | the Code node body alone, for rebuilding by hand |
| `docs/architecture.md` | one-page architecture note |
| `docs/demo-and-interview.md` | demo script and interview walkthrough |
| `docs/SETUP.md` | step-by-step setup for HubSpot + n8n |
| `results/` | raw eval output - the evidence behind every number above |

### The eval set

50 enquiries, written by hand rather than templated — templated data is too uniform and makes an
eval look better than it is. The set deliberately includes cases designed to be hard:

- a support director at a perfect-fit company who is **asking about jobs** (the rubric says D; the
  company profile says A)
- a competitor doing market research under the guise of a demo request
- an agency enquiring on behalf of an unnamed client
- two non-English enquiries
- one-line messages with no stated use case
- a lead who is a great fit but **just signed with a competitor**
- a procurement contact with no requirement detail

Email domains all use the RFC 2606 reserved `.example` TLD, so no synthetic record can collide with
a real domain.

### The rubric is executable, not just prose

`docs/RUBRIC.md` defines the tier rules; the labelling tool implements them, and
`scripts/test-rubric.mjs` tests that implementation with 25 cases.

That caught a real contradiction immediately. The rubric states *"A cannot be reached without
seniority of director or above"*, while the budget-signal modifier allowed a manager with an
immediate timeline to reach A. Prose alone did not surface it; a failing test did. The fix is an
authority gate applied after the modifiers.

The side effect is that a labeller only judges **seven facts** per lead, and the tier follows from
the rules — so labels cannot drift between the first lead and the fiftieth.

---

## What was done, in order

1. **Rubric written first** — ICP, extracted fields, tier rules, borderline cases decided in
   advance.
2. **50 synthetic leads hand-written**, deliberately unlabelled, including trap cases.
3. **Labelled by a human** against the rubric, then validated: every tier re-derives from the seven
   labelled facts. A QA pass corrected three labels whose category did not match its own definition.
4. **Baseline established** — always predicting the majority tier scores 36.0%.
5. **Two designs measured** — model-assigns-tier vs code-assigns-tier.
6. **Model choice measured** — Sonnet 5 against Opus 5.
7. **Pipeline built** on the winning design and run end to end into HubSpot.

## Known limitations

- **50 leads, one domain, synthetic.** Enough to find a real design flaw, not enough to certify
  accuracy on live traffic.
- **One labeller**, so there is no inter-rater agreement figure. Several residual errors are
  genuine wording ambiguity rather than model mistakes.
- **A rubric gap the eval surfaced:** a strong-fit prospect who has just signed with a competitor
  (L47) has no category and falls to D through a downgrade. It should be a nurture tier.
- **Not production-hardened** — n8n runs unsandboxed and uncontainerised, and there is no retry or
  dead-letter path. See `docs/architecture.md`.

## Running it

```bash
node scripts/test-rubric.mjs      # verify the tier rules
node scripts/build-labeler.mjs    # rebuild label.html after editing leads or rules
```

Then open `scripts/label.html` in a browser. Progress is saved locally as you go, so it can be done
in more than one sitting; **Export** writes `labels.json`.
