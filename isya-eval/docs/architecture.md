# Isya Companion — Architecture Note

One page. Covers how the grader works, where it failed, and the design change the eval produced.

## System

```
Discord member
   │  /grade  + tooltip screenshot
   ▼
Bot Worker  (Cloudflare Worker)
   │  • verifies Discord's ed25519 signature
   │  • fetches the image, detects real MIME from magic bytes, base64-encodes
   ▼
Parser Worker  (Cloudflare Worker)
   │  • one Claude API call (vision) → item JSON
   ▼
Bot Worker
   │  • grading core: score each rolled stat against a per-level maximum
   │  • build the embed, reply in channel
   ▼
Supabase (Postgres)
      discord_grades — grade, percentage, power score, raw parser output
```

Deployment is manual paste into the Cloudflare dashboard; there is no CI. Secrets live as Worker
secrets, not in the repository.

## The two jobs inside one API call

The original parser prompt (~8,500 tokens) asked the model to do two different kinds of work in a
single pass:

| Kind of work | Example | Can code do it? |
|---|---|---|
| **Perception** — read what is printed | the item name's rendered colour; the characters `Dmg : (+283)` | No. Needs vision. |
| **Classification** — decide what it means | is `283` a base value or a rolled value? | **Yes.** It's punctuation. |

Conflating the two is what broke. The model performed the perception flawlessly — in 96 measured
runs it never misread a number — and then got the classification wrong 66% of the time, writing a
correctly-read value into the wrong output array, where it was silently excluded from scoring.

Making the instruction louder made it worse (see README, arm B). The instruction was already there
and already correct.

## The change

Split the two kinds of work along the line above, keeping a single API call:

```
Parser Worker
  │
  ├─ model  → { rarity (colour), itemType, classLine, level, setTag,
  │             statLines: [ "Dmg : (+283)", "Def: 2852(+6816)", … ] }   ← verbatim, no interpretation
  │
  └─ code   → for each line, by punctuation alone:
               "(+N)"        with no tilde, no preceding number  → roll = N
               "X(+N)"                                           → base = X, roll = N
               "X (+0~M)"                                        → base = X, roll hidden
               "X"                                               → base = X
```

The model is explicitly instructed **not** to decide what anything means. The misroute stops being a
behaviour we discourage and becomes a state the system cannot represent.

Consequences:

- Stat-line capture 34% → 100% on the eval set.
- Prompt for the stat portion drops ~8,500 → ~400 tokens; cost per scan $0.029 → $0.0065.
- Most of the prompt's rule text (roll rules, fixed-stat rules, the verification checklist, most
  worked examples) is deleted — it becomes ~40 lines of testable code with unit tests that cost
  nothing to run.

## What must stay with the model

Only genuine perception: rarity from rendered text colour, item-type keywords, the class line,
`Block Rate` detection, and the set tag. These cannot be derived from punctuation.

## Data model note

`discord_grades.raw_json` was both the parser's output *and* the admin correction target — `/fixstat`
read it, modified it, and wrote it back, destroying the original. Corrections are the only source of
ground-truth labels, so the system was deleting its own training data. Schema now separates
`parser_raw_json` (write-once) from the corrected working copy, with `corrected_by` / `corrected_at`
for provenance.

## Known gaps

- Eval covers one item class (level-145 enhanced armor). Rings are the most-graded slot and are
  untested.
- Screenshot links are Discord CDN URLs, which expire; images older than ~3 weeks are unrecoverable.
  Fix is a Supabase Storage bucket plus an `image_path` column (column added, worker change pending).
- No automated deploy and no regression test on deploy.
