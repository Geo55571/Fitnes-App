/**
 * FORM sync server: accounts (name + password, no email), groups with invite codes, challenges,
 * challenge totals and the workouts members choose to share.
 *
 * One Durable Object with SQLite storage holds everything. Every request is
 *   POST /   { op, args }   with   Authorization: Bearer <token>   (except signup / login)
 * and answers { ok: true, data } or { ok: false, error }.
 *
 * Privacy is enforced here, not only in the app: you can read profiles, totals and workouts
 * only of people you share a group with, and workouts only of those who share "everything".
 */
import { DurableObject } from 'cloudflare:workers';

interface Env {
  STORE: DurableObjectNamespace<SyncStore>;
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-max-age': '86400',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...CORS } });

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (req.method !== 'POST') return json({ ok: false, error: 'POST only' }, 405);
    return env.STORE.get(env.STORE.idFromName('main')).fetch(req);
  },
};

class ApiError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

type Row = Record<string, string | number | null>;

const hex = (buf: ArrayBuffer | Uint8Array) => [...new Uint8Array(buf as ArrayBuffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
const randomHex = (bytes: number) => hex(crypto.getRandomValues(new Uint8Array(bytes)));
const sha256 = async (s: string) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));

async function hashPassword(password: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: 100_000 }, key, 256));
}

/** Names are unique without regard to case or extra spaces. */
const nameKey = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();
const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const inviteCode = () => [...crypto.getRandomValues(new Uint8Array(6))].map((b) => INVITE_ALPHABET[b % INVITE_ALPHABET.length]).join('');
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const str = (v: unknown, max: number, what: string): string => {
  if (typeof v !== 'string' || !v.trim() || v.length > max) throw new ApiError(`Invalid ${what}.`);
  return v.trim();
};
const strings = (v: unknown, max = 500): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, max) : []);

const MAX_FAILS = 8;
const FAIL_WINDOW_MS = 10 * 60_000;

