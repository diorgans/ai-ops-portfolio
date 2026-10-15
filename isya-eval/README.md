# Isya Companion — Measurement & Accuracy Eval

A Discord bot that grades Fiesta Online gear from a screenshot. A member runs `/grade` with a
tooltip image; a vision model reads the item's stats; the bot scores each rolled stat against a
database of per-level maximums and replies with a letter grade.

This repository documents **measuring whether that grader is actually correct**, and what the
measurement found.

**Status:** eval complete, fix deployed to production 2026-10-12 and verified on a live grade.

---

## TL;DR

| Metric | Result |
|---|---|
| Stat-line capture (`Dmg` roll, production prompt) | **34%** (16/47) |
| All-roll recall (production prompt) | **71.5%** (123/172) |
| Stat-line capture (two-step parser) | **100%** (60/60) |
| All-roll recall (two-step parser) | **100%** (220/220) |
| Cost per scan, before → after | **$0.029 → $0.0065** (~4× cheaper) |
| Grades that produced a meaningless 0% score | **13 of 120** (11%) |

The headline: a feature that looked like it worked was returning the wrong answer **roughly two
times in three** on the item class it was most used for, and nobody could tell, because the output
was a plausible-looking letter grade either way.

---

## 1. Usage reporting

Aggregates only. No member identifiers appear in this repository.

| | |
|---|---|
| Grades recorded | 120 |
| Unique graders | 27 (of ~177 community members — **15% adoption**) |
| Period | 2026-08-03 → 2026-10-06 |
| Mean volume | 13.1 grades/week |

**Weekly volume**

| Week of | Grades | Active graders |
|---|---|---|
| Aug 03 | 47 | 14 |
| Aug 10 | 29 | 11 |
| Aug 17 | 15 | 5 |
| Aug 24 | 8 | 4 |
| Aug 31 | 3 | 3 |
| Sep 14 | 8 | 5 |
| Sep 28 | 2 | 2 |
| Oct 05 | 8 | 2 |

Usage fell **83% from launch week to the most recent full week**, with two weeks of zero activity.
Launch novelty explains some of this. It is worth noting alongside the accuracy findings below,
but this data cannot establish that one caused the other.

**What gets graded**

- By slot: ring 34, weapon 22, armor 15, pants 12, helmet 11, boots 9, shield 6, necklace 6, earring 5
- By rarity: blueSet 61, blue 29, yellow 23, green 5, orange 2
- By stat system: combat-stat (S2) 81, primary-stat (S1) 39
- Enhanced items: 54 of 120

**Quality signals visible without any eval**

- **13 of 120 grades (11%) scored 0%** — the grader returned a letter grade derived from no usable data.
- 2 rows parsed with no rolled stats at all.
- 36 of 120 used the manual rarity override, and 8 needed an admin correction afterwards — i.e.
  **automatic rarity detection was distrusted or wrong often enough that a manual override was built
  and then used on 30% of grades.**

---

## 2. Accuracy eval

### Method

- **Eval set:** 6 item tooltips, hand-transcribed to ground truth from the original screenshots
  (level-145 enhanced `blueSet` armor: 2 helmets, 2 body armor, 1 pants, 1 boots).
- **Model:** `claude-sonnet-4-6` — the model the production parser uses, held constant across arms
  so the prompt is the only variable.
- **Runs:** 8 per item per arm for the single-step arms, 10 per item for the two-step arm.
  Repeated runs matter: the failure is **stochastic on some items and deterministic on others**,
  so a single run per item cannot distinguish a fix from luck.
- **Primary metric:** did the item's `Dmg` roll land in the `stats` array with the correct value.
- **Secondary metric:** all-roll recall — across every stat line carrying a real roll, how many were
  captured with the right value.

### Results

| Arm | Dmg roll correct | All-roll recall | Cost/scan |
|---|---|---|---|
| A — production prompt (baseline) | 16/47 — **34%** | 123/172 — 71.5% | $0.029 |
| B — baseline + Dmg named in the verification checklist | 11/45 — **24%** | 106/164 — 64.6% | $0.029 |
| C — two-step: transcribe, then structure in code | 60/60 — **100%** | 220/220 — 100% | $0.0065 |

