// clear-global-commands.js
// One-off: wipes ALL globally-registered slash commands for this app.
// Needed because guild-scoped registration (DISCORD_GUILD_ID set) and
// global registration (no DISCORD_GUILD_ID) are two completely separate
// command lists in Discord's API — updating one never touches the other.
// If a command was ever registered globally in the past, it keeps showing
// up alongside the guild-scoped version forever until explicitly cleared.
//
// This does NOT touch your guild-scoped commands (registered via
// register-commands.js with DISCORD_GUILD_ID set) — only the global ones.
//
// RUN:
//   $env:DISCORD_APP_ID="..."
//   $env:DISCORD_BOT_TOKEN="..."
//   node clear-global-commands.js

const APP_ID = process.env.DISCORD_APP_ID;
const TOKEN = process.env.DISCORD_BOT_TOKEN;

if (!APP_ID || !TOKEN) {
  console.error('Set DISCORD_APP_ID and DISCORD_BOT_TOKEN first.');
  process.exit(1);
}

const url = `https://discord.com/api/v10/applications/${APP_ID}/commands`;

const res = await fetch(url, {
  method: 'PUT',
  headers: {
    'Authorization': `Bot ${TOKEN}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify([]), // empty array = wipe all global commands
});

if (res.ok) {
  console.log('Cleared all global commands. Your guild-scoped commands (registered with DISCORD_GUILD_ID) are untouched.');
  console.log('Note: it can take a few minutes for Discord clients to stop showing the old duplicates in the command picker cache.');
} else {
  console.error('Failed:', res.status, await res.text());
}
