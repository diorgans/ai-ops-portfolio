// ============================================================
// ISYA COMPANION — PARSER WORKER v2  (two-step: perceive, then structure)
//
// WHAT CHANGED vs v1, and why
// ---------------------------
// v1 asked the model to do two different jobs in one pass: read the tooltip
// (perception) AND decide what each number meant (classification). Measured
// over 96 runs on 6 real screenshots, the model NEVER misread a number — and
// then filed the correct value into the wrong array 66% of the time. Because
// only `stats` is graded, a correctly-read Damage roll scored as if absent.
//
// Making the instruction louder made it worse (34% -> 24%).
//
// v2 splits the two jobs along the line that matters:
//   - the MODEL does only what vision can do: rarity from rendered text colour,
//     item type keywords, class line, set tag, and a VERBATIM copy of each stat
//     line. It is explicitly told not to interpret anything.
//   - CODE does every base/roll/range/statSystem decision, by punctuation.
//     A misroute stops being discouraged and becomes impossible to represent.
//
// Measured on an 8-item set (6 armor, 1 ring, 1 weapon), 10 runs each:
//   Damage roll capture .............. 34%  ->  100%
//   statSystem on a combat weapon .... wrong (0% grade)  ->  10/10 correct
//   ring rolls + duplicate % lines ... untested -> 100%
//   cost per scan .................... $0.029 -> ~$0.0065
//
// The output contract is UNCHANGED: this worker still returns { text: "<json>" }
// containing itemName / itemType / rarity / requiredLevel / statSystem / stats /
// fixedStats / enhancedStats / classRestriction / setTag. The bot worker needs
// no changes.
//
// NOT yet validated on: omamori, shield, necklace, earring, or any item whose
// PRIMARY stats roll (a true System 1 item). Those paths are implemented and
// unit-tested but have not been run against a real screenshot.
// ============================================================

const MODEL = "claude-sonnet-4-6";

