# Isya Companion — Discord Gear Grader Bot

A Discord bot that grades Fiesta Online gear from a tooltip screenshot,
using the same database and grading logic as your app. Runs entirely on
a Cloudflare Worker (no server to keep alive).

## What it does
- `/grade [image]` — user attaches a tooltip screenshot, bot replies with
  a graded embed (overall roll %, letter grade, Power Score, per-stat bars,
  enhancement detection).
- `/leaderboard` — top 10 graded items by Power Score across your server.
- Every grade is saved to Supabase (`discord_grades` table).

## Files
- `bot-worker.js` — the Cloudflare Worker (Discord interaction handler).
- `grading-core.js` — shared database + grading logic, imported by the worker.
- `register-commands.js` — one-time script to register the slash commands.
- `supabase-setup.sql` — creates the storage table.
- `wrangler.toml` — Cloudflare config.

---

## Setup (about 20 minutes)

### 1. Create the Discord application
1. Go to https://discord.com/developers/applications → **New Application**.
2. Name it "Isya Gear Grader" (or anything).
3. On the **General Information** page, copy:
   - **Application ID** → this is `DISCORD_APP_ID`
   - **Public Key** → this is `DISCORD_PUBLIC_KEY`
4. Go to the **Bot** tab → **Reset Token** → copy it → this is `DISCORD_BOT_TOKEN`.
   (Keep this secret — anyone with it controls your bot.)

### 2. Set up Supabase storage
1. In your Supabase dashboard → SQL Editor → run `supabase-setup.sql`.
   This creates the `discord_grades` table with anon insert/read policies.

### 3. Deploy the Worker
From the `discord-bot/` folder, with Wrangler installed (`npm i -g wrangler`):

```bash
wrangler login
wrangler secret put DISCORD_PUBLIC_KEY     # paste the public key
wrangler secret put DISCORD_APP_ID         # paste the application id
wrangler secret put DISCORD_BOT_TOKEN      # paste the bot token
wrangler secret put PARSE_WORKER_URL       # https://late-leaf-cdaf.nchens.workers.dev
wrangler secret put SUPABASE_URL           # https://<your-project-ref>.supabase.co
wrangler secret put SUPABASE_ANON_KEY      # your anon key
wrangler deploy
```

Wrangler prints a URL like `https://isya-grader-bot.<you>.workers.dev`. Copy it.

### 4. Point Discord at the Worker
1. Back in the Developer Portal → **General Information**.
2. Set **Interactions Endpoint URL** to your Worker URL from step 3.
3. Click **Save**. Discord sends a test ping — if the Worker verifies it,
   it saves successfully. (If it fails, the public key secret is wrong.)

### 5. Register the slash commands
Set the env vars in your shell and run the script once:

```bash
export DISCORD_APP_ID=...        # same app id
export DISCORD_BOT_TOKEN=...     # same bot token
export DISCORD_GUILD_ID=...      # your server id (optional, for instant testing)
node register-commands.js
```

With `DISCORD_GUILD_ID` set, commands appear in that server instantly.
Without it, they register globally and take up to an hour.

### 6. Invite the bot to your server
1. Developer Portal → **OAuth2** → **URL Generator**.
2. Scopes: check **applications.commands** (and **bot** if you want it to
   show in the member list).
3. Open the generated URL, pick your server, authorize.

Done. Type `/grade` and attach a tooltip screenshot.

---

## How it works
1. User runs `/grade` with an image. Discord calls your Worker.
2. The Worker verifies the request signature, then **defers** the reply
   (Discord shows "thinking…"). This is required because image parsing
   takes longer than Discord's 3-second initial-response limit.
3. The Worker downloads the image, sends it to your existing parser worker
   (`PARSE_WORKER_URL`), gets back the same JSON your app uses.
4. `grading-core.js` grades it — identical DB and math to the app.
5. The Worker edits the deferred reply with a result embed and saves to Supabase.

## Keeping the bot and app in sync
`grading-core.js` is a direct extract of the grading logic from `GearGrader.js`.
When you update the database in the app (new gear, corrected values), copy the
same change into `grading-core.js` and `wrangler deploy` again so both stay
identical. (A future improvement would be a single shared file both import,
but for now they're two copies of the same data.)

## Limitations
- Enhanced armor stats show "roll hidden" in Discord too — same honest
  limitation as the app (the base roll isn't visible on the tooltip).
- The bot relies on your parser worker and its Anthropic key for OCR, so
  it shares that rate limit.
- Grades save under the user's Discord ID, separate from app accounts.