Per item, primary metric:

| Item | Arm A | Arm C |
|---|---|---|
| Egnis Fortitude Helmet | 5/7 | 10/10 |
| Egnis Fortitude Armor | 5/8 | 10/10 |
| Egnis Fortitude Boots | **0/8** | 10/10 |
| Mutocoatl Helmet | 6/8 | 10/10 |
| Mutocoatl Armor | **0/8** | 10/10 |
| Mutocoatl Pants | **0/8** | 10/10 |

### What the failure actually was

Not a misread. **In all 96 single-step runs the number was read correctly every time** — 283, 309,
320, 377, 453, 548 all exact. The value was then written to the wrong array: `fixedStats` (a fixed
base value) instead of `stats` (a rolled value that gets scored). Because only `stats` is graded,
a correctly-read number scored as if it did not exist.

One item showed a second mode: `Def`'s enhancement value (`7276`) bound to the name `Dmg`, i.e. the
right number on the wrong stat.

### Arm B: a negative result worth keeping

The prompt already contained an explicit, correct rule for this exact case, marked CRITICAL:

> `"Dmg: (+220)" -> stats Dmg value=220` … *a bare no-tilde `(+N)` always belongs in stats, never in fixedStats.*

So this was never a missing instruction. The hypothesis for Arm B was that the rule was losing to
competing emphasis elsewhere in the prompt — a separate verification step named `Aim` and `MaxHP`
as the stats to double-check, and `Aim` succeeded where `Dmg` failed despite both appearing in the
same prohibition list.

Adding `Dmg` to that list made results **worse** (34% → 24%, within noise, but with no sign of
improvement). Writing a louder instruction did not fix an instruction-following failure.

### Arm C: why it works

The failure was a classification decision made by a model that had already done the hard part
correctly. So the classification was moved out of the model:

1. **Model** transcribes each stat line verbatim — `"Dmg : (+283)"` — and is explicitly told not to
   decide what anything means.
2. **Code** applies the base/roll/range rules by punctuation alone: a bare `(+N)` with no tilde and
   no preceding number is a roll, every time, deterministically.

A misroute becomes structurally impossible rather than discouraged. The transcription step proved
byte-exact across all 60 runs. As a side effect the prompt shrinks from ~8,500 tokens to ~400 for
the stat portion, which is where the 4× cost reduction comes from.

### Limits of this result

- **6 items, one item class.** All level-145 enhanced `blueSet` armor. The two-step rules handle
  weapon damage ranges and hidden `(+0~MAX)` ranges in unit tests, but no real weapon, ring,
  necklace, omamori, or primary-stat item has been run through the harness. Rings are the single
  most-graded slot (34 of 120) and are **untested**.
- **A confound.** In all six tooltips `Dmg` sits directly above the enhanced `Def` line, so this set
  cannot separate "Dmg is mishandled" from "whatever sits above the enhanced line is mishandled".
- **One model judgment remains** in arm C — whether a line is rendered in a distinct colour, used to
  flag enhancement. It failed on 1 of 6 items (0/10 runs). Downstream an existing anomaly guard
  catches the consequence, so grading is unaffected; the cleaner fix is to drop the colour judgment
  entirely and rely on that guard.
- Eval cost to produce these numbers: **~$4.22** total.

---

### Production validation

The two-step parser was deployed on 2026-10-12. The same weapon screenshot, graded before and
after, 22 minutes apart — recorded in `discord_grades`, not reconstructed:

| time (UTC) | version | statSystem | rolls captured | result |
|---|---|---|---|---|
| 23:28:31 | v1 | 1 | `STR 32` | F · 0% |
| 23:29:15 | v1 | 1 | `Dmg 564` | F · 0% |
| 23:51:30 | **v2** | **2** | `Dmg 564, Aim 32, Evasion 279` | **C · 60% · power 496** |

The first v1 attempt recorded `STR = 32`; **32 is the Aim roll**, bound to the wrong stat name. The
second read `Dmg` correctly and still scored zero, because once the item was classified System 1 the
grading core discarded every combat stat. Two runs, two different wrong answers, both unusable.

