// ============================================================
// ISYA COMPANION — SHARED GRADING CORE
// Extracted from GearGrader.js so the Discord bot and app share
// the exact same database, lookups, and grade math.
// No React, no DOM — pure JS, safe to import in a Cloudflare Worker.
// ============================================================

const GRADE_THRESHOLDS = { S: 95, A: 80, B: 65, C: 50, D: 35, F: 0 };

const RARITY_MULTIPLIERS = {
  green: 1, blueSet: 3, blue: 3, yellow: 5, orange: 7, pink: null,
};

const SLOT_MULTIPLIERS = {
  weapon: 1.0, shield: 0.667, boots: 0.56, helmet: 0.67,
  pants: 0.72, armor: 0.83, jewelry: 0.45, omamori: 3.27,
};

const S1_FORMULAS = {
  green_weapon: (lvl) => lvl <= 70 ? Math.floor(lvl / 2) : null,
  green_armor: {
    boots:   (lvl) => lvl <= 70 ? Math.floor(lvl / 2) : null,
    helmet:  (lvl) => lvl <= 70 ? Math.floor(lvl / 2) : null,
    pants:   (lvl) => lvl <= 70 ? Math.floor(lvl / 2) : null,
    armor:   (lvl) => lvl <= 70 ? Math.floor(lvl / 2) : null,
  },
  blueSet_armor: {
    boots:   (lvl) => lvl <= 95 ? Math.floor(lvl / 2) + 3 : null,
    helmet:  (lvl) => lvl <= 95 ? Math.floor(lvl / 2) + 3 : null,
    pants:   (lvl) => lvl <= 95 ? Math.floor(lvl / 2) + 3 : null,
    armor:   (lvl) => lvl <= 95 ? Math.floor(lvl / 2) + 3 : null,
  },
  orange_weapon: (lvl) => lvl >= 70 ? Math.round(73 + ((lvl - 70) / 10) * 5) : null,
  green_jewelry: (lvl) => Math.ceil(lvl / 10),
};

const S1_LOOKUP = {
  green_weapon_high: {
    80: 35, 90: 35, 95: 55, 100: 50, 108: 55, 114: 60, 118: 65, 120: 65,
  },
  blue_weapon: {
    91: 70, 95: 70, 100: 80, 105: 80, 108: 80, 110: 70, 114: 80, 115: 80,
  },
  yellow_weapon: {
    91: 70, 105: 80, 114: 80, 115: 80,
  },
  blueSet_armor_high: {
    100: { boots:52, helmet:53, pants:54, armor:55 },
    105: { boots:57, helmet:58, pants:59, armor:60 },
    110: { all: 70 },
    114: { boots:62, helmet:63, pants:64, armor:65 },
    115: { boots:62, helmet:63, pants:64, armor:65 },
  },
  blue_armor: {
    95:  { boots:47, helmet:48, pants:49, armor:50 },
    105: { all: 55 },
    110: { all: 70 },
    114: { all: 80 },
    115: { all: 80 },
  },
  yellow_armor: {
    91:  { all: 70 },
    105: { all: 80 },
    114: { all: 80 },
  },
  green_jewelry_exceptions: {
    25: 9, 35: 11, 40: 12, 45: 13, 55: 15, 65: 17, 95: 23, 108: 27,
  },
  yellow_jewelry: {
    60: 32, 80: 40, 100: 48, 110: 52, 115: 56,
  },
};

