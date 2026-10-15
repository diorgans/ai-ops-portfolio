// register-commands.js
// Run ONCE (and again whenever you change commands) to register the
// bot's slash commands with Discord.
//
//   node register-commands.js
//
// Needs these env vars set in your shell first:
//   DISCORD_APP_ID, DISCORD_BOT_TOKEN
//   (optional) DISCORD_GUILD_ID — if set, registers instantly to that
//   one server for testing. Without it, registers globally (~1 hr to appear).

const APP_ID = process.env.DISCORD_APP_ID;
const TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID;

if (!APP_ID || !TOKEN) {
  console.error('Set DISCORD_APP_ID and DISCORD_BOT_TOKEN first.');
  process.exit(1);
}

const commands = [
  {
    name: 'grade',
    description: 'Grade a piece of Fiesta gear from a tooltip screenshot',
    options: [
      {
        name: 'image',
        description: 'Screenshot of the item tooltip',
        type: 11,
        required: true,
      },
      {
        name: 'rarity',
        description: 'The item\'s rarity (color) — required, since auto-detection is unreliable',
        type: 3,
        required: true,
        choices: [
          { name: 'Green', value: 'green' },
          { name: 'Blue', value: 'blue' },
          { name: 'Blue Set', value: 'blueSet' },
          { name: 'Yellow', value: 'yellow' },
          { name: 'Orange', value: 'orange' },
        ],
      },
    ],
    contexts: [0, 1, 2],
    integration_types: [0, 1],
  },
  {
    name: 'leaderboard',
    description: 'Show the top graded gear by Power Score',
    contexts: [0, 1, 2],
    integration_types: [0, 1],
  },
  {
    name: 'cashshop',
    description: 'Tier-grade a cash shop item by its bonus stats',
    options: [
      {
        name: 'item',
        description: 'Item name to look up',
        type: 3,
        required: true,
        autocomplete: true,
      },
    ],
    contexts: [0, 1, 2],
    integration_types: [0, 1],
  },
  {
    name: 'shoptoday',
    description: 'See graded stat items currently on the rotating sales (Flash, Weekly, Mystery, Item of Day)',
    options: [
      {
        name: 'slot',
        description: 'Only show items for this slot',
        type: 3,
        required: false,
        choices: [
          { name: 'Head', value: 'Head' },
          { name: 'Eyes', value: 'Eyes' },
          { name: 'Mouth', value: 'Mouth' },
          { name: 'Costume', value: 'Costume' },
          { name: 'Top', value: 'Top' },
          { name: 'Bottom', value: 'Bottom' },
          { name: 'Boots', value: 'Boots' },
          { name: 'Back', value: 'Back' },
          { name: 'Tail', value: 'Tail' },
          { name: 'Aura', value: 'Aura' },
        ],
      },
      {
        name: 'min_grade',
        description: 'Only show items graded this or better',
        type: 3,
        required: false,
        choices: [
          { name: 'S', value: 'S' },
          { name: 'A or better', value: 'A' },
          { name: 'B or better', value: 'B' },
          { name: 'C or better', value: 'C' },
          { name: 'D or better', value: 'D' },
        ],
      },
    ],
    contexts: [0, 1, 2],
    integration_types: [0, 1],
  },
  {
    name: 'bestgear',
    description: 'Show the best cash shop item per slot for a given stat (e.g. max Defense)',
    options: [
      {
        name: 'stat',
        description: 'The stat to maximize (e.g. Defense, Critical Rate)',
        type: 3,
        required: true,
        autocomplete: true,
      },
      {
        name: 'stat2',
        description: 'Optional second stat to blend in (e.g. Aim) — ranks by combined 50/50 score per slot',
        type: 3,
        required: false,
        autocomplete: true,
      },
      {
        name: 'source',
        description: 'Search the full cash shop or only items currently on sale',
        type: 3,
        required: false,
        choices: [
          { name: 'Best overall (full cash shop)', value: 'overall' },
          { name: 'Best currently on sale', value: 'shop' },
        ],
      },
    ],
    contexts: [0, 1, 2],
    integration_types: [0, 1],
  },
  {
    name: 'checkrole',
    description: 'Count vouches for a user and assign their marketplace role (admin only)',
    options: [
      {
        name: 'user',
        description: 'The user to check',
        type: 6, // USER type
        required: true,
      },
    ],
    contexts: [0],
    integration_types: [0],
  },
  {
    name: 'refreshauctions',
    description: 'Re-render every currently open auction embed with the latest format (admin only)',
    contexts: [0],
    integration_types: [0],
  },
  {
    name: 'fixstat',
    description: 'Correct a missed stat or wrong rarity on a graded item and update the card (admin only)',
    options: [
      {
        name: 'message',
        description: 'The grade card message link or ID',
        type: 3,
        required: true,
      },
      {
        name: 'stat',
        description: 'The stat to correct (optional if only fixing rarity)',
        type: 3,
        required: false,
        autocomplete: true,
      },
      {
        name: 'value',
        description: 'The correct roll value (required if correcting a stat)',
        type: 4, // INTEGER
        required: false,
      },
      {
        name: 'rarity',
        description: 'Correct the item rarity (e.g. if the color was misread)',
        type: 3,
        required: false,
        choices: [
          { name: 'Green', value: 'green' },
          { name: 'Blue', value: 'blue' },
          { name: 'Blue Set', value: 'blueSet' },
          { name: 'Yellow', value: 'yellow' },
          { name: 'Orange', value: 'orange' },
          { name: 'Pink', value: 'pink' },
        ],
      },
      {
        name: 'max',
        description: 'Optional max value for this stat (leave blank if unknown)',
        type: 4,
        required: false,
      },
    ],
    contexts: [0],
    integration_types: [0],
  },
  {
    name: 'vouchcard',
    description: 'Create your trading reputation card so others can rate deals with you',
    options: [
      {
        name: 'user',
        description: 'Create a card for this user instead (admin only)',
        type: 6, // USER type
        required: false,
      },
    ],
    contexts: [0],
    integration_types: [0],
  },
  {
    name: 'topvouched',
    description: 'See the most trusted traders in the server',
    contexts: [0],
    integration_types: [0],
  },
  {
    name: 'mytrades',
    description: 'See your trade ratings and reviews',
    contexts: [0],
    integration_types: [0],
  },
  {
    name: 'myauctions',
    description: 'See your active auction listings and any you\'re currently winning',
    contexts: [0],
    integration_types: [0],
  },
  {
    name: 'wtb',
    description: 'Post a Want To Buy listing for an item you\'re looking for',
    contexts: [0],
    integration_types: [0],
  },
];

const url = GUILD_ID
  ? `https://discord.com/api/v10/applications/${APP_ID}/guilds/${GUILD_ID}/commands`
  : `https://discord.com/api/v10/applications/${APP_ID}/commands`;

const res = await fetch(url, {
  method: 'PUT',
  headers: {
    'Authorization': `Bot ${TOKEN}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(commands),
});

if (res.ok) {
  const data = await res.json();
  console.log(`Registered ${data.length} commands ${GUILD_ID ? `to guild ${GUILD_ID}` : 'globally'}.`);
  data.forEach(c => {
    const opts = c.options?.map(o => o.name + (o.autocomplete ? ' (autocomplete)' : '')).join(', ') || 'none';
    console.log(`  /${c.name} — options: ${opts}`);
  });
} else {
  console.error('Failed:', res.status, await res.text());
}
