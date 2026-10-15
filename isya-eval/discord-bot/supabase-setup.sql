-- Discord bot grade storage + leaderboard
-- Run in Supabase SQL Editor.

create table discord_grades (
  id uuid primary key default gen_random_uuid(),
  discord_user_id text,
  discord_tag text,
  item_name text,
  item_type text,
  rarity text,
  required_level integer,
  stat_system integer,
  overall_grade text,
  overall_pct integer,
  power_score integer,
  enhanced boolean default false,
  created_at timestamptz default now()
);

alter table discord_grades enable row level security;

-- The bot uses the anon key, so allow anon insert + read on this table only.
create policy "Anyone can submit a discord grade" on discord_grades
  for insert to anon with check (true);

create policy "Anyone can read the discord leaderboard" on discord_grades
  for select to anon using (true);