// ============================================================
// THE PROMPT — perception only.
// Every rarity / item-type / class rule below is carried over WORD FOR WORD
// from v1. They encode real game knowledge learned the hard way and were not
// rewritten. What was DELETED from v1 is the stat-classification half: the
// stat-system rules, the roll rules, the fixed-stat rules, the mandatory
// verification checklists, and all eight worked examples. That logic now lives
// in code below, where it is deterministic and unit-tested.
// ============================================================
const PROMPT = `You are reading an item tooltip screenshot from Fiesta Online, a fantasy MMO.

Your job has exactly two parts:
  PART A - identify the item. These are judgements only vision can make.
  PART B - transcribe the stat lines, character for character.

You must NOT decide whether a number is a base value, a rolled value, a range, or an
enhancement bonus. That decision is made in code after you reply. For Part B, copying
the text accurately IS the entire job.

Return raw JSON with no markdown, no explanation, no preamble:

{
  "itemName": "<exact text of the title line>",
  "itemType": "<one of: weapon, shield, boots, helmet, pants, armor, ring, earring, necklace, bracelet, omamori>",
  "rarity": "<one of: green, blue, blueSet, yellow, orange, pink>",
  "requiredLevel": <integer or null>,
  "itemLevel": <integer or null>,
  "classRestriction": "<Fighter|Cleric|Archer|Mage|Trickster|Crusader>",
  "setTag": <true or false>,
  "setTagLine": "<exact text of any [...Set] line, or null>",
  "statLines": [
    { "text": "<the stat line EXACTLY as rendered>", "distinctColor": <true or false> }
  ]
}

========================= PART A - IDENTIFICATION =========================

RARITY = colour of the item name text at the very top of the tooltip. Judge ONLY the actual rendered pixel colour of that text - never anything else.
- Bright lime/neon green, no blue tint at all -> "green"
- Any cyan/blue tint at all, even faint or washed-out -> "blue". Light blue can look almost colourless on dark backgrounds or in a compressed screenshot - this is the single most commonly misread rarity. DEFAULT BIAS: if you are genuinely torn between blue and green, the correct answer is blue, not green. Only classify as green if the text is unambiguously lime/neon green or truly colourless white/gray with zero cool tint.
- Cyan/blue text AND a set tag/bonus present -> "blueSet" (the set tag ONLY upgrades blue to blueSet - it never changes yellow, orange, or green)
- Gold/amber/yellow -> "yellow" (stays yellow even with a set tag present - text colour always wins over the tag)
- Red-orange -> "orange". EXCEPTION: armor slots (helmet, body armor, pants, boots) can NEVER be orange in this game - that combination doesn't exist. If you're leaning orange on an armor piece, you are almost certainly misreading blue; re-examine and pick from green/blue/blueSet/yellow instead.
- Purple/pink -> "pink"

Two things that are NOT rarity signals, no matter how it looks: (1) a colour word appearing inside the item's own name as flavour text (e.g. an item literally titled "Fragment of Doom (Blue)" whose real tooltip colour was yellow - the word is coincidental, ignore it entirely), and (2) the screenshot's background scenery behind the tooltip box (textured floors, other UI, coloured scenery bleeding through) - judge only the name text's own pixels, nothing around or behind it.

Use Item Level as a secondary hint ONLY for jewelry when colour is ambiguous:
  Jewelry: Item Level 1=green, 2=blue, 3=yellow, 4-5=orange, 6-7=blueSet/orange
  Weapons and armor: ignore Item Level for rarity - use text colour only.
  Item Level 99 = orange for any item type.

ITEM TYPE from tooltip text:
- If tooltip shows a "Weapon Type:" line -> ALWAYS "weapon", regardless of item name
- "Hat", "Helmet", "Robber Hat", "Hood", "Cap" in item name -> "helmet"
- "Top", "Armor", "Plate", "Robe", "Coat" in item name -> "armor"
- "Pants", "Leggings", "Shorts" in item name -> "pants"
- "Boots", "Shoes", "Sandals", "Greaves" in item name -> "boots"
- "Shield", "Buckler" in item name -> "shield"
- If tooltip contains "Block Rate" anywhere (e.g. "Block Rate: 7%") -> ALWAYS "shield", regardless of item name. Block Rate is the definitive shield indicator in Fiesta Online - shields have unpredictable names so this field is the only reliable signal.
- "Ring" in item name BUT no "Weapon Type:" line -> "ring"
- "Earring" in item name -> "earring"
- "Necklace", "Pendant" in item name -> "necklace"
- "Bracelet", "Bangle" in item name -> "bracelet"
- "Omamori" in item name (e.g. "Amethyst Omamori", "Ruby Omamori") -> "omamori". This is a completely separate gear category (Talisman) from rings/necklaces/etc - do NOT classify it as jewelry. Omamori are ALWAYS rarity "yellow" regardless of what colour the name text actually renders as - this is a fixed game rule, not a colour judgement call, so report rarity:"yellow" for any omamori even if the text looks green, blue, or any other colour.
CRITICAL: "Weapon Type:" line always wins. "Ring Claws", "Ring Blade", "Ring Sword" are weapons not rings.

SET TAG: If the tooltip shows a "[...Set]" tag anywhere (e.g. "[Fallen Angel Set]", "[Woes Set]"), set "setTag": true and copy the line into "setTagLine". CRITICAL: setTag only matters for BLUE/CYAN text items - for those it sets rarity to "blueSet". For YELLOW, ORANGE, or GREEN text items, still report the true colour rarity (yellow/orange/green) even when setTag is true. Text colour ALWAYS wins over the set tag.

CLASS RESTRICTION:
- If the tooltip shows "Class: X or higher" -> include "classRestriction": "X" using exactly these values:
  "Fighter", "Cleric", "Archer", "Mage", "Trickster", "Crusader"
- Match the base class only using this COMPLETE subclass mapping - never output a subclass name directly, always map to its base class:
  Fighter subclasses (CleverFighter, Warrior, Gladiator, Knight) -> "Fighter"
  Cleric subclasses (Highcleric, Paladin, Holy Knight, Guardian) -> "Cleric"
  Archer subclasses (Hawkarcher, Scout, Sharpshooter, Ranger) -> "Archer"
  Mage subclasses (Wizmage, Enchanter, Warlock, Wizard) -> "Mage"
  Trickster subclasses (Gambit, Renegade, Reaper, Spectre) -> "Trickster"
  Crusader subclass (Templar) -> "Crusader"
- A line reading "Class  Common" is NOT a class restriction. Omit the field.
- If no class restriction is shown -> omit classRestriction entirely.

========================= PART B - TRANSCRIPTION =========================

1. One entry in statLines per stat line, top to bottom, in the order displayed.
2. Copy each line character for character: the stat name, any colon, every space, every "+", "(", ")", "~" and "%". Do not tidy spacing. Do not reformat numbers. Do not add a colon where the game shows none - "STR +138" has no colon and must be copied without one.
3. Do NOT decide whether a number is a base value, a roll, a range, or an enhancement bonus. You only copy text.
4. Do not omit a line because you are unsure what it means. Do not invent a line that is not there. The number of entries must equal the number of stat lines visible.
5. Examples of correct verbatim copying - note these are just text to you:
     "Dmg : (+283)"
     "Def: 2852(+6816)"
     "MaxHP : +2582 (+270)"
     "Dmg: 19889~30543(+564)"
     "Aim: +15%"
     "STR +138"
6. distinctColor is purely about rendering: if the line's text colour visibly differs from the other stat lines (for example an orange line among white ones), set it true. Otherwise false. If you are unsure, set false.
7. Transcribe ONLY the stat block. Stop before any "Binds when equipped", set-contents list, set-effect text, flavour text, or "Uses of Hammer" line. A "Weapon Type :" line may be included; it is ignored downstream.

Return only the JSON object, starting with { and ending with }.`;

