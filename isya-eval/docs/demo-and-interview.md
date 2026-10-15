# Demo Script & Interview Walkthrough

## Part 1 — Demo video script (~3 minutes)

**[0:00–0:20] The thing itself**
Screen: Discord. Run `/grade` with a gear screenshot. The bot replies with a card — letter grade,
percentage, stat-by-stat bars.
Say: *"This is a Discord bot I built for a game community of about 177 people. You screenshot a
piece of gear, it reads the stats with a vision model, scores each one against the best possible
roll for that item's level, and gives you a grade. 27 people have used it, 120 items graded."*

**[0:20–0:50] The problem**
Screen: a tooltip with `Dmg : (+283)` highlighted, beside the bot's card with no Damage line.
Say: *"An admin told me Damage was missing from the last few grades. The obvious guess is the model
misread the screenshot. That guess was wrong, and I want to show how I found out."*

**[0:50–1:40] The measurement**
Screen: `ground_truth.json`, then the eval script running, then the results table.
Say: *"I hand-labelled six real tooltips as ground truth, then ran each one through the live prompt
ten times — because if a bug only shows up half the time, testing once tells you nothing. Baseline:
the Damage roll was captured correctly **34%** of the time. Across every rolled stat, 71%. Three of
the six items failed every single run."*

**[1:40–2:10] The wrong fix**
Screen: the one-line prompt diff; the arm-B result.
Say: *"The prompt already had a correct rule for this case, marked CRITICAL. I thought it was being
drowned out, so I strengthened the surrounding instruction. It got **worse** — 34 down to 24%. You
can't fix an instruction-following failure by writing a louder instruction."*

**[2:10–2:50] The right fix**
Screen: the split — model transcribes, code classifies. Then the 100% result.
Say: *"The model was never misreading. In 96 runs it got every number right, then filed it in the
wrong field. So I took that decision away from it: the model transcribes the line exactly as printed,
and ordinary code decides what the punctuation means. **100% — sixty out of sixty**, including the
three items that had never once worked. And because the prompt shrank from 8,500 tokens to 400,
it's about four times cheaper per scan."*

**[2:50–3:00] Honest close**
Say: *"Six items, one gear class — it isn't proven on weapons or jewelry yet, and that's the next
step before it ships."*

---

## Part 2 — Interview walkthrough (say this out loud)

**If asked "tell me about a project":**

> I built a Discord bot that grades video-game gear from a screenshot — a vision model reads the
> item, and it scores each stat against the best possible roll. About 27 people used it, 120 items.
>
> The interesting part isn't the bot, it's that I measured it. Someone reported a stat going missing,
> and instead of guessing at the prompt I built a small eval: six real screenshots hand-labelled as
> ground truth, each run ten times, because the bug turned out to be intermittent on some items and
> total on others — one run per item would have told me nothing.
>
> The baseline was 34%. The feature was wrong about two times in three, and nobody noticed, because
> a wrong answer still looks like a confident letter grade.
>
> Then the useful part: the model was never misreading anything. Across 96 runs it read every number
> correctly and then wrote it into the wrong field, where it got silently dropped from scoring. So
> it wasn't a perception problem, it was a classification problem — and classification by punctuation
> is something ordinary code can do perfectly. I split the job: the model transcribes the line exactly
> as printed, code decides what it means. That went to 100%, and cut cost about 4× because most of the
> prompt could be deleted.
>
> I also tried the obvious fix first — making the instruction stronger — and it made things slightly
> worse. I kept that in the writeup, because "we tried the obvious thing and measured it failing" is
> the part that usually goes missing.

**Three follow-ups you should have ready:**

*"How do you know it's actually better and not noise?"*
> Sixty out of sixty against sixteen out of forty-seven — that's not a close call. For the arm that
> failed, 34 versus 24% on about 45 samples each is roughly one standard error, so I reported it as
> "no evidence of improvement," not as a regression. I didn't want to claim a result the sample
> couldn't support in either direction.

*"What are the limits?"*
> Six items, all one gear class — level-145 armour. Rings are actually the most-graded item type and
> they're completely untested. There's also a confound: in all six screenshots the Damage line sits
> directly above an unusual highlighted row, so I can't yet separate "Damage is mishandled" from
> "whatever sits above that row is mishandled." I wouldn't ship it to everyone on this evidence.

*"What did you find that you weren't looking for?"*
> The correction command was overwriting the original parser output with the corrected values. So the
> one source of ground-truth labels was destroying itself every time an admin fixed something —
> about 23 of 120 rows are contaminated. I changed the schema so the original is written once and
> corrections are recorded separately with who and when. That turns corrections into a labelled
> dataset instead of a data-loss event.

**Two things to avoid saying:**
- Don't call it "fixed in production." It is measured, not deployed.
- Don't round 34% to "about a third of the time it worked" and leave it there — the specific number,
  the sample size, and the stated limits are the part that signals you actually measured something.
