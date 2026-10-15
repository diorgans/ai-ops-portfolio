export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    try {
      const { imageBase64, mimeType } = await request.json();

      const prompt = `You are reading an item tooltip screenshot from Fiesta Online, a fantasy MMO. Your job is to extract item data and return it as raw JSON with no markdown, no explanation, no preamble.

STEP 1 - READ THE IMAGE

Read ALL visible text carefully:
- Item name (and its TEXT COLOR - this determines rarity)
- Required Level
- Item Level (enhancement tier, NOT rarity)
- All stat lines

RARITY = color of the item name text at the very top of the tooltip. Judge ONLY the actual rendered pixel color of that text — never anything else.
- Bright lime/neon green, no blue tint at all -> "green"
- Any cyan/blue tint at all, even faint or washed-out -> "blue". Light blue can look almost colorless on dark backgrounds or in a compressed screenshot — this is the single most commonly misread rarity. DEFAULT BIAS: if you are genuinely torn between blue and green, the correct answer is blue, not green. Only classify as green if the text is unambiguously lime/neon green or truly colorless white/gray with zero cool tint.
- Cyan/blue text AND a set tag/bonus present -> "blueSet" (the set tag ONLY upgrades blue to blueSet — it never changes yellow, orange, or green)
- Gold/amber/yellow -> "yellow" (stays yellow even with a set tag present — text color always wins over the tag)
- Red-orange -> "orange". EXCEPTION: armor slots (helmet, body armor, pants, boots) can NEVER be orange in this game — that combination doesn't exist. If you're leaning orange on an armor piece, you are almost certainly misreading blue; re-examine and pick from green/blue/blueSet/yellow instead.
- Purple/pink -> "pink"

Two things that are NOT rarity signals, no matter how it looks: (1) a color word appearing inside the item's own name as flavor text (e.g. an item literally titled "Fragment of Doom (Blue)" whose real tooltip color was yellow — the word is coincidental, ignore it entirely), and (2) the screenshot's background scenery behind the tooltip box (textured floors, other UI, colored scenery bleeding through) — judge only the name text's own pixels, nothing around or behind it.

Use Item Level as a secondary hint ONLY for jewelry when color is ambiguous:
  Jewelry: Item Level 1=green, 2=blue, 3=yellow, 4-5=orange, 6-7=blueSet/orange
  Weapons and armor: ignore Item Level for rarity — use text color only.
  Item Level 99 = orange for any item type.

WEAPON PRIMARY STAT FORMAT — stats with both a fixed base and a roll:
  "STR +24 (+27)"  -> base=24 (fixedStats STR=24) AND roll=27 (stats STR value=27, max=0). BOTH.
  "END (+25)"      -> roll only, value=25, max=0. Stats array only.
  "SPR (+24)"      -> roll only, value=24, max=0. Stats array only.
CRITICAL: "STR +24 (+27)" — the 24 is OUTSIDE parens = fixed base. The 27 is INSIDE parens = rolled value. Never confuse these. The rolled value is ALWAYS the number inside the parentheses.
This is statSystem=1. DEX and INT may not appear if they rolled 0 — that is normal.

ITEM TYPE from tooltip text:
- If tooltip shows a "Weapon Type:" line -> ALWAYS "weapon", regardless of item name
- "Hat", "Helmet", "Robber Hat", "Hood", "Cap" in item name -> "helmet"
- "Top", "Armor", "Plate", "Robe", "Coat" in item name -> "armor"
- "Pants", "Leggings", "Shorts" in item name -> "pants"
- "Boots", "Shoes", "Sandals", "Greaves" in item name -> "boots"
- "Shield", "Buckler" in item name -> "shield"
- If tooltip contains "Block Rate" anywhere (e.g. "Block Rate: 7%") -> ALWAYS "shield", regardless of item name. Block Rate is the definitive shield indicator in Fiesta Online — shields have unpredictable names so this field is the only reliable signal.
- "Ring" in item name BUT no "Weapon Type:" line -> "ring"
- "Earring" in item name -> "earring"
- "Necklace", "Pendant" in item name -> "necklace"
- "Bracelet", "Bangle" in item name -> "bracelet"
- "Omamori" in item name (e.g. "Amethyst Omamori", "Ruby Omamori") -> "omamori". This is a completely separate gear category (Talisman) from rings/necklaces/etc — do NOT classify it as jewelry. Omamori are ALWAYS rarity "yellow" regardless of what color the name text actually renders as — this is a fixed game rule, not a color judgment call, so report rarity:"yellow" for any omamori even if the text looks green, blue, or any other color. The stat that shows a base number before its range (e.g. "M.Def: 1000 (+0~207)" or "Dmg: 400 (+0~203)") uses the same base+range armor-style format as regular armor — base goes to fixedStats, the range means value=0/max=0 in stats (max gets filled from the database downstream). The flat primary-stat bonus shown with no parentheses (e.g. "SPR +60", "STR +30") is always a fixedStat, never a roll.
CRITICAL: "Weapon Type:" line always wins. "Ring Claws", "Ring Blade", "Ring Sword" are weapons not rings.

SET TAG: If the tooltip shows a "[...Set]" tag anywhere (e.g. "[Fallen Angel Set]", "[Woes Set]"), include "setTag": true in your JSON output. CRITICAL: setTag only matters for BLUE/CYAN text items — for those it sets rarity to "blueSet". For YELLOW, ORANGE, or GREEN text items, still report the true color rarity (yellow/orange/green) even when setTag is true. Text color ALWAYS wins over the set tag.

STEP 2 - IDENTIFY THE STAT SYSTEM

System 1: STR/DEX/END/INT/SPR appear WITH PARENTHESES showing rolls e.g. "END (+8)" OR stacked "(+0~30)" ranges below primary stats
System 2: combat stats (MaxHP, Dmg, Def, M.Dmg, M.Def, Aim, Evasion) appear WITH PARENTHESES

A primary stat with NO parentheses e.g. "STR +55" is FIXED, not a System 1 indicator.
If an item shows BOTH "STR +55" (no parens) AND "MaxHP: +853 (+147)" (parens on combat stat) -> statSystem=2.
If an item shows stacked "(+0~30)" ranges below DEX/END/INT/SPR lines -> statSystem=1.
Only set statSystem=1 if primary stats (STR/DEX/END/INT/SPR) have parentheses OR stacked roll ranges.

JEWELRY EXCEPTION — CRITICAL: for rings, earrings, necklaces, and bracelets specifically, if primary stats (STR/DEX/END/INT/SPR) show parenthetical rolls, classify as statSystem=1 EVEN IF a combat stat (M.Dmg, M.Def, Aim, Evasion, etc.) also shows a small parenthetical roll alongside them. Low-level jewelry frequently has one or two minor combat-stat rolls layered on top of its main primary-stat rolls — this does NOT make it a combat-stat item. The System 2 database has no jewelry entries below level 120, so misclassifying an early-game ring/earring/necklace/bracelet as statSystem=2 always produces a false "no gradeable stats" result, even though the item parsed correctly. This exception applies ONLY to jewelry types — weapons and armor keep the normal rule above.

WHY jewelry shows a combat-stat roll at all: on jewelry, M.Def (or occasionally another combat stat) is the stat that increases from enhancement — the exact same mechanic as Def increasing when you enhance armor, or Dmg increasing when you enhance a weapon. It is not a "roll" in the graded sense at all; it is an enhancement byproduct. So for jewelry with an item name enhancement tag like "[+3]": report that stat in fixedStats using its TOTAL displayed value (base + the parenthetical amount added together, e.g. "M.Def: 30(+4)" -> fixedStats M.Def=34), NOT in the stats array, and do not let its presence affect statSystem classification (see the jewelry exception above). This mirrors how enhanced armor Def is handled — the enhancement-inflated number is reported as a fixed total, not graded as a roll.

STEP 3 - READ STAT ROLLS

SYSTEM 1 RULES:
- Stat WITH parentheses -> ROLLED. Put in stats array. value=number inside parens. max=0.
- Stat WITHOUT parentheses -> FIXED. Put in fixedStats only.
- Stacked "(+0~30)" ranges: match each range to the corresponding primary stat above it. value=0, max=0.
- "END (+8)" -> stats array, value=8, max=0
- "STR +8" -> fixedStats only, value=8
- "STR +8 (+6)" -> BOTH: fixedStats STR=8 AND stats array STR value=6, max=0
- "STR +24" followed by stacked ranges for other stats -> STR is FIXED (no range assigned to it), other stats are ROLLED
- Always set max=0 for all System 1 stats.
- NEVER put Dmg, Aim, or Evasion in the stats array for System 1 items — these are always fixedStats.
- MANDATORY CHECKLIST — DO NOT SKIP: read every primary stat line (STR, DEX, END, INT, SPR) one at a time and ask: does this line have a number in parentheses? Lines with a base AND a roll together, like "STR +14 (+12)", are the most commonly missed case — it's easy to record the base into fixedStats and then forget to ALSO add the roll to the stats array. Both parts are required whenever parentheses are present, even though the line also shows a fixed base before it. Do not finalize your answer until you've checked every primary stat line against this rule one more time.

SYSTEM 2 RULES:
Use EXACTLY these stat names: "MaxHP", "Dmg", "Def", "M.Dmg", "M.Def", "Aim", "Evasion", "Crit Rate", "Block-Crit Rate"
Always set max=0 for all System 2 stats.

CRITICAL: Read the actual rolled number from parentheses. NEVER return value=0 if a number is visible.
- "(+147)" -> value=147
- "(+222)" -> value=222
- "(+138)" -> value=138
- "(+0~225)" -> value=0 (nothing rolled)

Ring/jewelry format "StatName: +BASE (+ROLL)":
THE RULE: The number printed WITHOUT parentheses is the BASE (goes to fixedStats). The number printed WITH parentheses is the ROLL (goes to stats array).
- ONLY add a stat to the stats array if there are ACTUAL PARENTHESES on that line
- If NO parentheses -> fixedStats ONLY. Never invent a roll value.
- "MaxHP: +853 (+131)" -> The 853 has no parens = BASE = fixedStats. The 131 has parens = ROLL = stats value=131.
- "MaxSP: +839" -> 839 has no parens, no roll parens exist = fixedStats ONLY.
- "Dmg: 202 (+138)" -> 202 = BASE = fixedStats. 138 = ROLL = stats value=138.
- "Def: 342 (+200)" -> 342 = BASE = fixedStats. 200 = ROLL = stats value=200.
- "M.Dmg: 202 (+254)" -> 202 = BASE = fixedStats M.Dmg=202. 254 = ROLL = stats M.Dmg value=254. NOT the other way around.
- "M.Def: 342" -> 342 = BASE = fixedStats ONLY. No parens = no roll.
- "Aim: 249 (+92)" -> 249 = BASE = fixedStats. 92 = ROLL = stats value=92.
- "Evasion: 270" -> 270 = BASE = fixedStats ONLY.
- "Aim: +15%" -> fixedStats only
- "Evasion: +15%" -> fixedStats only
NEVER swap base and roll. The parenthesized value is ALWAYS the roll regardless of which number is larger.

Weapon format (System 2 weapons: wands, swords, bows, etc.):
- GOLDEN RULE FOR WEAPONS: a stat has a ROLL only if it shows a parenthetical "(+N)". If a stat shows ONLY a base range like "1911~2886" or "11608~17923" with NO parenthetical after it, it has NO ROLL — do NOT put it in the stats array and NEVER invent a roll number for it. Conversely, if a stat HAS a "(+N)", you MUST include that roll — never drop it. Read each stat line independently and check: is there a "(+N)"? If yes -> roll=N. If no -> no roll.
- MANDATORY CHECKLIST — DO NOT SKIP: weapons in this game almost always show SEVEN stat lines in this order: MaxHP, Dmg, Def, M.Dmg, M.Def, Aim, Evasion (some may be omitted if the item has no bonus on that line, but most weapons show all seven, or at minimum Dmg, Def, M.Dmg, and M.Def together). Before finalizing your JSON, go back and check EACH of these seven lines individually against your stats array: does it have a "(+N)"? If yes, is it already in your stats array? Def and M.Def are the two most frequently missed — they often sit visually between Dmg and M.Dmg and get skipped when scanning quickly. Do not finalize your answer until you have explicitly confirmed Def and M.Def one more time, even if you already think you're done.
- "MaxHP: (+430)" -> stats MaxHP value=430, max=0 (bare parenthetical roll, no base).
- WEAPON DAMAGE WITH BASE RANGE: weapon Dmg and M.Dmg often show a base damage RANGE like "1979~2989". This base range is NOT a roll and NOT enhancement — it is just the weapon's base damage spread.
  * "Dmg: 1979~2989 (+53)" -> the base range 1979~2989 goes to fixedStats Dmg (use the high end, 2989). The parenthetical "(+53)" is the ROLL: stats Dmg value=53, max=0. (Works with or without a space before the paren: "1979~2989(+53)" is the same.)
  * "M.Dmg: 12108~18573" -> base range ONLY, NO parenthetical = NO roll. fixedStats M.Dmg=18573 (high end). Do NOT put M.Dmg in the stats array at all (nothing rolled). NEVER invent a roll value for a stat that has no parenthetical.
  * CRITICAL: a base damage range like "12108~18573" with no parens is NOT enhanced and is NOT a roll. Only a parenthetical "(+N)" is a roll. The "~" inside a base range on a weapon is just the damage spread, unrelated to the armor "(+0~MAX)" range rule.
- "Aim: 3907 (+350)" -> base 3907 to fixedStats, roll 350 to stats Aim value=350, max=0. Do not drop the roll.
- "Def: (+0~918)" -> stats Def value=0, max=0 (bare range).
- "Def: 37(+8)" with NO SPACE before the paren -> fixedStats Def=37 only (this tight no-space format is an enhancement bonus, not a roll). NOTE: this ONLY applies when there is no space AND the base is small (under ~100). "Def: 3506 (+12)" WITH a space is a normal base+roll: fixedStats Def=3506, stats Def value=12.
- ARMOR NO-SPACE FORMAT EXCEPTION: On armor items (boots/helmet/pants/armor/shield), large base values with no-space parens like "Def: 2985(+458)" or "Evasion: 1117(+178)" are ALWAYS base+roll format regardless of spacing. The no-space-means-enhancement rule ONLY applies to weapons with small bases under 100. For armor, any "BASE(+ROLL)" where BASE is over 100 is always: fixedStats BASE, stats ROLL value=N, max=0. Never flag these as enhanced — they are normal rolls.
- ENHANCEMENT ON WEAPONS: weapons are NOT flagged enhanced just because they have large base damage numbers, or because the item name has a "[+N]" enhancement tag. Report every rolled stat's actual number plainly and accurately, even on heavily enhanced weapons — do not hide or omit a roll just because the item is enhanced or the number looks large. Do not output enhancedStats for weapons unless a stat genuinely shows the armor-style "(+0~MAX)" range form with a separate inflated base (rare on weapons, but treat it the same as armor if it occurs). Judging whether an individual roll is implausibly large for its level/rarity happens downstream, after your JSON is produced — that comparison needs the actual number you read, so it is more important that you report the true value accurately than that you guess at whether it's "real."

ARMOR BASE + RANGE FORMAT (System 2 armor: boots/helmet/pants/armor) — CRITICAL:
Armor stats show as "StatName: BASE (+0~MAX)" where BASE is the current total and (+0~MAX) is the roll range.
- The parenthetical "(+0~MAX)" is a RANGE, not a rolled value. A range means value=0 (the actual roll is NOT shown separately on armor).
- "Def: 3064 (+0~682)" -> stats Def value=0, max=0. The 3064 is the displayed total (base + any enhancement), NOT a roll. Do NOT put 3064 as the rolled value.
- "MaxHP: (+0~342)" -> stats MaxHP value=0, max=0.
- "Aim: 1100 (+0~281)" -> stats Aim value=0, max=0. NEVER put 1100 as the roll.
- "M.Def: 2966 (+0~400)" -> stats M.Def value=0, max=0.
- THE TILDE RULE (most important): what is inside the parens decides everything.
  * A RANGE has a tilde "~": "(+0~852)". A range means the roll is NOT shown (it is baked into the displayed base). value=0, max=0.
  * A SINGLE VALUE has no tilde: "(+12)". A single value IS the actual roll. Put it in the stats array as value=12, max=0.
- "M.Def: 3506 (+12)" -> stats M.Def value=12, max=0 (the +12 is the ROLL). Base 3506 goes to fixedStats M.Def=3506. NOT enhanced.
- "Aim: 1100 (+47)" -> stats Aim value=47, max=0. fixedStats Aim=1100.
- "Def: 3064 (+0~682)" -> RANGE (has ~). stats Def value=0, max=0. Roll is hidden. Add "Def" to enhancedStats. fixedStats Def=3064.
- "MaxHP: (+0~428)" -> bare range, no base. value=0, max=0. NOT enhanced (no base number outside).
- "Dmg: (+0~569)" -> bare range. value=0, max=0. NOT enhanced.
- NO-TILDE BARE ROLLS ON ARMOR — CRITICAL: "MaxHP: (+155)" with NO tilde and NO base number outside the parens is a REAL RESOLVED ROLL, not a hidden range. Output stats MaxHP value=155, max=0. Same for any armor stat shown this way: "Aim: (+135)" -> stats Aim value=135, max=0. "Dmg: (+220)" -> stats Dmg value=220, max=0. The presence of "~" is what makes something a hidden range — no tilde means the number in parens IS the actual roll, always, on every stat, no exceptions. Do not confuse this with fixedStats; a bare no-tilde "(+N)" always belongs in stats, never in fixedStats.
- ENHANCED ARMOR / enhancedStats: ONLY add a stat to "enhancedStats" when it has BOTH a base number outside AND a tilde range "~" inside, e.g. "Def: 3064 (+0~682)". On armor, enhancement inflates Def far past its roll max, so in practice Def is the stat that shows this base+range form. Other stats showing a single "(+N)" are normal rolls — never put them in enhancedStats.
- NEVER put a single "(+N)" value into enhancedStats. A single parenthetical without a tilde is always a real roll that grades normally.
- "enhancedStats" is a simple array of stat name strings, e.g. "enhancedStats":["Def","M.Def","Evasion","MaxHP"]. Include it only when enhanced armor stats are present; otherwise omit it or use an empty array.

STEP 4 - FIXED STATS

Put in fixedStats:
- Primary stats without parens: "STR +55" -> STR=55
- Base values from ring format: "MaxHP: +853 (+147)" -> MaxHP=853
- Stats with no roll parens: "MaxSP: +839" -> MaxSP=839
- Enhancement bonuses (tight no-space format only): "Def: 37(+8)" -> Def=37. But "Def: 3506 (+12)" with a space = base 3506 fixed + roll 12.
- Critical Rate, Attack Speed, Attack Rate in System 1
- Do NOT include Item Level

STEP 5 - VERIFY BEFORE YOU FINALIZE — MANDATORY, DO NOT SKIP

This is the single most important step. The most common error in this task is not misreading a number — it's silently dropping an entire stat line that has a roll, especially when that line is visually sandwiched between other lines. This has happened to Def, M.Def, Aim, MaxHP, and primary stats (STR/DEX/etc.) in different images — Aim and MaxHP on armor are the two most frequent repeat offenders, so check those two lines first, individually, before anything else. Assume any line can be dropped, including ones you feel confident about.

Do this before writing your final answer, not after:
1. Count the total number of stat lines visible in the tooltip (every line with a stat name and a number, from top to bottom — MaxHP, Dmg, Def, M.Dmg, M.Def, Aim, Evasion, STR, DEX, END, INT, SPR, whatever appears).
2. For each one, individually: does this line contain any parentheses? If yes, does the JSON you're about to output include this stat in the "stats" array with the correct rolled value (the number inside the parens, unless it's a tilde range "~", in which case value=0)? If the line has no parentheses at all, is it in "fixedStats" instead?
3. Count how many stat lines are represented in your JSON (stats + fixedStats + intentionally-excluded ones like Critical Rate). This count must equal the count from step 1. If it doesn't match, you have dropped a line — find it and add it before responding.
Do not finalize your answer until this line-count check passes. A stat you are unsure about should still be included — never omit a stat line because you're uncertain, only because you've confirmed it's genuinely fixed with no roll.

OUTPUT - raw JSON only, no markdown, no explanation:

CLASS RESTRICTION DETECTION:
- If the tooltip shows "Class: X or higher" -> include "classRestriction": "X" using exactly these values:
  "Fighter", "Cleric", "Archer", "Mage", "Trickster", "Crusader"
- Match the base class only using this COMPLETE subclass mapping — never output a subclass name directly, always map to its base class:
  Fighter subclasses (CleverFighter, Warrior, Gladiator, Knight) -> "Fighter"
  Cleric subclasses (Highcleric, Paladin, Holy Knight, Guardian) -> "Cleric"
  Archer subclasses (Hawkarcher, Scout, Sharpshooter, Ranger) -> "Archer"
  Mage subclasses (Wizmage, Enchanter, Warlock, Wizard) -> "Mage"
  Trickster subclasses (Gambit, Renegade, Reaper, Spectre) -> "Trickster"
  Crusader subclass (Templar) -> "Crusader"
- If no class restriction shown -> omit classRestriction entirely (do not include the field)

Example 1 - System 1 helmet:
{"itemName":"Solar Eclipse Robber Hat","itemType":"helmet","rarity":"green","requiredLevel":46,"statSystem":1,"stats":[{"name":"END","value":22,"max":0,"isPercent":false},{"name":"INT","value":5,"max":0,"isPercent":false}],"fixedStats":[{"name":"Def","value":37},{"name":"M.Def","value":35},{"name":"Evasion","value":35}]}

Example 2 - System 2 ring with base+roll format:
{"itemName":"Ocean Tide Ring","itemType":"ring","rarity":"blue","requiredLevel":120,"statSystem":2,"stats":[{"name":"MaxHP","value":79,"max":0,"isPercent":false},{"name":"Dmg","value":89,"max":0,"isPercent":false},{"name":"Def","value":45,"max":0,"isPercent":false},{"name":"M.Dmg","value":62,"max":0,"isPercent":false},{"name":"M.Def","value":77,"max":0,"isPercent":false},{"name":"Aim","value":33,"max":0,"isPercent":false}],"fixedStats":[{"name":"MaxHP","value":309},{"name":"MaxSP","value":304},{"name":"Dmg","value":84},{"name":"Def","value":83},{"name":"M.Dmg","value":84},{"name":"M.Def","value":83},{"name":"Aim","value":65},{"name":"Evasion","value":60}]}

Example 3 - System 2 weapon, multiple rolls incl Def/M.Def, the two most frequently missed lines (MaxHP: (+411) -> 411; Dmg: 1911~2886 NO parens -> no roll; Def: (+80) -> 80; M.Dmg: 11608~17923 NO parens -> no roll; M.Def: (+132) -> 132; Aim: 4366 (+104) -> 104):
{"itemName":"Valtara's Sleepwalker Staff","itemType":"weapon","rarity":"yellow","requiredLevel":140,"statSystem":2,"stats":[{"name":"MaxHP","value":411,"max":0,"isPercent":false},{"name":"Def","value":80,"max":0,"isPercent":false},{"name":"M.Def","value":132,"max":0,"isPercent":false},{"name":"Aim","value":104,"max":0,"isPercent":false}],"fixedStats":[{"name":"INT","value":128},{"name":"Dmg","value":2886},{"name":"M.Dmg","value":17923},{"name":"Aim","value":4366}]}

Example 4 - System 2 enhanced weapon, name has a [+N] tag (Demonic Queen's Staff[+12] — the [+N] tag does NOT by itself mean anything gets hidden. Report every rolled stat plainly and accurately, including M.Dmg's huge roll — read and report the true number, do not omit it or flag it just because it looks large):
{"itemName":"Demonic Queen's Staff[+12]","itemType":"weapon","rarity":"yellow","requiredLevel":130,"statSystem":2,"classRestriction":"Mage","stats":[{"name":"Dmg","value":281,"max":0,"isPercent":false},{"name":"Def","value":522,"max":0,"isPercent":false},{"name":"M.Dmg","value":19007,"max":0,"isPercent":false},{"name":"M.Def","value":120,"max":0,"isPercent":false}],"fixedStats":[{"name":"INT","value":114},{"name":"Dmg","value":1500},{"name":"M.Dmg","value":9550},{"name":"Aim","value":2730}]}

Example 5 - System 1 weapon with dual base+roll primary stat (STR +14 (+12) -> BOTH: fixedStats STR=14 AND stats STR value=12; DEX (+11) and END (+12) are roll-only, no fixed base shown; Dmg NEVER goes in the stats array for System 1 items even though it shows a roll here — use the range's high end, 126, as fixedStats Dmg only):
{"itemName":"Zombie King's Close Bow[+10]","itemType":"weapon","rarity":"green","requiredLevel":30,"statSystem":1,"classRestriction":"Archer","stats":[{"name":"STR","value":12,"max":0,"isPercent":false},{"name":"DEX","value":11,"max":0,"isPercent":false},{"name":"END","value":12,"max":0,"isPercent":false}],"fixedStats":[{"name":"STR","value":14},{"name":"Dmg","value":126},{"name":"Aim","value":142}]}

Example 6 - System 2 armor with bare no-tilde rolls on Aim AND MaxHP together — the two top repeat-offender stats, both real confirmed misses on separate real items merged into one example. Def: 4952(+9636) has no tilde, so it's a real roll even though the number is huge — report it plainly, do NOT flag it as enhanced just because it's large, that judgment happens downstream. MaxHP: (+271) and Aim: (+311) are bare no-tilde rolls that were each independently dropped from real scans in the past — both must be included:
{"itemName":"Awaken Forbidden Semegeton Armor[+12]","itemType":"armor","rarity":"blueSet","requiredLevel":145,"statSystem":2,"classRestriction":"Crusader","stats":[{"name":"MaxHP","value":271,"max":0,"isPercent":false},{"name":"Def","value":9636,"max":0,"isPercent":false},{"name":"M.Dmg","value":461,"max":0,"isPercent":false},{"name":"Aim","value":311,"max":0,"isPercent":false}],"fixedStats":[{"name":"Def","value":4952},{"name":"M.Def","value":4240},{"name":"Evasion","value":1747}]}

Example 7 - System 1 ring whose ITEM NAME contains a color word that does NOT match its real rarity (the item is literally named "Fragment of Doom (Blue)" as flavor text — the "(Blue)" is part of the name string, not a rarity marker. This exact item's tooltip name text rendered in yellow/gold. Ignore the word "Blue" entirely and report rarity based only on the actual rendered pixel color, which was yellow — a real confirmed miss when this rule wasn't followed):
{"itemName":"Fragment of Doom (Blue)","itemType":"ring","rarity":"yellow","requiredLevel":110,"statSystem":1,"stats":[{"name":"DEX","value":15,"max":0,"isPercent":false},{"name":"END","value":45,"max":0,"isPercent":false},{"name":"SPR","value":30,"max":0,"isPercent":false}],"fixedStats":[{"name":"STR","value":24},{"name":"M.Dmg","value":104},{"name":"M.Def","value":154}]}

Example 8 - System 1 weapon with a genuinely blue name that is faint/washed-out enough to be mistaken for green ("Beak of Canary[+10]" — a real confirmed miss: this item's name text is blue/cyan, but at low brightness it can look close to colorless, and it was incorrectly read as green. No set tag, no color word in the name, nothing unusual — this is the plain blue-vs-green case. Any cool blue-ish cast at all, even faint, means blue, not green):
{"itemName":"Beak of Canary[+10]","itemType":"weapon","rarity":"blue","requiredLevel":50,"statSystem":1,"classRestriction":"Archer","stats":[{"name":"STR","value":23,"max":0,"isPercent":false},{"name":"DEX","value":14,"max":0,"isPercent":false},{"name":"END","value":10,"max":0,"isPercent":false}],"fixedStats":[{"name":"Dmg","value":288},{"name":"Aim","value":287}]}

Now read the image and return the JSON for the item shown. Return ONLY the JSON object, nothing else.`;

      const claudeBody = {
        model: "claude-sonnet-4-6",
        max_tokens: 1500,
        system: "You are a JSON-only API. You output exactly one JSON object and nothing else — no prose, no markdown fences, no explanation before or after. Your entire response must be valid JSON starting with { and ending with }.",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mimeType || "image/jpeg",
                  data: imageBase64,
                },
              },
              {
                type: "text",
                text: prompt,
              },
            ],
          },
        ],
      };

      const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(claudeBody),
      });

      const claudeData = await claudeRes.json();

      if (!claudeRes.ok) {
        return new Response(JSON.stringify({ error: claudeData }), {
          status: claudeRes.status,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }

      // System instruction enforces JSON-only output. As a safety net, the bot
      // also extracts the {...} block, so stray prose won't break parsing.
      let text = claudeData.content?.[0]?.text ?? "";

      return new Response(JSON.stringify({ text }), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });

    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }
  },
};
