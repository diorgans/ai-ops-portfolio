# Interview walkthrough

## The two-minute version (say it out loud)

"I built an assistant that drafts answers to customer questionnaires from a company's
documentation, with a citation for every claim and a person approving before anything is sent. I
used n8n's public docs as the knowledge base.

The question I cared about wasn't 'are the answers good'. It was 'does it make things up when the
docs don't cover the question', because a confident wrong answer on a security questionnaire is
the expensive failure.

I wrote the scoring rules first, turned them into tested code, and labelled 60 questions by hand.
About a third can't be fully answered from the docs. For some of those, the true answer exists on
other n8n pages, so if the model answered from memory, I'd catch it.

The surprise: Claude almost never made things up, as long as the answer format had a place to
write 'not covered'. When I removed that place and asked forced Yes/No questions, it started
guessing from nearby text, with real quotes that didn't actually support the conclusion. An
automatic citation check can't catch that; I had to build a blind human review to measure it.
Without the slot, 36% of claims were fully supported by their quotes; with the final design, 68%.

So the final design is: the docs in the prompt, a structured answer with a 'not covered' list, a
small code check that drops any quote that isn't on the page, and a human reviewer. It cost $3.40
in API calls for every run combined."

## Questions you'll probably get

**Why not use retrieval (RAG)?**
"The 21 pages fit in one prompt, so I left retrieval out on purpose. Retrieval adds its own failure,
the right page never reaching the model, and I wanted to measure one failure at a time. It's the
obvious next step for a bigger knowledge base."

**How do you know your labels are right?**
"I reviewed every label in a page built for it. Each point had to be backed by a quote, and 'true
but not in the docs' counted as not supported. In two rounds I flagged 10 questions; every one
turned out to be a quote cut too short, not a wrong fact. I'm not an n8n expert, which I say in
the README, and I backed the 'not in the docs' labels with a keyword search."

**The model scored 0% overclaim even without an instruction to refuse. Doesn't that make the
project pointless?**
"It made the first version of my test pointless, and I report that. It's why I ran the format
experiment and wrote harder questions. The finding is that the safety comes from the answer
format, which is something you can design and keep, not luck."

**Why Sonnet and not the biggest model?**
"My previous project measured Sonnet matching Opus on a judgment task at a third of the cost. I
kept the model fixed so the experiments only changed one thing at a time."

**What would you do next?**
"Three things: have someone review the final system's claims on the answerable questions, since I
only reviewed the risky ones; try a larger knowledge base with retrieval; and test the subtle case
that got past everything, a conclusion drawn from what a page leaves out."

**"Isn't 68% citation validity bad?"**
"It's the most uncomfortable number in the project, and it's the one I'd lead with anyway. Two
things make it readable. First, the comparison: the same reviewer, blind, scored the no-decline
format at 36%, so the design change nearly doubled it. Second, the kind of failure changed. The
forced format's failures were wrong conclusions — it decided the quota counts error-workflow runs
when the docs never say so. The final system's failures are embellishments: it claims the Loop Over
Items node and a Batch Size setting from a quote that describes batching without naming either. One
misleads a reviewer; the other wastes ten seconds of their time.

I also checked whether the rate was just an artifact of the hard questions, and it isn't — 67.9%
where the docs fall short, 71.0% where they fully answer, which is a third of a standard error
apart. It's how the system writes, not what it was asked. That's why a human approval step is in the design rather than something I'd remove once
the numbers looked good."

**What didn't work?**
"My first question set was too easy. My keyword baseline exposed a bias in how I'd written the
near-miss questions. And the first version of my code check threw out three true claims because
it was too strict about short quotes; I fixed it and disclosed that I changed it after seeing
results."

## Numbers to remember

- 60 questions, 21 pages, about 36k tokens per request
- Overclaim rate: 0% for the final system, 100% for always-answer, 23% for keyword match
- Keyword match wrongly refuses 64% of answerable questions; the final system 0%
- Citation validity: 36% without the not-covered slot, 68% with the final design (both on the
  risky questions, blind, same reviewer); the final system is 70% across all 97 of its cited claims
- 4 invalid answers fixed to 0 by the code check
- $3.40 total API cost