const SYSTEM =
  "You are a JSON-only API. You output exactly one JSON object and nothing else — no prose, no markdown fences, no explanation before or after. Your entire response must be valid JSON starting with { and ending with }.";

// ============================================================
// STEP 2 — deterministic structuring. No model judgement below this line.
// Mirrors statline.mjs, which has a unit-test suite covering every line format
// observed across all 120 graded rows.
// ============================================================

const NAME_MAP = {
  "maxhp": "MaxHP", "maxsp": "MaxSP", "dmg": "Dmg", "def": "Def",
  "m.dmg": "M.Dmg", "m. dmg": "M.Dmg", "mdmg": "M.Dmg",
  "m.def": "M.Def", "m. def": "M.Def", "mdef": "M.Def",
  "aim": "Aim", "evasion": "Evasion",
  "critical rate": "Crit Rate", "crit rate": "Crit Rate",
  "block-crit rate": "Block-Crit Rate", "block rate": "Block Rate",
  "attack speed": "Attack Speed", "attack rate": "Attack Rate",
  "poison resistance": "Poison Resistance",
  "illness resistance": "Illness Resistance",
  "curse resistance": "Curse Resistance",
  "str": "STR", "dex": "DEX", "end": "END", "int": "INT", "spr": "SPR",
};

const S1_PRIMARY = new Set(["STR", "DEX", "END", "INT", "SPR"]);

// Lines that are not stats at all and must not become one.
const NOT_A_STAT = /^(weapon type|required level|item level|class)\b/i;

