# AI-ops portfolio — Noah Chen

Two projects. Both are about the same thing: **building something with an LLM, then measuring
whether it actually works** — and reporting what didn't.

| | what it is | headline |
|---|---|---|
| **[isya-eval](./isya-eval)** | accuracy eval of a live screenshot grader, and the fix it produced | **34% → 100%** stat capture, ~4× cheaper per scan |
| **[lead-triage](./lead-triage)** | inbound lead scoring with Claude + n8n + HubSpot, measured before it was built | **36% baseline → 82.7%**, at $0.004 per lead |

---

## isya-eval — measuring a system already in production

A Discord bot grades video-game gear from a screenshot: a vision model reads the item, and it scores
each stat against the best possible roll. Roughly 27 people in a ~177-member community had used it
across 120 graded items.

A user reported a stat going missing. Rather than guess at the prompt, I built an eval: six real
tooltips hand-labelled as ground truth, each run ten times, because the bug turned out to be
**intermittent on some items and total on others** — one run per item would have shown nothing.

**The baseline was 34%.** The feature was wrong about two times in three, and nobody noticed,
because a wrong answer still renders as a confident letter grade.

The diagnosis mattered more than the number. Across 96 runs the model **never misread a value** —
it read every number correctly and then wrote it into the wrong field, where scoring silently
ignored it. Not a perception failure, a classification failure. So the classification moved into
code: the model transcribes each line verbatim, and ordinary code decides by punctuation what the
value means.

**100%, 60 of 60**, including three items that had never once worked. Prompt size dropped ~8,500 →
~400 tokens for the stat portion, cutting cost ~4×. Deployed, and verified with a before/after on
the same item 22 minutes apart.

I also tried the obvious fix first — strengthening the prompt instruction — and it made things
**worse** (34% → 24%). That arm is in the writeup, because "we tried the obvious thing and measured
it failing" is the part that usually goes missing.

---

## lead-triage — measuring a system before building it

Inbound sales enquiries arrive as free text. Claude extracts structured facts, scoring rules assign
a priority tier, and n8n writes the result to HubSpot.

The rubric and 50 hand-labelled synthetic leads were finished **before any extraction code existed**,
so the system was built against a fixed target rather than the target being adjusted to flatter it.

| | tier accuracy |
|---|---|
| baseline — always predict the majority tier | 36.0% |
| model reports facts, **code** applies the rules | **82.7%** |
| model reports facts **and** picks the tier | 71.3% |

Both arms extracted fields at near-identical accuracy, so the 11-point gap isn't extraction.
Splitting the errors showed why: the model applied a **single absolute rule** perfectly (24/24) and
**multi-step compositional rules** badly (24 wrong of 30) — rounding hard disqualifications up to a
softer tier, which in a sales queue is the expensive direction.

Same lesson as the first project, in a different domain: **use the model for perception and
judgment, use code for bookkeeping.**

Also measured: `claude-sonnet-5` matched `claude-opus-5` within noise at a third the cost per lead,
so that's what ships — $0.004 per lead.

---

## How both projects are built

- **The scoring definition is executable, not prose.** In lead-triage the same implementation drives
  the labelling tool, the eval harness and the production workflow, so the deployed system cannot
  drift from the measured one. Making it executable immediately caught a contradiction the prose
  had hidden: the rubric claimed the top tier required a director, while a modifier let a manager
  reach it.
- **Ground truth is human.** The system under test is Claude; model-generated labels would measure
  self-agreement rather than correctness.
- **Limitations are stated, not buried.** Sample sizes, single-labeller caveats, label-versus-model
  ambiguity, and a rubric gap the eval surfaced are all written down.
- **Synthetic data is genuinely synthetic.** lead-triage uses RFC 2606 reserved domains so no record
  can collide with a real one.

Full method, raw results and limitations are in each project's README.