const S2_DB = {
  weapon: {
    green: {
      18:  { Dmg:13,  Def:6,   MDmg:13,  MDef:6,   Aim:21,  Evasion:16, CritRate:1.1, BlockCrit:1.5 },
      28:  { Dmg:19,  Def:9,   MDmg:19,  MDef:9,   Aim:31,  Evasion:24, CritRate:1.7, BlockCrit:2.3 },
      38:  { Dmg:25,  Def:11,  MDmg:25,  MDef:11,  Aim:41,  Evasion:31, CritRate:2.2, BlockCrit:3.0 },
      48:  { Dmg:31,  Def:14,  MDmg:31,  MDef:14,  Aim:51,  Evasion:39, CritRate:2.8, BlockCrit:3.8 },
      120: { MaxHP:84,  Dmg:62,  Def:101, MDmg:62,  MDef:60,  Aim:48,  Evasion:44  },
      125: { MaxHP:88,  Dmg:77,  Def:122, MDmg:77,  MDef:72,  Aim:55,  Evasion:51  },
      130: { MaxHP:92,  Dmg:92,  Def:143, MDmg:92,  MDef:84,  Aim:63,  Evasion:57  },
      135: { MaxHP:96,  Dmg:107, Def:164, MDmg:107, MDef:96,  Aim:70,  Evasion:64  },
      140: { MaxHP:494, Dmg:607, Def:918, MDmg:607, MDef:539, Aim:384, Evasion:348 },
    },
    blue: {
      120: { MaxHP:251, Dmg:183, Def:301, MDmg:183, MDef:177, Aim:142, Evasion:130 },
      125: { MaxHP:251, Dmg:183, Def:301, MDmg:183, MDef:177, Aim:142, Evasion:130 },
      130: { MaxHP:274, Dmg:273, Def:426, MDmg:273, MDef:250, Aim:186, Evasion:169 },
      135: { MaxHP:475, Dmg:531, Def:814, MDmg:531, MDef:477, Aim:347, Evasion:315 },
      138: { MaxHP:285, Dmg:319, Def:489, MDmg:319, MDef:287, Aim:208, Evasion:189 },
      140: { MaxHP:494, Dmg:607, Def:918, MDmg:607, MDef:539, Aim:384, Evasion:348 },
    },
    yellow: {
      120: { MaxHP:418, Dmg:304, Def:501, MDmg:304, MDef:294, Aim:236, Evasion:215 },
      125: { MaxHP:437, Dmg:379, Def:605, MDmg:379, MDef:355, Aim:273, Evasion:249 },
      130: { MaxHP:456, Dmg:455, Def:709, MDmg:455, MDef:416, Aim:310, Evasion:282 },
      135: { MaxHP:475, Dmg:531, Def:814, MDmg:531, MDef:477, Aim:347, Evasion:315 },
      140: { MaxHP:494, Dmg:607, Def:918, MDmg:607, MDef:539, Aim:384, Evasion:348 },
    },
    orange: {
      120: { MaxHP:585, Dmg:425, Def:701, MDmg:425, MDef:411, Aim:330, Evasion:301 },
    },
  },
  shield: {
    green: {
      120: { MaxHP:57,  Dmg:41,  Def:68,  MDmg:41,  MDef:40,  Aim:32,  Evasion:30  },
      125: { MaxHP:59,  Dmg:51,  Def:82,  MDmg:51,  MDef:48,  Aim:37,  Evasion:34  },
      130: { MaxHP:62,  Dmg:62,  Def:95,  MDmg:62,  MDef:56,  Aim:42,  Evasion:38  },
      135: { MaxHP:64,  Dmg:72,  Def:109, MDmg:72,  MDef:65,  Aim:47,  Evasion:43  },
    },
    blue: {
      50:  { MaxHP:0,   Dmg:31,  Def:14,  MDmg:31,  MDef:14,  Aim:51,  Evasion:39  },
      120: { MaxHP:168, Dmg:122, Def:201, MDmg:122, MDef:118, Aim:95,  Evasion:87  },
      130: { MaxHP:183, Dmg:183, Def:284, MDmg:183, MDef:167, Aim:124, Evasion:113 },
      135: { MaxHP:317, Dmg:354, Def:543, MDmg:354, MDef:319, Aim:231, Evasion:210 },
      138: { MaxHP:191, Dmg:213, Def:326, MDmg:213, MDef:192, Aim:139, Evasion:127 },
      140: { MaxHP:330, Dmg:405, Def:613, MDmg:405, MDef:359, Aim:256, Evasion:233 },
    },
    yellow: {
      120: { MaxHP:279, Dmg:203, Def:334, MDmg:203, MDef:196, Aim:158, Evasion:144 },
      125: { MaxHP:292, Dmg:253, Def:404, MDmg:253, MDef:237, Aim:182, Evasion:166 },
      130: { MaxHP:304, Dmg:304, Def:473, MDmg:304, MDef:278, Aim:207, Evasion:188 },
      135: { MaxHP:475, Dmg:531, Def:814, MDmg:531, MDef:477, Aim:347, Evasion:315 },
      140: { MaxHP:330, Dmg:405, Def:613, MDmg:405, MDef:359, Aim:256, Evasion:233 },
    },
    orange: {
      120: { MaxHP:390, Dmg:284, Def:467, MDmg:284, MDef:274, Aim:220, Evasion:201 },
    },
  },
  armor: {
    green: {
      boots: {
        120: { MaxHP:47,  Dmg:35,  Def:57,  MDmg:35,  MDef:34,  Aim:27,  Evasion:25 },
        125: { MaxHP:49,  Dmg:43,  Def:68,  MDmg:43,  MDef:40,  Aim:31,  Evasion:29 },
        126: { MaxHP:50,  Dmg:45,  Def:70,  MDmg:45,  MDef:42,  Aim:32,  Evasion:29 },
        130: { MaxHP:52,  Dmg:51,  Def:80,  MDmg:51,  MDef:47,  Aim:35,  Evasion:32 },
        135: { MaxHP:54,  Dmg:60,  Def:91,  MDmg:60,  MDef:54,  Aim:39,  Evasion:36 },
      },
      helmet: {
        120: { MaxHP:57,  Dmg:41,  Def:68,  MDmg:41,  MDef:40,  Aim:32,  Evasion:30 },
        125: { MaxHP:59,  Dmg:51,  Def:82,  MDmg:51,  MDef:48,  Aim:37,  Evasion:34 },
        126: { MaxHP:60,  Dmg:53,  Def:84,  MDmg:53,  MDef:50,  Aim:38,  Evasion:35 },
        130: { MaxHP:62,  Dmg:62,  Def:95,  MDmg:62,  MDef:56,  Aim:42,  Evasion:38 },
        135: { MaxHP:64,  Dmg:72,  Def:109, MDmg:72,  MDef:65,  Aim:47,  Evasion:43 },
      },
      pants: {
        120: { MaxHP:61,  Dmg:45,  Def:73,  MDmg:45,  MDef:43,  Aim:35,  Evasion:32 },
        125: { MaxHP:64,  Dmg:56,  Def:88,  MDmg:56,  MDef:52,  Aim:40,  Evasion:37 },
        126: { MaxHP:65,  Dmg:58,  Def:91,  MDmg:58,  MDef:54,  Aim:41,  Evasion:38 },
        130: { MaxHP:67,  Dmg:67,  Def:103, MDmg:67,  MDef:61,  Aim:46,  Evasion:42 },
        135: { MaxHP:69,  Dmg:78,  Def:118, MDmg:78,  MDef:70,  Aim:51,  Evasion:46 },
      },
      armor: {
        120: { MaxHP:70,  Dmg:51,  Def:84,  MDmg:51,  MDef:50,  Aim:40,  Evasion:37 },
        125: { MaxHP:74,  Dmg:64,  Def:102, MDmg:64,  MDef:60,  Aim:46,  Evasion:42 },
        126: { MaxHP:74,  Dmg:67,  Def:105, MDmg:67,  MDef:62,  Aim:48,  Evasion:43 },
        130: { MaxHP:77,  Dmg:77,  Def:119, MDmg:77,  MDef:70,  Aim:52,  Evasion:48 },
        135: { MaxHP:80,  Dmg:89,  Def:136, MDmg:89,  MDef:80,  Aim:59,  Evasion:53 },
      },
    },
    blue: {
      boots: {
        120: { MaxHP:140, Dmg:102, Def:168, MDmg:102, MDef:99,  Aim:79,  Evasion:72  },
        125: { MaxHP:146, Dmg:127, Def:202, MDmg:127, MDef:119, Aim:92,  Evasion:84  },
        130: { MaxHP:156, Dmg:153, Def:240, MDmg:153, MDef:141, Aim:105, Evasion:96  },
        135: { MaxHP:159, Dmg:178, Def:272, MDmg:178, MDef:160, Aim:116, Evasion:106 },
      },
      helmet: {
        120: { MaxHP:168, Dmg:122, Def:201, MDmg:122, MDef:118, Aim:95,  Evasion:87  },
        125: { MaxHP:175, Dmg:152, Def:243, MDmg:152, MDef:143, Aim:110, Evasion:100 },
        130: { MaxHP:186, Dmg:186, Def:285, MDmg:186, MDef:168, Aim:126, Evasion:114 },
        135: { MaxHP:191, Dmg:213, Def:326, MDmg:213, MDef:192, Aim:139, Evasion:127 },
      },
      pants: {
        120: { MaxHP:182, Dmg:132, Def:218, MDmg:132, MDef:128, Aim:103, Evasion:94  },
        125: { MaxHP:190, Dmg:165, Def:263, MDmg:165, MDef:154, Aim:119, Evasion:108 },
        130: { MaxHP:201, Dmg:201, Def:309, MDmg:201, MDef:183, Aim:138, Evasion:126 },
        135: { MaxHP:206, Dmg:231, Def:353, MDmg:231, MDef:207, Aim:151, Evasion:137 },
      },
      armor: {
        120: { MaxHP:209, Dmg:152, Def:251, MDmg:152, MDef:147, Aim:118, Evasion:108 },
        125: { MaxHP:221, Dmg:192, Def:306, MDmg:192, MDef:180, Aim:138, Evasion:126 },
        130: { MaxHP:231, Dmg:231, Def:357, MDmg:231, MDef:210, Aim:156, Evasion:144 },
        135: { MaxHP:238, Dmg:266, Def:407, MDmg:266, MDef:239, Aim:174, Evasion:158 },
      },
    },
    blueSet: {
      boots: {
        120: { MaxHP:140, Dmg:102, Def:168, MDmg:102, MDef:99,  Aim:79,  Evasion:72  },
        125: { MaxHP:146, Dmg:127, Def:202, MDmg:127, MDef:119, Aim:92,  Evasion:84  },
        130: { MaxHP:153, Dmg:152, Def:237, MDmg:152, MDef:139, Aim:104, Evasion:95  },
        138: { MaxHP:159, Dmg:178, Def:272, MDmg:178, MDef:160, Aim:116, Evasion:106 },
        140: { MaxHP:275, Dmg:338, Def:511, MDmg:338, MDef:300, Aim:214, Evasion:194 },
        145: { MaxHP:286, Dmg:380, Def:569, MDmg:380, MDef:334, Aim:234, Evasion:213 },
      },
      helmet: {
        120: { MaxHP:168, Dmg:122, Def:201, MDmg:122, MDef:118, Aim:95,  Evasion:87  },
        125: { MaxHP:175, Dmg:152, Def:243, MDmg:152, MDef:143, Aim:110, Evasion:100 },
        130: { MaxHP:183, Dmg:183, Def:284, MDmg:183, MDef:167, Aim:125, Evasion:114 },
        135: { MaxHP:191, Dmg:213, Def:326, MDmg:213, MDef:192, Aim:139, Evasion:127 },
        138: { MaxHP:191, Dmg:213, Def:326, MDmg:213, MDef:192, Aim:139, Evasion:127 },
        140: { MaxHP:330, Dmg:405, Def:613, MDmg:405, MDef:359, Aim:256, Evasion:233 },
        145: { MaxHP:342, Dmg:455, Def:682, MDmg:455, MDef:400, Aim:281, Evasion:255 },
      },
      pants: {
        120: { MaxHP:182, Dmg:132, Def:218, MDmg:132, MDef:128, Aim:103, Evasion:94  },
        125: { MaxHP:190, Dmg:165, Def:263, MDmg:165, MDef:154, Aim:119, Evasion:108 },
        130: { MaxHP:198, Dmg:198, Def:306, MDmg:198, MDef:181, Aim:135, Evasion:123 },
        135: { MaxHP:206, Dmg:231, Def:353, MDmg:231, MDef:207, Aim:151, Evasion:137 },
        138: { MaxHP:206, Dmg:231, Def:353, MDmg:231, MDef:207, Aim:151, Evasion:137 },
        140: { MaxHP:357, Dmg:438, Def:663, MDmg:438, MDef:389, Aim:277, Evasion:252 },
        145: { MaxHP:371, Dmg:493, Def:739, MDmg:493, MDef:434, Aim:304, Evasion:276 },
      },
      armor: {
        120: { MaxHP:209, Dmg:152, Def:251, MDmg:152, MDef:147, Aim:118, Evasion:108 },
        125: { MaxHP:221, Dmg:192, Def:306, MDmg:192, MDef:180, Aim:138, Evasion:126 },
        130: { MaxHP:228, Dmg:228, Def:353, MDmg:228, MDef:208, Aim:156, Evasion:142 },
        135: { MaxHP:238, Dmg:266, Def:407, MDmg:266, MDef:239, Aim:174, Evasion:158 },
        138: { MaxHP:238, Dmg:266, Def:407, MDmg:266, MDef:239, Aim:174, Evasion:158 },
        140: { MaxHP:412, Dmg:506, Def:765, MDmg:506, MDef:449, Aim:320, Evasion:291 },
        145: { MaxHP:428, Dmg:569, Def:852, MDmg:569, MDef:500, Aim:351, Evasion:318 },
      },
    },
    yellow: {
      boots:  { 125: { MaxHP:243, Dmg:211, Def:337, MDmg:211, MDef:198, Aim:152, Evasion:139 } },
      helmet: { 125: { MaxHP:292, Dmg:253, Def:404, MDmg:253, MDef:237, Aim:182, Evasion:166 } },
      pants:  { 125: { MaxHP:316, Dmg:274, Def:437, MDmg:274, MDef:257, Aim:197, Evasion:180 } },
      armor:  { 125: { MaxHP:364, Dmg:316, Def:504, MDmg:316, MDef:296, Aim:228, Evasion:207 } },
    },
  },
  jewelry: {
    green: {
      basic: {
        120: { MaxHP:38,  Dmg:28,  Def:45,  MDmg:28,  MDef:27,  Aim:22,  Evasion:20 },
        124: { MaxHP:39,  Dmg:33,  Def:53,  MDmg:33,  MDef:31,  Aim:25,  Evasion:22 },
        126: { MaxHP:40,  Dmg:36,  Def:57,  MDmg:36,  MDef:34,  Aim:26,  Evasion:24 },
      },
    },
    blue: {
      120: { MaxHP:112, Dmg:82,  Def:134, MDmg:82,  MDef:79,  Aim:64,  Evasion:58  },
      125: { MaxHP:117, Dmg:102, Def:162, MDmg:102, MDef:95,  Aim:73,  Evasion:67  },
      127: { MaxHP:119, Dmg:110, Def:173, MDmg:110, MDef:102, Aim:77,  Evasion:71  },
      129: { MaxHP:121, Dmg:118, Def:184, MDmg:118, MDef:108, Aim:81,  Evasion:74  },
      138: { MaxHP:127, Dmg:142, Def:218, MDmg:142, MDef:128, Aim:93,  Evasion:85  },
      140: { MaxHP:132, Dmg:163, Def:246, MDmg:163, MDef:144, Aim:103, Evasion:94  },
      141: { MaxHP:134, Dmg:167, Def:251, MDmg:167, MDef:148, Aim:105, Evasion:95 },
    },
    yellow: {
      120: { MaxHP:186, Dmg:136, Def:223, MDmg:136, MDef:131, Aim:105, Evasion:96  },
      130: { MaxHP:203, Dmg:203, Def:316, MDmg:203, MDef:186, Aim:138, Evasion:126 },
      140: { MaxHP:220, Dmg:270, Def:409, MDmg:270, MDef:240, Aim:171, Evasion:155 },
      141: { MaxHP:222, Dmg:277, Def:418, MDmg:277, MDef:245, Aim:174, Evasion:158 },
    },
    blueSet: {
      135: { MaxHP:203, Dmg:203, Def:316, MDmg:203, MDef:186, Aim:138, Evasion:126 },
      140: { MaxHP:220, Dmg:270, Def:409, MDmg:270, MDef:240, Aim:171, Evasion:155 },
      143: { MaxHP:225, Dmg:290, Def:437, MDmg:290, MDef:256, Aim:181, Evasion:164 },
    },
    orange: {
      120: { MaxHP:186, Dmg:136, Def:223, MDmg:136, MDef:131, Aim:105, Evasion:96  },
      130: { MaxHP:203, Dmg:203, Def:316, MDmg:203, MDef:186, Aim:138, Evasion:126 },
      140: { MaxHP:220, Dmg:270, Def:409, MDmg:270, MDef:240, Aim:171, Evasion:155 },
    },
  },
};

