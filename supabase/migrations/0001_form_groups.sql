-- FORM · group sync schema
-- Run once in the Supabase dashboard (SQL Editor → New query → paste → Run),
-- or with the Supabase CLI: `supabase db push`.
--
-- Privacy is enforced here, not just in the app:
--   sharing = 'everything'  → group-mates can read your sessions and challenge totals
--   sharing = 'challenges'  → group-mates can read only your challenge totals
--   sharing = 'private'     → group-mates see your name only
-- show_on_leaderboards = false also hides your challenge totals from others.

-- ---------- tables ----------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 40),
  color text not null default '#1F4B39' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  sharing text not null default 'everything' check (sharing in ('everything', 'challenges', 'private')),
  show_on_leaderboards boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  invite_code text not null unique check (invite_code ~ '^[A-Z0-9]{6}$'),
  owner_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index if not exists group_members_user_idx on public.group_members (user_id);

create table if not exists public.challenges (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 60),
  exercise_id text not null,
  metric text not null check (metric in ('reps', 'sets', 'volume', 'distance', 'duration')),
  start_date date not null,
  end_date date not null,
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);
create index if not exists challenges_group_idx on public.challenges (group_id);

-- Sessions are only uploaded by people who share everything (the app deletes them otherwise).
create table if not exists public.activity_sessions (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  date date not null,
  performed_at timestamptz not null,
  category text not null check (category in ('strength', 'cardio', 'bodyweight')),
  entries jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists activity_sessions_user_date_idx on public.activity_sessions (user_id, date);

-- Each member's own total per challenge, computed on their device from their saved sessions.
create table if not exists public.challenge_totals (
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  value double precision not null check (value >= 0),
  updated_at timestamptz not null default now(),
  primary key (challenge_id, user_id)
);

-- ---------- helpers (security definer so policies don't recurse) ----------

create or replace function public.is_group_member(g uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.group_members where group_id = g and user_id = auth.uid());
$$;

create or replace function public.shares_group_with(other uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.group_members a
    join public.group_members b on a.group_id = b.group_id
    where a.user_id = auth.uid() and b.user_id = other
  );
$$;

create or replace function public.sharing_of(person uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select sharing from public.profiles where id = person), 'private');
$$;

create or replace function public.on_leaderboards(person uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select sharing <> 'private' and show_on_leaderboards from public.profiles where id = person), false);
$$;

-- ---------- row level security ----------

alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.challenges enable row level security;
alter table public.activity_sessions enable row level security;
alter table public.challenge_totals enable row level security;

drop policy if exists "profiles: self and group-mates read" on public.profiles;
create policy "profiles: self and group-mates read" on public.profiles
  for select using (id = auth.uid() or public.shares_group_with(id));
drop policy if exists "profiles: insert self" on public.profiles;
create policy "profiles: insert self" on public.profiles for insert with check (id = auth.uid());
drop policy if exists "profiles: update self" on public.profiles;
create policy "profiles: update self" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "groups: members read" on public.groups;
create policy "groups: members read" on public.groups for select using (public.is_group_member(id));
drop policy if exists "groups: owner renames" on public.groups;
create policy "groups: owner renames" on public.groups
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "groups: owner deletes" on public.groups;
create policy "groups: owner deletes" on public.groups for delete using (owner_id = auth.uid());
-- Groups are created and joined through create_group() / join_group() below.

drop policy if exists "members: co-members read" on public.group_members;
create policy "members: co-members read" on public.group_members for select using (public.is_group_member(group_id));
drop policy if exists "members: leave or owner removes" on public.group_members;
create policy "members: leave or owner removes" on public.group_members
  for delete using (
    user_id = auth.uid()
    or exists (select 1 from public.groups g where g.id = group_id and g.owner_id = auth.uid())
  );

drop policy if exists "challenges: members read" on public.challenges;
create policy "challenges: members read" on public.challenges for select using (public.is_group_member(group_id));
drop policy if exists "challenges: members create" on public.challenges;
create policy "challenges: members create" on public.challenges
  for insert with check (public.is_group_member(group_id) and created_by = auth.uid());
drop policy if exists "challenges: creator or owner deletes" on public.challenges;
create policy "challenges: creator or owner deletes" on public.challenges
  for delete using (
    created_by = auth.uid()
    or exists (select 1 from public.groups g where g.id = group_id and g.owner_id = auth.uid())
  );

drop policy if exists "sessions: own rows" on public.activity_sessions;
create policy "sessions: own rows" on public.activity_sessions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid() and public.sharing_of(auth.uid()) = 'everything');
drop policy if exists "sessions: group-mates who share everything" on public.activity_sessions;
create policy "sessions: group-mates who share everything" on public.activity_sessions
  for select using (public.shares_group_with(user_id) and public.sharing_of(user_id) = 'everything');

drop policy if exists "totals: read" on public.challenge_totals;
create policy "totals: read" on public.challenge_totals
  for select using (
    user_id = auth.uid()
    or (
      public.on_leaderboards(user_id)
      and exists (select 1 from public.challenges c where c.id = challenge_id and public.is_group_member(c.group_id))
    )
  );
drop policy if exists "totals: write own" on public.challenge_totals;
create policy "totals: write own" on public.challenge_totals
  for insert with check (
    user_id = auth.uid()
    and exists (select 1 from public.challenges c where c.id = challenge_id and public.is_group_member(c.group_id))
  );
drop policy if exists "totals: update own" on public.challenge_totals;
create policy "totals: update own" on public.challenge_totals
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "totals: delete own" on public.challenge_totals;
create policy "totals: delete own" on public.challenge_totals for delete using (user_id = auth.uid());

-- ---------- group functions ----------

create or replace function public.new_invite_code()
returns text language plpgsql volatile set search_path = public as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text;
begin
  loop
    select string_agg(substr(alphabet, 1 + floor(random() * 32)::int, 1), '') into code from generate_series(1, 6);
    exit when not exists (select 1 from public.groups where invite_code = code);
  end loop;
  return code;
end $$;

create or replace function public.create_group(p_name text)
returns public.groups language plpgsql security definer set search_path = public as $$
declare g public.groups;
begin
  if auth.uid() is null then raise exception 'Not signed in' using errcode = '28000'; end if;
  insert into public.groups (name, invite_code, owner_id)
    values (trim(p_name), public.new_invite_code(), auth.uid()) returning * into g;
  insert into public.group_members (group_id, user_id) values (g.id, auth.uid());
  return g;
end $$;

create or replace function public.join_group(p_code text)
returns public.groups language plpgsql security definer set search_path = public as $$
declare g public.groups;
begin
  if auth.uid() is null then raise exception 'Not signed in' using errcode = '28000'; end if;
  select * into g from public.groups where invite_code = upper(trim(p_code));
  if g.id is null then raise exception 'No group with that invite code' using errcode = 'P0002'; end if;
  insert into public.group_members (group_id, user_id) values (g.id, auth.uid()) on conflict do nothing;
  return g;
end $$;

create or replace function public.regenerate_invite(p_group uuid)
returns text language plpgsql security definer set search_path = public as $$
declare code text;
begin
  if not exists (select 1 from public.groups where id = p_group and owner_id = auth.uid()) then
    raise exception 'Only the group owner can change the invite code' using errcode = '42501';
  end if;
  code := public.new_invite_code();
  update public.groups set invite_code = code where id = p_group;
  return code;
end $$;

revoke execute on function public.create_group(text), public.join_group(text), public.regenerate_invite(uuid) from anon, public;
grant execute on function public.create_group(text), public.join_group(text), public.regenerate_invite(uuid) to authenticated;
