-- ============================================================
--  Proposal & COB Tracking — Supabase schema
--  Run this once in Supabase → SQL Editor, top to bottom.
-- ============================================================

-- ---------- entries: proposals received / COB updates ----------
create table entries (
  id text primary key,
  date date not null,
  type text not null,                 -- 'received' | 'updated' | 'blockout' | 'scopemeeting'
  sub_name text,
  division text,
  scope text,
  reviewer text,
  sent_to_ownership boolean default false,
  follow_up_complete boolean default false,
  notes text default '',
  linked_meeting_id text,
  created_by text,
  last_edited_by text,
  created_at timestamptz default now()
);

-- ---------- meetings: the time-slotted calendar blocks ----------
create table meetings (
  id text primary key,
  date date not null,
  type text not null,
  sub_name text,
  division text,
  scope text,
  reviewer text,
  start_minutes int not null default 540,  -- minutes from midnight, 540 = 9:00 AM
  duration int not null default 60,
  entry_id text references entries(id) on delete set null,
  created_by text,
  last_edited_by text,
  created_at timestamptz default now()
);

-- ---------- custom companies added from the directory ----------
create table custom_companies (
  id bigint generated always as identity primary key,
  division text,
  scope text,
  name text,
  reviewer text,
  created_by text,
  created_at timestamptz default now()
);

-- ---------- which company is "leading" a scope of work ----------
create table leader_selections (
  scope_key text primary key,   -- format: "division|||scope"
  sub_name text,
  picked_by text,
  updated_at timestamptz default now()
);

-- ---------- which company was ultimately awarded a scope ----------
create table awarded_selections (
  scope_key text primary key,
  sub_name text,
  awarded_by text,
  updated_at timestamptz default now()
);

-- ============================================================
--  Row Level Security
--  These policies allow anyone with the anon key (i.e. anyone
--  who opens the site) to read and write. This matches the
--  original app's "anyone with the link can edit" behavior.
--  Tighten these later if you want to restrict access (see notes
--  at the bottom of this file).
-- ============================================================
alter table entries enable row level security;
create policy "public read entries" on entries for select using (true);
create policy "public write entries" on entries for insert with check (true);
create policy "public update entries" on entries for update using (true);
create policy "public delete entries" on entries for delete using (true);

alter table meetings enable row level security;
create policy "public read meetings" on meetings for select using (true);
create policy "public write meetings" on meetings for insert with check (true);
create policy "public update meetings" on meetings for update using (true);
create policy "public delete meetings" on meetings for delete using (true);

alter table custom_companies enable row level security;
create policy "public read companies" on custom_companies for select using (true);
create policy "public write companies" on custom_companies for insert with check (true);

alter table leader_selections enable row level security;
create policy "public read leaders" on leader_selections for select using (true);
create policy "public write leaders" on leader_selections for insert with check (true);
create policy "public update leaders" on leader_selections for update using (true);

alter table awarded_selections enable row level security;
create policy "public read awarded" on awarded_selections for select using (true);
create policy "public write awarded" on awarded_selections for insert with check (true);
create policy "public update awarded" on awarded_selections for update using (true);
create policy "public delete awarded" on awarded_selections for delete using (true);

-- ============================================================
--  Realtime — turn on change broadcasting for every table the
--  app subscribes to. (Presence for "who's online" doesn't need
--  a table — it's handled by Supabase's separate Presence channel.)
-- ============================================================
alter publication supabase_realtime add table entries;
alter publication supabase_realtime add table meetings;
alter publication supabase_realtime add table custom_companies;
alter publication supabase_realtime add table leader_selections;
alter publication supabase_realtime add table awarded_selections;

-- ============================================================
--  Notes on tightening access later
-- ============================================================
-- Option A — shared passphrase:
--   Add a `team_code text` column to each table (or a separate settings
--   table), and change the RLS policies' `using (true)` to check a code
--   passed via a Postgres session variable set from the client.
--
-- Option B — real accounts:
--   Enable Supabase Auth (magic link email is simplest), then change
--   policies to `using (auth.uid() is not null)` so only signed-in users
--   can read/write. You'd add a sign-in screen in place of (or before)
--   the name gate.