// ── SLOTS / RARITIES / ITEM TYPES for UI ──────────────────────

const ITEM_TYPES = ['weapon', 'shield', 'boots', 'helmet', 'pants', 'armor', 'ring', 'earring', 'necklace', 'bracelet'];
const ARMOR_SLOTS = ['boots', 'helmet', 'pants', 'armor'];
const JEWELRY_TYPES = ['ring', 'earring', 'necklace', 'bracelet'];
const RARITIES = ['green', 'blueSet', 'blue', 'yellow', 'orange'];
const RARITY_LABELS = { green: 'Green', blueSet: 'Blue Set', blue: 'Blue', yellow: 'Yellow', orange: 'Orange' };
const RARITY_COLORS = { green: '#22c55e', blueSet: '#38bdf8', blue: '#60a5fa', yellow: '#f59e0b', orange: '#fb923c' };

// ── DB LOOKUP FUNCTIONS ───────────────────────────────────────

function getSlotCategory(itemType) {
  if (itemType === 'weapon') return 'weapon';
  if (itemType === 'shield') return 'shield';
  if (ARMOR_SLOTS.includes(itemType)) return 'armor';
  if (JEWELRY_TYPES.includes(itemType)) return 'jewelry';
  return null;
}

/**
 * Finds the closest level entry at or below `level` in a lookup map.
 */
