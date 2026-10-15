# Demo Script & Interview Walkthrough

## Part 1 — Demo video script (~3 minutes)

Record with n8n open and **Test workflow** running, so nodes light up as data flows. That animation
does the explaining for you.

**[0:00–0:20] The problem**
Screen: the n8n canvas, five nodes.
Say: *"Inbound sales enquiries arrive as free text. Someone has to read each one and decide whether
it's worth a salesperson's time. This pipeline does that triage automatically — and more
importantly, I can tell you how accurate it is."*

**[0:20–0:50] One lead through the system**
Run `test-webhook.ps1`, send L01 — the VP.
Say: *"A VP of Customer Experience, 60 agents, a deadline three weeks out. Claude reads it and
returns seven structured facts. Then "* — point at the Code node — *"code applies the scoring rules
and assigns a tier. It comes back A, with the quote that justified it."*
Show the HubSpot contact appearing with **Lead Triage Tier = A**.

**[0:50–1:20] The same company, the opposite answer**
Send L04.
Say: *"Same company. Also a support professional. But read what he actually wants —"* highlight
*"I saw you're hiring"* — *"he's asking for a job. The system returns D. The company is an ideal
customer; this person is not a buyer. That distinction is the whole problem, and it's the one a
keyword filter gets wrong."*

**[1:20–2:10] How I know it works**
Screen: `docs/RUBRIC.md`, then the results table.
Say: *"I wrote the scoring rubric first, generated 50 synthetic leads, and hand-labelled all 50
before writing any extraction code — so the system was built against a fixed target rather than me
adjusting the target to flatter it. The baseline, always guessing the most common tier, is 36%.
This scores **82.7%**, and catches **24 out of 24** disqualifiers with no false positives."*

**[2:10–2:45] The finding**
Screen: the two-arm comparison.
Say: *"I tested two designs. One where Claude assigns the tier itself: 71%. One where Claude only
reports facts and code applies the rules: 83%. The gap isn't extraction — both read the message
equally well. It's that the model follows a single explicit rule perfectly and multi-step rules
badly. It was rounding hard disqualifications up to a softer tier. So the rule-following moved into
code, where it's deterministic and unit-tested."*

**[2:45–3:00] Cost and honesty**
Say: *"I also checked whether it needed the expensive model. Sonnet matched Opus at a third the
cost per lead, so that's what ships. Four-tenths of a cent per lead. Fifty leads, one domain,
synthetic data — enough to find a real design flaw, not enough to certify it for live traffic."*

---

## Part 2 — Interview walkthrough (say this out loud)

**"Tell me about a project."**

> I built a lead-triage pipeline — inbound sales enquiries come in as free text, Claude extracts
> structured facts, scoring rules assign a priority tier, and it writes to HubSpot through n8n.
>
> The part I'd actually want to talk about is that I measured it. I wrote the scoring rubric and
> hand-labelled fifty leads *before* writing any extraction code, so I couldn't quietly move the
> target to match whatever the system did. The naive baseline — always guess the most common tier —
> is 36%. The system scores 83%.
>
> The interesting result came from testing two designs. In one, Claude assigns the tier itself: 71%.
> In the other, Claude only reports seven facts and ordinary code applies the rules: 83%. Both read
> the message equally well, so it wasn't an extraction problem.
>
> When I broke down the errors, the model applied a single absolute rule — "a disqualified lead is
> always the lowest tier" — perfectly, 24 out of 24. But the rules that needed a table lookup, then
> a conditional adjustment, then a cap, it got wrong 24 times out of 30. It was rounding hard
> disqualifications up to a softer tier, which in a sales queue is the expensive direction.
>
> So the design principle is: use the model for perception and judgment, use code for bookkeeping.
> The rubric is executable — the same implementation drives the labelling tool, the eval, and the
> production workflow, so the deployed thing can't drift from the measured thing.

**Follow-ups to have ready:**

*"How do you know the labels are right?"*
> I don't entirely, and that's a real limitation. One labeller, so there's no inter-rater agreement
> figure. I did a QA pass and found three labels where the category didn't match its own definition
> — one lead said "we're evaluating three vendors" and got labelled as a vendor pitch, when she was
> actually a buyer. Those mattered because disqualifier recall is a headline metric, and scoring the
> model against a definition the labels didn't follow would have reported a labelling problem as a
> model failure. Some remaining errors are genuine wording ambiguity, not model mistakes.

*"Why not use the best model?"*
> I checked. Sonnet scored 86% against Opus's 83% — about 0.6 standard errors, so statistically
> indistinguishable — at a third of the cost per lead. Disqualifier recall stayed perfect on both.
> The honest claim is "no measurable difference at a third the price", not "the cheap one is
> better." At a thousand leads a month that's four dollars versus eleven-fifty.

*"What would you do differently?"*
> Three things. I ran three passes per configuration when one would have given the same answer —
> that was caution carried over from a previous project where the bug was genuinely intermittent,
> and it cost three times as much for no extra information. Second, I'd get a second labeller.
> Third, the rubric has a gap I found through the eval: a strong-fit prospect who just signed with a
> competitor falls to the lowest tier because there's no "nurture" category. That's a rubric bug the
> measurement surfaced, not a model bug.

*"What broke along the way?"*
> The useful one: my rubric contradicted itself. It stated that the top tier requires a director or
> above, but a budget-signal modifier let a manager reach it anyway. I only found that because I'd
> made the rubric executable and written tests for it — reading the prose hadn't caught it. That's
> the argument for treating a scoring definition as code rather than a document.

**Avoid saying:**
- "It's 83% accurate" without the baseline. 83% means nothing until you say 36% is the floor.
- "It works." Say what was measured, on how many examples, and what that doesn't cover.
