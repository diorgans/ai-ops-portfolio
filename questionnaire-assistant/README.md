# Questionnaire answer assistant: measuring when it should say "I don't know"

Claude drafts answers to customer questionnaire questions from a fixed knowledge base (21 pages of
n8n's public documentation), cites a word-for-word quote for every claim, and a person approves the
draft before it goes out.

Most retrieval demos measure whether the answer was good. This project measures the costlier
failure: **a confident answer the documentation does not support.** The headline metric is the
overclaim rate: how often the system answers fully when the docs only partly cover the question,
or not at all.

## Headline result

| system (60 questions) | overclaim rate ↓ | refuses when it should ↑ | refuses when it shouldn't ↓ |
|---|---|---|---|
| Always answer (floor) | 100% (35/35) | 0% (0/24) | 0% (0/25) |
| Keyword match, no model | 23% (8/35) | 83% (20/24) | **64%** (16/25) |
| Claude, no refusal instruction | 0% (0/35) | 50% (12/24) | 0% (0/25) |
| Claude, answer format with no way to decline | 100% by design, see below | 0% | 0% |
| **Final system:** grounding rules + code check | **0% (0/35)** | **75% (18/24)** | **0% (0/25)** |

**The main finding is about the answer format, not the prompt.** When the format has a slot for
"the documentation doesn't cover this", Claude Sonnet 5 never answered fully when the docs didn't
cover the question: 0 overclaims in 165 answers across three runs, even without being told to refuse. Remove that slot and phrase the
question as a forced Yes/No, and it starts guessing: it gave a definite Yes/No on 6 of 7 questions
the docs can't answer, by reasoning from neighbouring text. Every one of those guesses cited quotes that exist
word for word, so a code check for citations passes them. Only a human check of whether the quote
*supports* the claim catches them.

### Does the quote actually support the claim?

A person judged each claim against its quote, blind to which system wrote it, on the questions the
docs don't fully answer (where the risk is):

| system | claims | citation valid (quote exists **and** supports the whole claim) |
|---|---|---|
| Answer format with no way to decline | 117 | **36%** (42/117); 22 claims had no citation at all |
| Final system | 28 | **68%** (19/28) |

- **The human check caught every confirmed wrong guess** in the forced run: all claims behind the
  wrong quota and publishing answers were marked "doesn't support".
- **It missed one.** "No, the 200 MiB limit cannot be raised on n8n Cloud" was reasoned from "In
  self-hosted environments, you can change this size limit". A real, on-topic quote; the conclusion
  comes from what the page leaves out. It passed both the code check and the human check, and is
  the subtlest overclaim in the project.
- **The final system's 9 unsupported claims are smaller.** Most add a detail the quote doesn't name
  ("the **Code node** supports Python" from "n8n added Python support"); two add commentary on what
  the docs omit. None is a wrong conclusion. The reviewer applied the same strict standard to both
  systems, blind, so the comparison holds even where a single verdict is debatable.
- **Scope:** the final system's 69 claims on answerable questions were not judged, so its overall
  citation validity is unknown.

## What we found

1. **The model didn't recall facts from training; it guessed from nearby text.** For 16
   unanswerable points the true answer is on n8n pages outside the knowledge base (for example,
   the webhook payload limit is 16MB). A search of all 270 answers from all 5 runs for those values
   ("16MB", "336", "65 seconds", "five days", "Combine By", …) found none. The failures were
   inferences instead: "error workflows are triggered automatically, production executions count
   toward the quota, so error workflow runs probably count". They don't.
2. **The failures repeat.** Two of the three wrong inferences in the first forced run (error
   workflow quota, whether an error workflow must be published) recurred in the second run.
3. **Yes/No pressure mostly produces "No".** In the forced format, 5 of the 6 definite answers to
   unanswerable Yes/No questions were "No" (4 true by luck, 1 unverifiable); the sixth was an implied
   "Yes" that is wrong (error workflow runs count toward the quota). A Yes/No that a reviewer
   can't trace to the docs is the risk this tool exists to prevent, true or not.
4. **Claude rejects false assumptions.** "Since data tables are capped at 10,000 rows…", "Since n8n
   encrypts credentials with AES-256…", "Because the Code node on Cloud can import any npm
   package…": every run, in every format, pointed out that the docs don't say this or say otherwise.
5. **Code is better at the bookkeeping.** In 4 of 60 answers the model's status contradicted its own
   lists (for example, "answered" while listing something as not covered). A 20-line check after the
   model recomputes the status from the lists and drops quotes that aren't on the page: invalid outputs
   went from 4 to 0. This is the same pattern as the two earlier projects in this portfolio.

## What didn't work

- **The first question set was too easy.** Claude without any refusal instruction scored 0%
  overclaim on the original 45 questions, so the headline metric had nothing left to measure. That
  is why the format experiment and the 15 harder questions exist.
- **The keyword baseline found a bias in my questions.** It caught 89% of the original near misses,
  which a word-matching method shouldn't manage. The cause: the near-miss questions contained words
  absent from the docs ("payload size", "SQL join"), while the answerable ones were reworded away
  from the docs' phrasing. I reported this rather than rewriting the questions after seeing results.
- **The first version of the code check removed 3 true claims.** It dropped a whole claim if any
  of its quotes was under 4 words, and short bullet-list items ("HTTP Request") tripped it.
  Version 2 drops only the bad quote. This was fixed by re-running the check on the saved answers,
  with no new model calls, and is disclosed because it was changed after seeing results.
- **Even the final system's claims are only 68% fully supported by their quotes** on the hard
  questions. The grounding rules stop wrong conclusions; they don't stop small embellishments. The
  human reviewer remains necessary, which is why the design keeps one.
- **The final system hedges.** On 5 of 25 answerable questions it answered fully but also listed
  things nobody asked about as "not covered" (for example, "SMS alerts are not described"). Not a
  risk, but noise for the reviewer.
- **The scoring calls a helpful answer a miss.** On near misses, Claude usually gives the related
  facts the docs do contain and marks the specific question as not covered. The scoring definition,
  written before any results, counts that as a missed refusal, not an overclaim. I kept the definition
  instead of changing it after the fact; the "refuses when it should" column is lower because of it.

## How it is measured

- **Scoring definition first** ([docs/scoring-definition.md](docs/scoring-definition.md)), written
  before any system code and made executable in `scripts/scoring.mjs` with unit tests (29 tests).
  Writing the tests caught a contradiction in the definition's own prose.
- **Gold labels from a human.** Each question is split into points; each point is "in the docs"
  (with a quote) or "not in the docs". The reviewer confirmed or corrected every point in a
  purpose-built labelling page. In two rounds the reviewer flagged 10 of 60 questions. All 10 traced to how
  the evidence was shown, not to the facts: quotes cut too short to show the whole point (fixed by
  widening the quote), or bullet-list items displayed run together. After each fix the reviewer
  agreed with the label.
- **Supported means stated in the docs. True doesn't count.** For 16 unanswerable points, the true
  answer was verified on live n8n pages outside the knowledge base, so a correct answer from memory
  would show up as an overclaim.
- **Status counts on its own can't catch a wrong claim inside an answer.** Citation checks therefore
  have two layers: code checks the quote exists on the cited page; a human judges whether it
  supports the claim, blind to which system wrote it.
- **One run per arm.** Two arms happened to run twice (first on 45 questions, then on 60), which
  showed the main failures repeat. No other repeat runs were made.

## Limitations

- 60 questions, written by the same model family that is being tested. They may lean toward what
  Claude finds easy.
- The reviewer is not an n8n expert. The review checks whether quotes say what the points claim; it
  is weaker at catching a "not in the docs" fact that is actually there in different words. A keyword
  search backs this up but doesn't prove absence.
- One model (Claude Sonnet 5, thinking off) and one knowledge base, small enough to fit in a single
  prompt, so there is no retrieval step to fail.

## Reproduce

Node 24, no npm packages. The n8n pages are not committed (they are n8n's content); `fetch-kb`
downloads them.

```
node scripts/fetch-kb.mjs                       # download the 21 pages
node scripts/check-questions.mjs --outside      # verify every quote and outside fact
node --test scripts/scoring.test.mjs            # scoring tests
node --test scripts/postcheck.test.mjs          # code-check tests
node scripts/baselines.mjs                      # the two no-model baselines (free)
node scripts/run-claude.mjs --arm grounded --postcheck --dry-run   # cost estimate, free
node scripts/run-claude.mjs --arm grounded --postcheck --budget 1.5
node scripts/build-citation-page.mjs            # blind human citation check page
node scripts/score-citations.mjs                # citation validity from the human verdicts
```

The API key is read from a gitignored file (`--key-file`) or `ANTHROPIC_API_KEY`. The runner stops
before a spending cap, aborts on an out-of-credit error, and writes results after every question.

**Total API cost of every run in this README: $3.40.**
