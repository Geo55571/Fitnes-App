// Runs the FORM migration on PGlite (Postgres in-process) with a stubbed Supabase auth schema, then checks RLS as different users.
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';

const db = new PGlite();
let failures = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? '  ✓' : '  ✗'} ${msg}`);
  if (!cond) failures++;
};

await db.exec(`
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  create role anon nologin;
  create role authenticated nologin;
  grant usage on schema auth to authenticated, anon;
  grant execute on function auth.uid() to authenticated, anon;
`);
await db.exec(fs.readFileSync(new URL('../migrations/0001_form_groups.sql', import.meta.url), 'utf8'));
await db.exec(`
  grant usage on schema public to authenticated;
  grant select, insert, update, delete on all tables in schema public to authenticated;
`);

const A = '00000000-0000-0000-0000-00000000000a';
const B = '00000000-0000-0000-0000-00000000000b';
const C = '00000000-0000-0000-0000-00000000000c';
await db.exec(`insert into auth.users values ('${A}'), ('${B}'), ('${C}');`);

/** Runs `sql` as user `uid` under the authenticated role (RLS applies). */
async function as(uid, sql, params = []) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
  try {
    return { rows: (await db.query(sql, params)).rows };
  } catch (e) {
    return { error: e.message };
  } finally {
    await db.exec('reset role;');
  }
}

// Profiles: A shares everything, B challenges only, C everything (but not in the group).
ok(!(await as(A, `insert into profiles (id, display_name, sharing) values ($1, 'Ana', 'everything')`, [A])).error, 'A creates own profile');
ok(!(await as(B, `insert into profiles (id, display_name, sharing) values ($1, 'Ben', 'challenges')`, [B])).error, 'B creates own profile');
ok(!(await as(C, `insert into profiles (id, display_name) values ($1, 'Cleo')`, [C])).error, 'C creates own profile');
ok(!!(await as(C, `insert into profiles (id, display_name) values ($1, 'Fake')`, [A])).error, 'C cannot create a profile for A');

const g = await as(A, `select * from create_group('Morning crew')`);
ok(!g.error && /^[A-Z0-9]{6}$/.test(g.rows[0].invite_code), `A creates a group with code ${g.rows?.[0]?.invite_code}`);
const gid = g.rows[0].id;
const code = g.rows[0].invite_code;

ok((await as(B, `select * from groups`)).rows.length === 0, 'B cannot see the group before joining');
ok((await as(B, `select * from profiles where id = $1`, [A])).rows.length === 0, 'B cannot see A before sharing a group');
const j = await as(B, `select * from join_group($1)`, [code.toLowerCase()]);
ok(!j.error && j.rows[0].id === gid, 'B joins with the invite code (case-insensitive)');
ok(!!(await as(B, `select * from join_group('ZZZZZZ')`)).error, 'unknown code is rejected');
ok((await as(B, `select display_name from profiles where id = $1`, [A])).rows[0]?.display_name === 'Ana', 'B now sees A’s name');
ok((await as(C, `select * from profiles where id in ($1, $2)`, [A, B])).rows.length === 0, 'C (outsider) sees neither A nor B');
ok((await as(A, `select user_id from group_members where group_id = $1`, [gid])).rows.length === 2, 'A sees both members');

// Sessions: only "everything" sharers can upload; group-mates can read them; outsiders can't.
const entries = JSON.stringify([{ exerciseId: 'pushups', sets: [{ reps: 10 }] }]);
ok(!(await as(A, `insert into activity_sessions (id, date, performed_at, category, entries) values ('s1', '2026-09-30', now(), 'bodyweight', $1)`, [entries])).error, 'A (shares everything) uploads a session');
ok(!!(await as(B, `insert into activity_sessions (id, date, performed_at, category, entries) values ('s1', '2026-09-30', now(), 'bodyweight', $1)`, [entries])).error, 'B (challenges only) cannot upload sessions');
ok((await as(B, `select * from activity_sessions where user_id = $1`, [A])).rows.length === 1, 'B reads A’s session');
ok((await as(C, `select * from activity_sessions`)).rows.length === 0, 'C reads no sessions');
ok(!!(await as(B, `update activity_sessions set category = 'cardio' where user_id = $1`, [A])).error === false &&
   (await as(A, `select category from activity_sessions where id = 's1'`)).rows[0].category === 'bodyweight', 'B cannot modify A’s session');

// Challenges and totals.
const ch = await as(B, `insert into challenges (group_id, title, exercise_id, metric, start_date, end_date) values ($1, 'Push-ups', 'pushups', 'reps', '2026-09-28', '2026-10-04') returning id`, [gid]);
ok(!ch.error, 'a member creates a challenge');
const cid = ch.rows[0].id;
ok(!!(await as(C, `insert into challenges (group_id, title, exercise_id, metric, start_date, end_date) values ($1, 'X', 'pushups', 'reps', '2026-09-28', '2026-10-04')`, [gid])).error, 'an outsider cannot create a challenge');
ok(!(await as(A, `insert into challenge_totals (challenge_id, value) values ($1, 40)`, [cid])).error, 'A posts a total');
ok(!(await as(B, `insert into challenge_totals (challenge_id, value) values ($1, 25)`, [cid])).error, 'B posts a total');
ok(!!(await as(C, `insert into challenge_totals (challenge_id, value) values ($1, 99)`, [cid])).error, 'C cannot post into a group they’re not in');
ok((await as(A, `select user_id, value from challenge_totals where challenge_id = $1`, [cid])).rows.length === 2, 'A sees both totals');

// Privacy changes take effect server-side.
await as(B, `update profiles set show_on_leaderboards = false where id = $1`, [B]);
ok((await as(A, `select * from challenge_totals where user_id = $1`, [B])).rows.length === 0, 'B hidden from leaderboards → A no longer sees B’s total');
ok((await as(B, `select * from challenge_totals where user_id = $1`, [B])).rows.length === 1, '…but B still sees their own');
await as(A, `update profiles set sharing = 'challenges' where id = $1`, [A]);
ok((await as(B, `select * from activity_sessions where user_id = $1`, [A])).rows.length === 0, 'A switches to challenges-only → B can’t read A’s sessions');
ok(!(await as(A, `delete from activity_sessions where user_id = $1`, [A])).error, 'A can still delete own uploaded sessions');

// Leaving / ownership.
ok(!!(await as(B, `select regenerate_invite($1)`, [gid])).error, 'only the owner can regenerate the invite');
ok(!(await as(A, `select regenerate_invite($1)`, [gid])).error, 'the owner regenerates the invite');
ok(!(await as(B, `delete from group_members where group_id = $1 and user_id = $2`, [gid, B])).error, 'B leaves the group');
ok((await as(B, `select * from groups`)).rows.length === 0, 'after leaving, B no longer sees the group');
ok((await as(B, `select * from profiles where id = $1`, [A])).rows.length === 0, '…nor A’s profile');

console.log(failures ? `\n${failures} FAILED` : '\nall checks passed');
process.exit(failures ? 1 : 0);