function findClosestLevel(levelMap, level) {
  const keys = Object.keys(levelMap).map(Number).sort((a, b) => a - b);
  let best = null;
  for (const k of keys) {
    if (k <= level) best = k;
  }
  return best !== null ? { level: best, data: levelMap[best] } : null;
}

/**
 * Main S1 max lookup: returns { max: number|null, unverified: bool, source: string }
 */
function lookupS1Max(itemType, rarity, level) {
  const lvl = parseInt(level);
  if (isNaN(lvl)) return { max: null };

  const slot = getSlotCategory(itemType);

  // ── WEAPON / SHIELD ───────────────────────────────────────
  if (slot === 'weapon' || slot === 'shield') {
    if (rarity === 'orange') {
      const val = S1_FORMULAS.orange_weapon(lvl);
      return val !== null ? { max: val, source: 'formula' } : { max: null };
    }
    if (rarity === 'green') {
      // Formula covers 1-70
      const formulaVal = S1_FORMULAS.green_weapon(lvl);
      if (formulaVal !== null) return { max: formulaVal, source: 'formula' };
      // Lookup for 80+
      const hit = S1_LOOKUP.green_weapon_high[lvl];
      return hit !== undefined ? { max: hit, source: 'db' } : { max: null };
    }
    if (rarity === 'blue' || rarity === 'blueSet') {
      // Check high-level lookup first
      const hit = S1_LOOKUP.blue_weapon[lvl];
      if (hit !== undefined) return { max: hit, source: 'db' };
      // S1 rolls for blue weapons below level 91 follow the same green formula
      if (lvl <= 70) {
        const formulaVal = S1_FORMULAS.green_weapon(lvl);
        if (formulaVal !== null) return { max: formulaVal, source: 'formula' };
      }
      return { max: null };
    }
    if (rarity === 'yellow') {
      const hit = S1_LOOKUP.yellow_weapon[lvl];
      if (hit !== undefined) return { max: hit, source: 'db' };
      // Same fallback — yellow S1 follows green formula at lower levels
      if (lvl <= 70) {
        const formulaVal = S1_FORMULAS.green_weapon(lvl);
        if (formulaVal !== null) return { max: formulaVal, source: 'formula' };
      }
      return { max: null };
    }
  }

  // ── ARMOR SLOTS ───────────────────────────────────────────
  if (slot === 'armor') {
    const armorSlot = itemType; // boots/helmet/pants/armor
    if (rarity === 'green') {
      const formulaFn = S1_FORMULAS.green_armor[armorSlot];
      if (formulaFn) {
        const val = formulaFn(lvl);
        if (val !== null) return { max: val, source: 'formula' };
      }
      return { max: null };
    }
    if (rarity === 'blueSet') {
      // Check lookup table first — it takes priority over formula
      const row = S1_LOOKUP.blueSet_armor_high[lvl];
      if (row) {
        const val = row.all !== undefined ? row.all : row[armorSlot];
        if (val !== undefined) return { max: val, source: 'db' };
      }
      // Fall back to formula
      const formulaFn = S1_FORMULAS.blueSet_armor[armorSlot];
      if (formulaFn) {
        const formulaVal = formulaFn(lvl);
        if (formulaVal !== null) return { max: formulaVal, source: 'formula' };
      }
      return { max: null };
    }
    if (rarity === 'blue') {
      const row = S1_LOOKUP.blue_armor[lvl];
      if (row) {
        const val = row.all !== undefined ? row.all : row[armorSlot];
        return val !== undefined ? { max: val, source: 'db' } : { max: null };
      }
      // Blue armor below level 95 follows the green formula floor(lvl/2)
      if (lvl <= 94) {
        const val = Math.floor(lvl / 2);
        return { max: val, source: 'formula' };
      }
      return { max: null };
    }
    if (rarity === 'yellow') {
      const row = S1_LOOKUP.yellow_armor[lvl];
      if (row) {
        const val = row.all !== undefined ? row.all : row[armorSlot];
        return val !== undefined ? { max: val, source: 'db' } : { max: null };
      }
      // Yellow armor below level 91 follows green formula floor(lvl/2)
      if (lvl <= 90) {
        const val = Math.floor(lvl / 2);
        return { max: val, source: 'formula' };
      }
      return { max: null };
    }
  }

  // ── JEWELRY ───────────────────────────────────────────────
  if (slot === 'jewelry') {
    if (rarity === 'green') {
      const exception = S1_LOOKUP.green_jewelry_exceptions[lvl];
      if (exception !== undefined) return { max: exception, source: 'db' };
      return { max: S1_FORMULAS.green_jewelry(lvl), source: 'formula' };
    }
    if (rarity === 'blue' || rarity === 'blueSet') {
      // blueSet jewelry S1 = green
      const exception = S1_LOOKUP.green_jewelry_exceptions[lvl];
      if (exception !== undefined) return { max: exception, source: 'db' };
      return { max: S1_FORMULAS.green_jewelry(lvl), source: 'formula' };
    }
    if (rarity === 'yellow') {
      const hit = S1_LOOKUP.yellow_jewelry[lvl];
      return hit !== undefined ? { max: hit, source: 'db' } : { max: null };
    }
  }

  return { max: null };
}