export class SyncStore extends DurableObject<Env> {
  private sql: SqlStorage;
  /** Failed logins per name, to slow down password guessing. */
  private fails = new Map<string, number[]>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, name_key TEXT NOT NULL UNIQUE, salt TEXT NOT NULL, hash TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS tokens (hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS profiles (id TEXT PRIMARY KEY, display_name TEXT NOT NULL, color TEXT NOT NULL, sharing TEXT NOT NULL, show_on_leaderboards INTEGER NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS groups (id TEXT PRIMARY KEY, name TEXT NOT NULL, invite_code TEXT NOT NULL UNIQUE, owner_id TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS group_members (group_id TEXT NOT NULL, user_id TEXT NOT NULL, joined_at TEXT NOT NULL, PRIMARY KEY (group_id, user_id));
      CREATE INDEX IF NOT EXISTS members_by_user ON group_members (user_id);
      CREATE TABLE IF NOT EXISTS challenges (id TEXT PRIMARY KEY, group_id TEXT NOT NULL, title TEXT NOT NULL, exercise_id TEXT NOT NULL, metric TEXT NOT NULL, start_date TEXT NOT NULL, end_date TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS challenges_by_group ON challenges (group_id);
      CREATE TABLE IF NOT EXISTS challenge_totals (challenge_id TEXT NOT NULL, user_id TEXT NOT NULL, value REAL NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (challenge_id, user_id));
      CREATE TABLE IF NOT EXISTS sessions (user_id TEXT NOT NULL, id TEXT NOT NULL, date TEXT NOT NULL, performed_at TEXT NOT NULL, category TEXT NOT NULL, entries TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (user_id, id));
      CREATE TABLE IF NOT EXISTS arc_days (user_id TEXT NOT NULL, date TEXT NOT NULL, done INTEGER NOT NULL, total INTEGER NOT NULL, complete INTEGER NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (user_id, date));
    `);
  }

  private all<T = Row>(query: string, ...params: (string | number | null)[]): T[] {
    return this.sql.exec(query, ...params).toArray() as T[];
  }
  private one<T = Row>(query: string, ...params: (string | number | null)[]): T | null {
    return this.all<T>(query, ...params)[0] ?? null;
  }
  private run(query: string, ...params: (string | number | null)[]) {
    this.sql.exec(query, ...params);
  }
  /** "?, ?, ?" for an IN (...) list. */
  private marks = (n: number) => Array(n).fill('?').join(', ');

  async fetch(req: Request): Promise<Response> {
    try {
      const body = (await req.json().catch(() => null)) as { op?: string; args?: Record<string, unknown> } | null;
      if (!body || typeof body.op !== 'string') throw new ApiError('Bad request.');
      const args = body.args ?? {};
      if (body.op === 'signup') return json({ ok: true, data: await this.signup(args) });
      if (body.op === 'login') return json({ ok: true, data: await this.login(args) });

      const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
      const session = token ? this.one<{ user_id: string }>('SELECT user_id FROM tokens WHERE hash = ?', await sha256(token)) : null;
      if (!session) throw new ApiError('Please log in again.', 401);
      const me = session.user_id;
      if (body.op === 'logout') {
        this.run('DELETE FROM tokens WHERE hash = ?', await sha256(token));
        return json({ ok: true, data: null });
      }
      return json({ ok: true, data: await this.handle(body.op, args, me) });
    } catch (e) {
      if (e instanceof ApiError) return json({ ok: false, error: e.message }, e.status);
      console.error(e);
      return json({ ok: false, error: 'Server error.' }, 500);
    }
  }

  // ---------- accounts ----------

  private async issueToken(userId: string): Promise<string> {
    const token = randomHex(32);
    this.run('INSERT INTO tokens (hash, user_id, created_at) VALUES (?, ?, ?)', await sha256(token), userId, new Date().toISOString());
    return token;
  }

  private async signup(args: Record<string, unknown>) {
    const name = String(args.name ?? '').trim().replace(/\s+/g, ' ');
    const password = String(args.password ?? '');
    if (name.length < 2 || name.length > 24) throw new ApiError('Use a name with 2 to 24 characters.');
    if (!/^[\p{L}\p{N} ._-]+$/u.test(name)) throw new ApiError('Names can have letters, numbers, spaces, dots, dashes and underscores.');
    if (password.length < 6 || password.length > 200) throw new ApiError('Use at least 6 characters for the password.');
    if (this.one('SELECT id FROM users WHERE name_key = ?', nameKey(name))) throw new ApiError('That name is taken. Pick another, or log in if it’s yours.', 409);
    const id = crypto.randomUUID();
    const salt = randomHex(16);
    const now = new Date().toISOString();
    this.run('INSERT INTO users (id, name, name_key, salt, hash, created_at) VALUES (?, ?, ?, ?, ?, ?)', id, name, nameKey(name), salt, await hashPassword(password, salt), now);
    this.run('INSERT INTO profiles (id, display_name, color, sharing, show_on_leaderboards, updated_at) VALUES (?, ?, ?, ?, ?, ?)', id, name, '#1F4B39', 'challenges', 1, now);
    return { token: await this.issueToken(id), userId: id, name };
  }

  private async login(args: Record<string, unknown>) {
    const key = nameKey(String(args.name ?? ''));
    const password = String(args.password ?? '');
    const now = Date.now();
    const recent = (this.fails.get(key) ?? []).filter((t) => now - t < FAIL_WINDOW_MS);
    if (recent.length >= MAX_FAILS) throw new ApiError('Too many attempts. Wait a few minutes and try again.', 429);
    const user = this.one<{ id: string; name: string; salt: string; hash: string }>('SELECT id, name, salt, hash FROM users WHERE name_key = ?', key);
    // Hash even when the name is unknown, so both cases take the same time.
    const hash = await hashPassword(password, user?.salt ?? 'no-such-user');
    if (!user || hash !== user.hash) {
      this.fails.set(key, [...recent, now]);
      throw new ApiError('Wrong name or password.', 401);
    }
    this.fails.delete(key);
    return { token: await this.issueToken(user.id), userId: user.id, name: user.name };
  }

  // ---------- helpers ----------

  private myGroupIds(me: string): string[] {
    return this.all<{ group_id: string }>('SELECT group_id FROM group_members WHERE user_id = ?', me).map((r) => r.group_id);
  }
  /** Everyone I share a group with (including me). */
  private mates(me: string): Set<string> {
    const rows = this.all<{ user_id: string }>('SELECT DISTINCT user_id FROM group_members WHERE group_id IN (SELECT group_id FROM group_members WHERE user_id = ?)', me);
    return new Set([me, ...rows.map((r) => r.user_id)]);
  }
  private groupRow(id: string) {
    const g = this.one<{ id: string; name: string; invite_code: string; owner_id: string; created_at: string }>('SELECT id, name, invite_code, owner_id, created_at FROM groups WHERE id = ?', id);
    if (!g) throw new ApiError('That group no longer exists.', 404);
    return {
      ...g,
      member_ids: this.all<{ user_id: string }>('SELECT user_id FROM group_members WHERE group_id = ? ORDER BY joined_at', id).map((r) => r.user_id),
      challenges: this.all('SELECT id, group_id, title, exercise_id, metric, start_date, end_date, created_at FROM challenges WHERE group_id = ? ORDER BY created_at', id),
    };
  }
  private requireMember(groupId: string, me: string) {
    if (!this.one('SELECT 1 AS x FROM group_members WHERE group_id = ? AND user_id = ?', groupId, me)) throw new ApiError('You’re not a member of that group.', 403);
  }
  private requireOwner(groupId: string, me: string) {
    const g = this.one<{ owner_id: string }>('SELECT owner_id FROM groups WHERE id = ?', groupId);
    if (!g) throw new ApiError('That group no longer exists.', 404);
    if (g.owner_id !== me) throw new ApiError('Only the group’s owner can do that.', 403);
  }
  private newInviteCode(): string {
    for (;;) {
      const code = inviteCode();
      if (!this.one('SELECT 1 AS x FROM groups WHERE invite_code = ?', code)) return code;
    }
  }
  private removeGroup(groupId: string) {
    this.run('DELETE FROM challenge_totals WHERE challenge_id IN (SELECT id FROM challenges WHERE group_id = ?)', groupId);
    this.run('DELETE FROM challenges WHERE group_id = ?', groupId);
    this.run('DELETE FROM group_members WHERE group_id = ?', groupId);
    this.run('DELETE FROM groups WHERE id = ?', groupId);
  }

  // ---------- operations ----------

  private async handle(op: string, a: Record<string, unknown>, me: string): Promise<unknown> {
    const now = new Date().toISOString();
    switch (op) {
      case 'me': {
        const u = this.one<{ id: string; name: string }>('SELECT id, name FROM users WHERE id = ?', me);
        if (!u) throw new ApiError('Please log in again.', 401);
        return { userId: u.id, name: u.name };
      }
      case 'deleteAccount': {
        for (const g of this.all<{ id: string }>('SELECT id FROM groups WHERE owner_id = ?', me)) this.leave(g.id, me);
        for (const id of this.myGroupIds(me)) this.leave(id, me);
        for (const t of ['sessions', 'challenge_totals', 'tokens', 'arc_days']) this.run(`DELETE FROM ${t} WHERE user_id = ?`, me);
        this.run('DELETE FROM profiles WHERE id = ?', me);
        this.run('DELETE FROM users WHERE id = ?', me);
        return null;
      }
      case 'upsertProfile': {
        const p = a.profile as Record<string, unknown>;
        const sharing = ['everything', 'challenges', 'private'].includes(p?.sharing as string) ? (p.sharing as string) : 'challenges';
        const color = /^#[0-9A-Fa-f]{6}$/.test(String(p?.color)) ? String(p.color) : '#1F4B39';
        this.run(
          `INSERT INTO profiles (id, display_name, color, sharing, show_on_leaderboards, updated_at) VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT (id) DO UPDATE SET display_name = excluded.display_name, color = excluded.color, sharing = excluded.sharing, show_on_leaderboards = excluded.show_on_leaderboards, updated_at = excluded.updated_at`,
          me,
          String(p?.display_name ?? '').slice(0, 40) || 'Member',
          color,
          sharing,
          p?.show_on_leaderboards === false ? 0 : 1,
          now,
        );
        return null;
      }
      case 'listMyGroups':
        return this.myGroupIds(me).map((id) => this.groupRow(id)).sort((x, y) => x.created_at.localeCompare(y.created_at));
      case 'listProfiles': {
        const mates = this.mates(me);
        const ids = strings(a.ids).filter((id) => mates.has(id));
        if (!ids.length) return [];
        return this.all<Row>(`SELECT id, display_name, color, sharing, show_on_leaderboards FROM profiles WHERE id IN (${this.marks(ids.length)})`, ...ids).map((r) => ({
          ...r,
          show_on_leaderboards: !!r.show_on_leaderboards,
        }));
      }
      case 'listTotals': {
        const ids = strings(a.challengeIds);
        if (!ids.length) return [];
        return this.all(
          `SELECT challenge_id, user_id, value FROM challenge_totals WHERE challenge_id IN (${this.marks(ids.length)})
             AND challenge_id IN (SELECT id FROM challenges WHERE group_id IN (SELECT group_id FROM group_members WHERE user_id = ?))`,
          ...ids,
          me,
        );
      }
      case 'listSessions': {
        const mates = this.mates(me);
        const ids = strings(a.userIds).filter((id) => mates.has(id));
        const since = DAY.test(String(a.since)) ? String(a.since) : '0000-00-00';
        if (!ids.length) return [];
        return this.all<Row>(
          `SELECT user_id, id, date, performed_at, category, entries, updated_at FROM sessions WHERE date >= ? AND user_id IN (${this.marks(ids.length)})
             AND user_id IN (SELECT id FROM profiles WHERE sharing = 'everything')`,
          since,
          ...ids,
        ).map((r) => ({ ...r, entries: JSON.parse(r.entries as string) }));
      }
      case 'upsertSessions': {
        const rows = (Array.isArray(a.rows) ? a.rows : []).slice(0, 500) as Record<string, unknown>[];
        for (const r of rows) {
          if (typeof r.id !== 'string' || !DAY.test(String(r.date))) continue;
          const entries = JSON.stringify(r.entries ?? []);
          if (entries.length > 20_000) continue;
          this.run(
            `INSERT INTO sessions (user_id, id, date, performed_at, category, entries, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT (user_id, id) DO UPDATE SET date = excluded.date, performed_at = excluded.performed_at, category = excluded.category, entries = excluded.entries, updated_at = excluded.updated_at`,
            me,
            r.id.slice(0, 80),
            String(r.date),
            String(r.performed_at ?? now).slice(0, 40),
            String(r.category ?? '').slice(0, 20),
            entries,
            String(r.updated_at ?? now).slice(0, 40),
          );
        }
        return null;
      }
      case 'deleteSessions': {
        const ids = strings(a.ids, 2000);
        for (let i = 0; i < ids.length; i += 50) {
          const part = ids.slice(i, i + 50);
          this.run(`DELETE FROM sessions WHERE user_id = ? AND id IN (${this.marks(part.length)})`, me, ...part);
        }
        return null;
      }
      case 'deleteAllMySessions':
        this.run('DELETE FROM sessions WHERE user_id = ?', me);
        return null;
      case 'upsertTotals': {
        const mine = new Set(this.all<{ id: string }>('SELECT id FROM challenges WHERE group_id IN (SELECT group_id FROM group_members WHERE user_id = ?)', me).map((r) => r.id));
        for (const r of (Array.isArray(a.rows) ? a.rows : []) as Record<string, unknown>[]) {
          const value = Number(r.value);
          if (typeof r.challenge_id !== 'string' || !mine.has(r.challenge_id) || !Number.isFinite(value) || value < 0) continue;
          this.run(
            `INSERT INTO challenge_totals (challenge_id, user_id, value, updated_at) VALUES (?, ?, ?, ?)
             ON CONFLICT (challenge_id, user_id) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
            r.challenge_id,
            me,
            value,
            now,
          );
        }
        return null;
      }
      case 'deleteMyTotals': {
        const ids = strings(a.challengeIds);
        if (ids.length) this.run(`DELETE FROM challenge_totals WHERE user_id = ? AND challenge_id IN (${this.marks(ids.length)})`, me, ...ids);
        return null;
      }
      // Winter Arc check-ins: per day only whether it was completed and how many daily rules were done.
      case 'upsertArcDays': {
        const rows = (Array.isArray(a.rows) ? a.rows : []).slice(0, 200) as Record<string, unknown>[];
        for (const r of rows) {
          const done = Number(r.done);
          const total = Number(r.total);
          if (!DAY.test(String(r.date)) || !Number.isInteger(done) || !Number.isInteger(total) || done < 0 || total < 1 || total > 10 || done > total) continue;
          this.run(
            `INSERT INTO arc_days (user_id, date, done, total, complete, updated_at) VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT (user_id, date) DO UPDATE SET done = excluded.done, total = excluded.total, complete = excluded.complete, updated_at = excluded.updated_at`,
            me,
            String(r.date),
            done,
            total,
            r.complete === true ? 1 : 0,
            now,
          );
        }
        return null;
      }
      case 'deleteMyArcDays':
        this.run('DELETE FROM arc_days WHERE user_id = ?', me);
        return null;
      case 'listArcDays': {
        const mates = this.mates(me);
        const ids = strings(a.userIds).filter((id) => mates.has(id) && id !== me);
        const since = DAY.test(String(a.since)) ? String(a.since) : '0000-00-00';
        if (!ids.length) return [];
        return this.all<Row>(
          `SELECT user_id, date, done, total, complete FROM arc_days WHERE date >= ? AND user_id IN (${this.marks(ids.length)})
             AND user_id IN (SELECT id FROM profiles WHERE sharing != 'private')`,
          since,
          ...ids,
        ).map((r) => ({ ...r, complete: !!r.complete }));
      }
      case 'createGroup': {
        const name = str(a.name, 60, 'group name');
        if (this.myGroupIds(me).length >= 50) throw new ApiError('You’re in the maximum number of groups.');
        const id = crypto.randomUUID();
        this.run('INSERT INTO groups (id, name, invite_code, owner_id, created_at) VALUES (?, ?, ?, ?, ?)', id, name, this.newInviteCode(), me, now);
        this.run('INSERT INTO group_members (group_id, user_id, joined_at) VALUES (?, ?, ?)', id, me, now);
        return this.groupRow(id);
      }
      case 'joinGroup': {
        const code = String(a.code ?? '').trim().toUpperCase();
        const g = this.one<{ id: string }>('SELECT id FROM groups WHERE invite_code = ?', code);
        if (!g) throw new ApiError('No group with that invite code.', 404);
        if (this.all('SELECT user_id FROM group_members WHERE group_id = ?', g.id).length >= 200) throw new ApiError('That group is full.');
        this.run('INSERT OR IGNORE INTO group_members (group_id, user_id, joined_at) VALUES (?, ?, ?)', g.id, me, now);
        return this.groupRow(g.id);
      }
      case 'leaveGroup':
        this.requireMember(str(a.groupId, 80, 'group'), me);
        this.leave(String(a.groupId), me);
        return null;
      case 'deleteGroup':
        this.requireOwner(str(a.groupId, 80, 'group'), me);
        this.removeGroup(String(a.groupId));
        return null;
      case 'renameGroup':
        this.requireOwner(str(a.groupId, 80, 'group'), me);
        this.run('UPDATE groups SET name = ? WHERE id = ?', str(a.name, 60, 'group name'), String(a.groupId));
        return null;
      case 'regenerateInvite': {
        this.requireOwner(str(a.groupId, 80, 'group'), me);
        const code = this.newInviteCode();
        this.run('UPDATE groups SET invite_code = ? WHERE id = ?', code, String(a.groupId));
        return code;
      }
      case 'createChallenge': {
        const groupId = str(a.groupId, 80, 'group');
        this.requireMember(groupId, me);
        const c = a.challenge as Record<string, unknown>;
        if (!DAY.test(String(c?.startDate)) || !DAY.test(String(c?.endDate)) || String(c.endDate) < String(c.startDate)) throw new ApiError('Invalid challenge dates.');
        if (this.all('SELECT id FROM challenges WHERE group_id = ?', groupId).length >= 30) throw new ApiError('This group has the maximum number of challenges.');
        this.run(
          'INSERT INTO challenges (id, group_id, title, exercise_id, metric, start_date, end_date, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          crypto.randomUUID(),
          groupId,
          str(c.title, 80, 'challenge title'),
          str(c.exerciseId, 80, 'exercise'),
          str(c.metric, 20, 'metric'),
          String(c.startDate),
          String(c.endDate),
          me,
          now,
        );
        return null;
      }
      case 'deleteChallenge': {
        const c = this.one<{ group_id: string; created_by: string }>('SELECT group_id, created_by FROM challenges WHERE id = ?', str(a.challengeId, 80, 'challenge'));
        if (!c) return null;
        const g = this.one<{ owner_id: string }>('SELECT owner_id FROM groups WHERE id = ?', c.group_id);
        if (c.created_by !== me && g?.owner_id !== me) throw new ApiError('Only the group’s owner or the challenge’s creator can delete it.', 403);
        this.run('DELETE FROM challenge_totals WHERE challenge_id = ?', String(a.challengeId));
        this.run('DELETE FROM challenges WHERE id = ?', String(a.challengeId));
        return null;
      }
      default:
        throw new ApiError('Unknown operation.');
    }
  }

  /** Leaves a group. The owner hands it to the longest-standing member; an empty group is removed. */
  private leave(groupId: string, me: string) {
    this.run('DELETE FROM challenge_totals WHERE user_id = ? AND challenge_id IN (SELECT id FROM challenges WHERE group_id = ?)', me, groupId);
    this.run('DELETE FROM group_members WHERE group_id = ? AND user_id = ?', groupId, me);
    const next = this.one<{ user_id: string }>('SELECT user_id FROM group_members WHERE group_id = ? ORDER BY joined_at LIMIT 1', groupId);
    if (!next) this.removeGroup(groupId);
    else this.run('UPDATE groups SET owner_id = ? WHERE id = ? AND owner_id = ?', next.user_id, groupId, me);
  }
}