The v2 grade checks out arithmetically against the gear database rather than merely being non-zero:
`Dmg 564/607 = 92.9%`, `Aim 32/384 = 8.3%`, `Evasion 279/348 = 80.2%` → mean 60.5% → **C**.
Power score `(140/145 × 700 × 1.0) + 150 = 825.9`, `× 0.60 = 496` — matches the stored value exactly.

---

## 3. Data-integrity findings

Found during recon, independent of the accuracy work:

- **Admin corrections overwrote the original parser output.** The `/fixstat` command wrote corrected
  values back into the same `raw_json` column it read from, destroying the record of what the parser
  actually produced. A stat-only correction left **no marker at all**.
- **23 of 120 rows carry the fingerprint of a silent correction** (a stat present in both `stats` and
  `fixedStats` with an identical value). Confirmed against ground truth on three items the admin had
  hand-fixed. Those rows cannot be used as parser-accuracy evidence.
- **`/fixstat` never updated the `rarity` column** when correcting rarity — it updated `raw_json` and
  recomputed the grade, leaving the column stale and disagreeing with the grade derived from it.
  8 rows affected; resynced.
- Schema since extended with `parser_raw_json`, `corrected_by`, `corrected_at`, `image_path` so that
  corrections become labelled training data instead of destroying it. **The worker changes that
  populate these columns are not yet written.**

---

## 4. Status and what remains

**Shipped (2026-10-12)** — the two-step parser (`discord-bot/parser-worker-v2.js`), replacing v1 in
place. One API call, ~2,000-token prompt, all base/roll/range/statSystem logic in code with unit
tests. Verified on a live grade (above). Rollback is a Cloudflare deployment rollback or re-pasting
`discord-bot/parser-worker.js`.

**Still open:**

1. **Untested item classes.** No real screenshot has been run for omamori, shield, necklace, earring,
   or a genuine System 1 item (one whose *primary* stats roll). Those paths are implemented and unit
   tested, but unit tests are not evidence about live tooltips. Each costs about 2 cents to validate.
2. **The jewelry 0% bug is unrelated and unfixed.** Of the 0%-scoring rows, roughly 4 were the
   statSystem misclassification this change fixes; **8 were rings whose rolls parsed correctly and
   still scored zero** — a failure in the gear-database max lookup, not in parsing. Different bug,
   needs its own investigation.
3. **Correction provenance.** `parser_raw_json`, `corrected_by`, `corrected_at` and `image_path`
   columns exist but nothing writes them yet; `/fixstat` still overwrites the original parser output.
   Until that worker change lands, every admin correction destroys a ground-truth label.
4. **Image persistence.** Screenshot links are Discord CDN URLs and expire — verified by fetching
   three stored links from August, all 404. Needs a Supabase Storage bucket writing to `image_path`.
5. **Re-measure** the full eval set against v2 in production and publish the updated numbers here.

---

## Repository contents

| Path | What it is |
|---|---|
| `discord-bot/bot-worker.js` | Cloudflare Worker — Discord interactions, grading, auctions, vouches |
| `discord-bot/grading-core.js` | Scoring maths and the per-level stat-maximum database |
| `discord-bot/parser-worker.js` | Cloudflare Worker — vision parse of the tooltip screenshot |
| `discord-bot/register-commands.js` | Slash-command registration |

Stack: Cloudflare Workers, Supabase (Postgres), Claude API. No member identifiers, tokens, or keys
are committed.

---

## A note on what is not in this repository

`discord-bot/bot-worker.js` — the deployed Discord worker — is **deliberately not published**. It
contains hardcoded guild, channel, role and category identifiers for a private community server,
and publishing those is not something a server's members consented to.

What that file contains is Discord interaction plumbing: slash-command routing, signature
verification, embed building, and an auction and reputation system specific to the game. None of it
is the interesting part of this project.

Everything the project is actually about is here:

- `discord-bot/parser-worker.js` — the original single-step parser, measured at **34%**
- `discord-bot/parser-worker-v2.js` — the two-step rewrite, measured at **100%**
- `discord-bot/grading-core.js` — the scoring maths and the per-level stat database
- `README.md`, `docs/` — the eval method, the results, and what the numbers do not cover