/**
 * Main S2 max lookup: returns { stats: obj|null, unverified: bool }
 * Looks up exact level; if not found, tries closest-below in the same rarity.
 */
function lookupS2Max(itemType, rarity, level) {
  const lvl = parseInt(level);
  if (isNaN(lvl)) return { stats: null };

  const slot = getSlotCategory(itemType);

  let table = null;

  if (slot === 'weapon') {
    table = S2_DB.weapon[rarity];
  } else if (slot === 'shield') {
    table = S2_DB.shield[rarity];
  } else if (slot === 'armor') {
    const armorTables = S2_DB.armor[rarity];
    table = armorTables ? armorTables[itemType] : null;
  } else if (slot === 'jewelry') {
    const jewTable = S2_DB.jewelry[rarity];
    // jewelry blue/yellow/blueSet are flat level→stats
    // green.basic is nested
    if (rarity === 'green') {
      table = jewTable?.basic;
    } else {
      table = jewTable;
    }
  }

  if (!table) return { stats: null };

  // Exact match first
  if (table[lvl]) {
    return { stats: table[lvl], unverified: table[lvl].verified === false };
  }

  // Closest level at or below
  const closest = findClosestLevel(table, lvl);
  if (closest) {
    return {
      stats: closest.data,
      unverified: closest.data.verified === false,
      interpolated: closest.level !== lvl,
      closestLevel: closest.level,
    };
  }

  return { stats: null };
}

