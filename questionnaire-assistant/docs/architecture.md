# Architecture (one page)

```
question ──► Claude Sonnet 5 ──► structured answer ──► code check ──► human reviewer
             system prompt:        {status,            drop quotes not      approves, edits,
             grounding rules       claims[{text,        on the cited page;   or sends back
             + all 21 doc pages    citations[{page,     drop claims left
             (cached, ~36k tok)    quote}]}],           with no quote;
                                   not_covered[]}       recompute status
```

**1. Knowledge base in the prompt, not retrieved.** The 21 pages total about 36k tokens after
stripping link URLs and HTML. That fits in one prompt, so there is no retrieval step that can miss
the right page, and every answer sees every page. Prompt caching makes repeat questions cost about a
tenth of the first. A larger knowledge base would need retrieval, which adds a new failure mode
(the right page is never shown) that this design deliberately avoids measuring yet.

**2. Structured output with a slot for "not covered".** The answer is JSON, enforced by the API's
structured outputs, so it always parses. The schema has three parts: a status, a list of claims each
with page-and-quote citations, and a list of parts the documentation does not cover. The
measurements show the `not_covered` slot is the single most important design choice: with it, the
model parks what it doesn't know; without it, it guesses from neighbouring text.

**3. Grounding rules in the prompt.** Six rules: claim only what a page states; answer only what
was asked; quote at least a full sentence; list every uncovered part; answer Yes/No only when a page
states it; don't accept a question's assumptions.

**4. Code check after the model.** The model is used for judgment (what answers the question,
what is covered); code does the bookkeeping it is unreliable at. The check removes any quote that
is not on the cited page, removes claims left with no quote, turns removed claims into
"could not verify" entries, and recomputes the status from the lists. It is 20 lines with its own
unit tests (`scripts/postcheck.mjs`).

**5. Human approval.** The reviewer sees each claim with its quote, plus the not-covered list as a
to-do list of what to answer by hand or leave out. The code check can only prove a quote exists; a
person judges whether it supports the claim. The measurements show that judgment is where the
remaining risk sits.

**Settings.** Claude Sonnet 5, thinking off, max 4,000 output tokens. About $0.012 per question
with caching ($0.69 for all 60).

**What it deliberately doesn't do.** No retrieval, no multi-turn clarification, no automatic
sending. Every answer goes through a person.
