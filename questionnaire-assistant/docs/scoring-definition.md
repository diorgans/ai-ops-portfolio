# Scoring definition — v0 (draft for review)

Written before any answering code exists, so the target cannot drift to flatter the system.

## 1. The knowledge base

21 pages from n8n's public docs (docs.n8n.io), downloaded 2026-10-16 (UTC) as Markdown. The full list
with URLs is in `kb/SOURCES.tsv`. Total about 15,300 words.

| area | pages |
|---|---|
| Flow logic (7) | handle errors, loop, merge data, split with conditionals, execution order, wait, break into sub-workflows |
| Working with data (7) | data structure, pin/mock data, reference previous nodes, expressions, dates and times, filter data, data tables |
| Code (2) | Code node, custom variables |
| Workflows and executions (5) | credentials, save/publish, execution types, debug executions, workflow settings |

**What is left out on purpose:** self-hosting, environment variables, queue mode, AI/agent
features, and individual integration nodes. That gives a large set of things that are true about
n8n but are **not in this knowledge base**.

**The whole KB fits in one prompt** (roughly 20k tokens). That means v1 needs no search or
retrieval step. Every miss then belongs to the answering behaviour, not to a retriever that
failed to find the page. Retrieval can be tested later as its own variable.

## 2. The trap this is built to catch

Claude already knows a lot about n8n from training. An answer can be **true and still unsupported
by the KB**. In a real questionnaire workflow that is still a failure: the reviewer cannot check it
against an approved source.

So the rule is: **supported means stated in the KB. Being true does not count.** The question set
deliberately includes questions whose true answer sits in n8n docs pages that are *not* in the KB.

## 3. Gold labels (human, per question)

Each question is broken into the **points** a complete answer needs. A human marks each point
`supported` (and gives the page and the passage) or `unsupported`.

The question's gold label follows mechanically from its points:

| gold label | rule |
|---|---|
| `answer` | every point is supported |
| `abstain` | no point is supported |
| `partial` | some points are supported and some are not |

Unsupported questions also get a sub-type for reporting:
- `off_topic`: the KB doesn't cover the subject at all (e.g. queue mode).
- `near_miss`: the KB covers the subject but not this specific fact. These are the hard ones.

**Who labels:** Claude drafts the questions and the proposed labels, each with its evidence quote.
A human reviewer confirms or corrects every label in a labelling page. A label nobody has confirmed is not gold.
Known limitation: Claude wrote the questions, so they may lean toward what Claude finds easy.
The writeup has to say that.

## 4. What the system must output (per question)

```json
{
  "status": "answered | partial | abstained",
  "claims": [
    { "text": "…", "citations": [ { "page": "loop", "quote": "exact text copied from the page" } ] }
  ],
  "not_covered": ["the parts of the question the KB does not answer"]
}
```

Rules, checked by code:
- `abstained` means `claims` is empty and `not_covered` is not. A refusal has to say what is
  missing.
- `answered` means `claims` is not empty and `not_covered` is empty.
- `partial` means both lists are non-empty.
- Every citation names a KB page and gives a quote.

A claim with **no** citation does not make the output invalid, because the decision can still be
scored. Instead it counts as an invalid claim in the citation metrics (section 5). Making it
invalid would mix up two different failures: a wrong decision and a missing source.

The output's `status` is the system's **decision**. Code reads the decision from that field. It
does not try to infer the decision from the wording of the answer.

## 5. Metrics

### Decision metrics (code only; gold label vs. system status)

| metric | definition | why it matters |
|---|---|---|
| **Overclaim rate** (headline) | gold is `abstain` or `partial`, system says `answered` | the costly failure: a confident answer the KB doesn't fully support |
| **Abstention recall** | gold is `abstain`, system says `abstained` | the planned primary metric |
| **False-refusal rate** | gold is `answer`, system says `abstained` | refusing everything would game the metrics above |
| Hedge rate | gold is `answer`, system says `partial` | reported separately: milder than a false refusal |

The full 3×3 confusion matrix is always reported. The metrics above are cuts of it. Abstention
recall is also split into off-topic and near-miss.

### Citation metrics (judged per claim)

A claim may cite several passages. They are judged **together**, because some facts need two
sentences to support them.

| metric | who decides | definition |
|---|---|---|
| **Quotes exist** | code | every quote on the claim appears word for word in its cited page. Whitespace and Markdown formatting are normalised; case and wording are not |
| **Quotes support** | human | the claim's quotes, read together and alone, back up the claim. Only asked when the quotes exist, which saves labelling |
| **Citation validity** (headline) | both | the share of all claims whose quotes exist *and* support them. An uncited claim counts as invalid, so it can't be hidden |
| Uncited claims | code | reported as a count as well |

A citation is judged only on the quote it gives. A claim backed by a made-up quote fails even if
the page does say something similar elsewhere. A quote shorter than **4 words** does not count.
Otherwise a quote like "n8n" would trivially "exist" everywhere.

### Invalid outputs

An output that can't be parsed, or that breaks the status rules in section 4, is scored as
`invalid`. It gets its own column in the confusion matrix. It is never counted as a correct
abstention or a correct answer, but it is not an overclaim either. It always counts as a miss.

### Answer accuracy (human)

This is judged only where gold is `answer` or `partial` and the system answered at least in part.
Each supported gold point gets one mark:
- `covered`: the answer states it correctly.
- `missing`: the answer leaves it out.
- `wrong`: the answer contradicts it.

Accuracy is the share of points marked `covered`. Any `wrong` gets listed individually in the
report.

## 6. Question set (planned size)

About 45 questions:

| type | count |
|---|---|
| answerable | 20 |
| near-miss unanswerable | 9, of which at least 5 are true facts found in n8n docs outside the KB |
| off-topic unanswerable | 6 |
| partial | 10 |

They are phrased the way a team evaluating n8n would ask them ("Can we…", "Does n8n…"), not as
quiz questions.

## 7. Baselines (measured before the real system)

1. **Always answer.** Abstention recall is 0 by construction. The point is to show how
   misleading plain accuracy is.
2. **Keyword match.** Answer with the best-matching paragraph if the word-overlap score clears a
   threshold, otherwise abstain. No model is involved. This is the "dumb" baseline.
3. **Claude with the KB and no abstention instruction.** This shows how often the model fills
   gaps from what it already knows.

## 8. Pilot

One run per arm. Add more runs only if the measured run-to-run variance could change the
conclusion. The cost estimate is quoted before any run, and the harness enforces a spending cap.

## 9. Decisions (reviewed 2026-10-15)

1. **Keep `partial`.** Partly-supported answers are where real questionnaires go wrong.
2. **Several citations per claim, judged together** (section 5).
3. **The n8n pages are not committed.** They are n8n's content. The repo holds the URL list
   (`kb/SOURCES.tsv`) and `scripts/fetch-kb.mjs`, which downloads them again. Results record the
   download date, because the live docs change.