// ── GRADE HELPERS ─────────────────────────────────────────────

function getGrade(pct) {
  if (pct >= 95) return 'S';
  if (pct >= 80) return 'A';
  if (pct >= 65) return 'B';
  if (pct >= 50) return 'C';
  if (pct >= 35) return 'D';
  return 'F';
}

/**
 * Power Score — answers "how strong is this item overall," not just how well it rolled.
 * Combines the item's tier ceiling (level + rarity, the real drivers of best-in-slot)
 * with its roll quality (% of max). Lets you compare a 100%-rolled lvl 95 blue against
 * a 70%-rolled lvl 145 yellow and see which is actually stronger.
 *
 * tierCeiling = level (0-145) scaled to 0-700, times a rarity multiplier.
 * Final score is tierCeiling * (rollPct/100), rounded. Scale tops out near 1000.
 */
const RARITY_POWER = {
  green: 0.55, blue: 0.78, blueSet: 0.85, yellow: 1.0, orange: 0.92,
};
function powerScore(level, rarity, overallPct) {
  const lvl = parseInt(level) || 0;
  const rarMult = RARITY_POWER[rarity] != null ? RARITY_POWER[rarity] : 0.6;
  const tierCeiling = (lvl / 145) * 700 * rarMult + 150 * rarMult; // base floor so rarity always matters
  const score = Math.round(tierCeiling * (overallPct / 100));
  return score;
}
function powerTier(score) {
  if (score >= 600) return { label: 'Endgame', color: '#f59e0b' };
  if (score >= 420) return { label: 'High Tier', color: '#a855f7' };
  if (score >= 260) return { label: 'Mid Tier', color: '#3b82f6' };
  if (score >= 120) return { label: 'Leveling', color: '#22c55e' };
  return { label: 'Early', color: '#9980cc' };
}