function parseStatLine(raw) {
  const line = String(raw || "").trim();
  if (!line || NOT_A_STAT.test(line)) return null;
  // The colon is OPTIONAL. System 2 prints "Dmg : (+283)"; System 1 prints
  // "STR (+50)" with no colon at all. Requiring one silently drops every
  // primary-stat line. Requiring the value to start with a digit, "+" or "("
  // is what lets the name match non-greedily without a delimiter.
  const m = line.match(/^([A-Za-z.][A-Za-z.\- ]*?)\s*:?\s*([+(\d].*)$/);
  if (!m) return null;
  const name = NAME_MAP[m[1].trim().toLowerCase()] || m[1].trim();
  let rest = m[2].trim();

  const isPercent = rest.includes("%");
  rest = rest.replace(/%/g, "").trim();

  const paren = rest.match(/\((\+?)([0-9.~]+)\)\s*$/);
  let inside = null;
  if (paren) { inside = paren[2]; rest = rest.slice(0, paren.index).trim(); }

  let base = null;
  if (rest.length) {
    const range = rest.match(/^\+?([\d.]+)\s*~\s*([\d.]+)$/);   // weapon damage spread
    if (range) base = parseFloat(range[2]);                      // high end
    else {
      const plain = rest.match(/^\+?([\d.]+)$/);
      if (plain) base = parseFloat(plain[1]);
    }
  }

  let roll = null, hiddenRange = false;
  if (inside !== null) {
    if (inside.includes("~")) { hiddenRange = true; roll = 0; }  // "(+0~682)" roll not shown
    else { roll = parseFloat(inside); }                          // "(+283)" IS the roll
  }
  return { name, base, roll, hiddenRange, isPercent };
}

// System 1 iff a PRIMARY stat carries a roll. "STR +138" with no parentheses is
// a fixed bonus and does NOT make an item System 1 — that misclassification is
// what produced "Primary Stats ... No gradeable stats ... 0%" on combat weapons.
// This also satisfies the jewelry exception: a ring whose primaries roll is
// System 1 even when a combat stat shows a small roll too.
function deriveStatSystem(statLines) {
  for (const entry of statLines || []) {
    const p = parseStatLine(entry && entry.text);
    if (p && S1_PRIMARY.has(p.name) && p.roll !== null) return 1;
  }
  return 2;
}

function buildStats(statLines, statSystem) {
  const stats = [], fixedStats = [], enhanced = [];
  for (const entry of statLines || []) {
    const p = parseStatLine(entry && entry.text);
    if (!p) continue;

    // System 1: combat stats are fixed no matter how they are punctuated.
    if (statSystem === 1 && !S1_PRIMARY.has(p.name)) {
      const v = p.base !== null ? p.base : p.roll;
      if (v !== null) fixedStats.push({ name: p.name, value: v });
      continue;
    }

    if (p.base !== null) fixedStats.push({ name: p.name, value: p.base });
    if (p.roll !== null) {
      stats.push({ name: p.name, value: p.roll, max: 0, isPercent: p.isPercent });
      // A differently-coloured line carrying BOTH a base and a parenthetical is
      // the enhancement row, not a roll. An explicit "(+0~MAX)" range likewise.
      // Advisory only: if the colour read is wrong, grading-core's 1.5x anomaly
      // guard still catches an enhancement-sized value. Measured reliability of
      // the colour judgement: 5 of 6 items.
      if (entry.distinctColor && p.base !== null && !p.hiddenRange) enhanced.push(p.name);
      if (p.hiddenRange && p.base !== null) enhanced.push(p.name);
    }
  }
  return { stats, fixedStats, enhancedStats: Array.from(new Set(enhanced)) };
}

function extractJson(text) {
  let clean = String(text || "").replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const a = clean.indexOf("{"), b = clean.lastIndexOf("}");
  if (a !== -1 && b !== -1 && b > a) clean = clean.slice(a, b + 1);
  return JSON.parse(clean);
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

    try {
      const { imageBase64, mimeType } = await request.json();

      const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 1500,
          system: SYSTEM,
          messages: [{
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mimeType || "image/jpeg", data: imageBase64 } },
              { type: "text", text: PROMPT },
            ],
          }],
        }),
      });

      const claudeData = await claudeRes.json();
      if (!claudeRes.ok) return json({ error: claudeData }, claudeRes.status);

      // Take the first TEXT block rather than content[0]. On models where
      // thinking cannot be disabled (Opus 5.5, Sonnet 5.5) content[0] is a
      // thinking block whose .text is empty, which would silently return "".
      const textBlock = (claudeData.content || []).find((c) => c.type === "text");
      const rawText = (textBlock && textBlock.text) || "";
      if (!rawText) return json({ error: "model returned no text block" }, 502);

      let perceived;
      try {
        perceived = extractJson(rawText);
      } catch (e) {
        return json({ text: rawText });   // let the bot surface the raw reply
      }

      // ---- deterministic structuring ----
      const statSystem = deriveStatSystem(perceived.statLines);
      const { stats, fixedStats, enhancedStats } = buildStats(perceived.statLines, statSystem);

      let rarity = perceived.rarity || "green";
      const itemType = perceived.itemType || "weapon";
      // Fixed game rules, applied in code so a colour misread cannot override them.
      if (itemType === "omamori") rarity = "yellow";
      if (perceived.setTag === true && (rarity === "blue" || rarity === "blueSet")) rarity = "blueSet";

      const item = {
        itemName: perceived.itemName || "Unknown Item",
        itemType,
        rarity,
        requiredLevel: perceived.requiredLevel != null ? Number(perceived.requiredLevel) : null,
        itemLevel: perceived.itemLevel != null ? Number(perceived.itemLevel) : null,
        statSystem,
        stats,
        fixedStats,
        setTag: perceived.setTag === true,
      };
      if (perceived.classRestriction) item.classRestriction = perceived.classRestriction;
      if (enhancedStats.length) item.enhancedStats = enhancedStats;
      if (perceived.setTagLine) item.setTagLine = perceived.setTagLine;

      // Same contract as v1: the bot worker JSON.parses this string.
      return json({ text: JSON.stringify(item) });

    } catch (err) {
      return json({ error: err.message }, 500);
    }
  },
};
