# AI-ops portfolio — Noah Chen

Three projects. All are about the same thing: **building something with an LLM, then measuring
whether it actually works** — and reporting what didn't.

| | what it is | headline |
|---|---|---|
| **[isya-eval](./isya-eval)** | accuracy eval of a live screenshot grader, and the fix it produced | **34% → 100%** stat capture, ~4× cheaper per scan |
| **[lead-triage](./lead-triage)** | inbound lead scoring with Claude + n8n + HubSpot, measured before it was built | **36% baseline → 82.7%**, at $0.004 per lead |
| **[questionnaire-assistant](./questionnaire-assistant)** | drafts cited questionnaire answers from docs, measured on when it should say "I don't know" | **0% overclaim** with a "not covered" slot; without it, quotes fully support only **36%** of claims on hard questions |

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

## questionnaire-assistant — measuring the failure that costs money

Claude drafts answers to customer questionnaire questions from 21 pages of n8n's public docs, with a
word-for-word quote for every claim and a person approving before anything is sent. The metric
isn't answer quality; it's the **overclaim rate**: confident answers the docs don't support.

60 hand-labelled questions, a third of which the docs can't fully answer. For 16 of those points the
true answer was found on n8n pages *outside* the knowledge base, so answering from memory would show
up as a failure.

The first result made my own test pointless: Claude without any instruction to refuse scored
**0% overclaim**, so I report that and asked why. The answer was the **output format**. With a slot
for "the docs don't cover this", Claude parked what it didn't know. Remove the slot and ask forced
Yes/No questions, and it started **guessing from neighbouring text**, citing quotes that exist word
for word, so a code check passes them. A blind human review found its quotes fully supported only
**36%** of claims on the hard questions; with the final design, **68%**, and no wrong conclusions.

| | overclaim ↓ | wrongly refuses ↓ |
|---|---|---|
| always answer | 100% | 0% |
| keyword match, no model | 23% | 64% |
| **final: not-covered slot + grounding rules + code check + human review** | **0%** | **0%** |

Same lesson a third time: a 20-line code check after the model fixed every self-contradictory answer
(4 → 0). Also reported: a first test set that was too easy, a question-writing bias the keyword
baseline exposed, and a code check that threw out true claims until it was fixed. $3.40 in API
calls for every run combined.

---

## How the projects are built

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