const GRADE_COLOR = {
  S: '#f59e0b', A: '#a855f7', B: '#3b82f6',
  C: '#22c55e', D: '#f97316', F: '#ef4444',
};
const GRADE_BG = {
  S: 'rgba(245,158,11,0.15)',   A: 'rgba(168,85,247,0.15)',
  B: 'rgba(59,130,246,0.15)',   C: 'rgba(34,197,94,0.15)',
  D: 'rgba(249,115,22,0.15)',   F: 'rgba(239,68,68,0.15)',
};

// ── STAT DEFINITIONS ──────────────────────────────────────────

const STATS_S1 = ['STR', 'DEX', 'END', 'INT', 'SPR'];

// S2 display labels → DB keys
const STATS_S2_MAP = [
  { label: 'MaxHP',           key: 'MaxHP',     isPercent: false },
  { label: 'Dmg',             key: 'Dmg',       isPercent: false },
  { label: 'Def',             key: 'Def',       isPercent: false },
  { label: 'M.Dmg',          key: 'MDmg',      isPercent: false },
  { label: 'M.Def',          key: 'MDef',      isPercent: false },
  { label: 'Aim',             key: 'Aim',       isPercent: false },
  { label: 'Evasion',         key: 'Evasion',   isPercent: false },
  { label: 'Crit Rate',       key: 'CritRate',  isPercent: true  },
  { label: 'Block-Crit Rate', key: 'BlockCrit', isPercent: true  },
];
const STATS_S2 = STATS_S2_MAP.map(m => m.label);
const PERCENT_STATS = ['Crit Rate', 'Block-Crit Rate'];

// ── GRADE A PARSED ITEM ───────────────────────────────────────
// Takes the JSON your image-parser worker returns and produces a
// graded result. Mirrors buildResult() in GearGrader.js.
function gradeParsedItem(parsed) {
  const rarity = parsed.rarity || 'green';
  const itemType = parsed.itemType || 'weapon';
  const level = parsed.requiredLevel;
  const statSystem = parsed.statSystem || 1;

  const S1_PRIMARY = ['STR', 'DEX', 'END', 'INT', 'SPR'];
  const S1_EXCLUDED = ['Critical Rate', 'Block-Crit Rate', 'Attack Rate', 'Crit Rate'];

  const enrichedStats = (parsed.stats || [])
    .filter(s => statSystem === 1
      ? S1_PRIMARY.includes(s.name) && !S1_EXCLUDED.includes(s.name)
      : !S1_EXCLUDED.includes(s.name))
    .map(s => {
      if (statSystem === 1) {
        const res = lookupS1Max(itemType, rarity, level);
        if (res.max !== null && res.max !== undefined) return { ...s, max: res.max };
      } else {
        const res = lookupS2Max(itemType, rarity, level);
        if (res.stats) {
          const match = STATS_S2_MAP.find(m => m.label === s.name || m.key === s.name);
          if (match && res.stats[match.key] !== undefined && res.stats[match.key] !== null) {
            return { ...s, max: res.stats[match.key] };
          }
        }
      }
      return s;
    });

  const gradableStats = enrichedStats.filter(s => s.max > 0 || (s.value === 0 && s.max === 0));
  const enhancedNames = new Set(parsed.enhancedStats || []);
  const scorableStats = gradableStats.filter(s => s.max > 0 && !enhancedNames.has(s.name));

  let itemEnhanced = enhancedNames.size > 0 || scorableStats.some(s => s.value > s.max);
  const slotForEnh = getSlotCategory(itemType);
  if (!itemEnhanced && statSystem === 2 && slotForEnh === 'armor') {
    const maxRes = lookupS2Max(itemType, rarity, level);
    if (maxRes && maxRes.stats) {
      for (const fs of (parsed.fixedStats || [])) {
        const match = STATS_S2_MAP.find(m => m.label === fs.name || m.key === fs.name);
        const dbMax = match ? maxRes.stats[match.key] : null;
        if (dbMax && fs.value > dbMax) { itemEnhanced = true; break; }
      }
    }
  }

  // Weighted grading: DEX and END are universally valued 5x more than other stats.
  // Applies to System 1 primary stat items only.
  const HIGH_VALUE_STATS = new Set(['DEX', 'END']);
  const STAT_WEIGHT = (name) => (statSystem === 1 && HIGH_VALUE_STATS.has(name)) ? 5 : 1;

  const weightedSum = scorableStats.reduce((sum, s) => {
    const pct = s.max > 0 ? (Math.min(s.value, s.max) / s.max) * 100 : 0;
    return sum + pct * STAT_WEIGHT(s.name);
  }, 0);
  const weightTotal = scorableStats.reduce((sum, s) => sum + STAT_WEIGHT(s.name), 0);
  const overallPct = weightTotal > 0 ? Math.round(weightedSum / weightTotal) : 0;

  return {
    itemName:      parsed.itemName || 'Unknown Item',
    itemType, rarity, requiredLevel: level, statSystem,
    stats:         gradableStats,
    enhancedStats: parsed.enhancedStats || [],
    fixedStats:    parsed.fixedStats || [],
    overallPct,
    overallGrade:  getGrade(overallPct),
    enhanced:      itemEnhanced,
    powerScore:    powerScore(level, rarity, overallPct),
  };
}

export {
  S2_DB, S1_FORMULAS, S1_LOOKUP,
  lookupS1Max, lookupS2Max, getSlotCategory,
  getGrade, powerScore, powerTier,
  STATS_S2_MAP, RARITY_LABELS, RARITY_COLORS,
  gradeParsedItem,
};
