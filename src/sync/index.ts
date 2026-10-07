/**
 * Accounts and group sync. Local-first: everything personal works offline; an account (a name
 * and a password — no email) adds shared groups, invite links, live leaderboards and member
 * profiles, kept on the FORM sync server (server/).
 *
 * Privacy (Settings → Privacy) is enforced by the server, not only by the app.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { create } from 'zustand';

import { showToast } from '@/components/toast';
import { dayKeyFor, resolveTimeZone } from '@/domain/dates';
import type { Challenge } from '@/domain/types';
import { arcSharedDays, arcStatistics } from '@/domain/winterArc';
import { useStore } from '@/store/store';

import { AuthExpiredError, call } from './api';
import { EMPTY_PUSH, overtakes, syncOnce, type PushState, type Standing } from './engine';
import { httpRemote } from './remote';

export type SyncStatus = 'signedOut' | 'ready' | 'syncing' | 'error';

interface SyncState {
  status: SyncStatus;
  /** The account's name (what you log in with). */
  name: string | null;
  userId: string | null;
  lastSyncAt: string | null;
  error: string | null;
  /** False until a saved login has been looked for. */
  restored: boolean;
}

export const useSync = create<SyncState>(() => ({
  status: 'signedOut',
  name: null,
  userId: null,
  lastSyncAt: null,
  error: null,
  restored: false,
}));

export function isSignedIn(): boolean {
  return !!useSync.getState().userId;
}

// ---------- errors ----------

/** Turns network errors into messages people can act on. */
export function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e ?? '');
  if (/failed to fetch|network request failed|networkerror|load failed/i.test(msg)) return 'Can’t reach the sync server. Check your connection and try again.';
  if (/no group with that invite code/i.test(msg)) return 'No group has that invite code. Check it and try again.';
  return msg || 'Something went wrong.';
}

// ---------- login ----------

interface Auth {
  token: string;
  userId: string;
  name: string;
}

const AUTH_KEY = 'form-sync-auth';
let auth: Auth | null = null;

/** "Remember me" keeps the login on this device; otherwise it lasts until the tab or app closes. */
const tabStore = (): Storage | null => {
  try {
    return Platform.OS === 'web' && typeof sessionStorage !== 'undefined' ? sessionStorage : null;
  } catch {
    return null;
  }
};

async function saveAuth(next: Auth | null, remember: boolean) {
  auth = next;
  await AsyncStorage.removeItem(AUTH_KEY).catch(() => {});
  tabStore()?.removeItem(AUTH_KEY);
  if (!next) return;
  if (remember) await AsyncStorage.setItem(AUTH_KEY, JSON.stringify(next)).catch(() => {});
  else tabStore()?.setItem(AUTH_KEY, JSON.stringify(next));
}

let started = false;

/** Restores a saved login. Safe to call more than once. */
export function startSync() {
  if (started) return;
  started = true;
  (async () => {
    try {
      const raw = tabStore()?.getItem(AUTH_KEY) ?? (await AsyncStorage.getItem(AUTH_KEY));
      const saved = raw ? (JSON.parse(raw) as Auth) : null;
      if (saved?.token && saved.userId) {
        auth = saved;
        setUser(saved);
      }
    } catch {
      // A damaged entry is the same as none.
    }
    useSync.setState({ restored: true });
  })();
}

function setUser(user: Auth | null) {
  const prev = useSync.getState().userId;
  if (!user) {
    useSync.setState({ status: 'signedOut', userId: null, name: null, lastSyncAt: null });
    if (prev) useStore.getState().clearRemote();
    return;
  }
  if (prev && prev !== user.userId) useStore.getState().clearRemote();
  useSync.setState({ status: 'ready', userId: user.userId, name: user.name, error: null });
}

async function enter(op: 'signup' | 'login', name: string, password: string, remember: boolean) {
  let next: Auth;
  try {
    next = await call<Auth>(op, { name: name.trim(), password });
  } catch (e) {
    throw new Error(friendlyError(e));
  }
  await saveAuth(next, remember);
  setUser(next);
}

/** Creates an account from a name and a password. */
export const signUp = (name: string, password: string, remember: boolean) => enter('signup', name, password, remember);
export const signIn = (name: string, password: string, remember: boolean) => enter('login', name, password, remember);

export async function signOut(): Promise<void> {
  const token = auth?.token;
  await saveAuth(null, false);
  setUser(null);
  if (token) call('logout', {}, token).catch(() => {});
}

/** Deletes the account and everything it shared from the server. Data on this device stays. */
export async function deleteAccount(): Promise<void> {
  if (!auth) return;
  try {
    await call('deleteAccount', {}, auth.token);
  } catch (e) {
    throw new Error(friendlyError(e));
  }
  await saveAuth(null, false);
  setUser(null);
}

/** The server no longer accepts this login: back to signed out, and say so. */
async function expire() {
  await saveAuth(null, false);
  setUser(null);
  useSync.setState({ error: 'You were logged out. Log in again to see your groups.' });
}

// ---------- syncing ----------

const pushKey = (userId: string) => `form-sync-push:${userId}`;
let standings: Record<string, Standing> = {};
let running: Promise<void> | null = null;
let again = false;

/** One sync pass (coalesced: calls during a pass trigger exactly one more). */
export function syncNow(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    try {
      do {
        again = false;
        await runOnce();
      } while (again);
    } finally {
      running = null;
    }
  })();
  return running;
}

async function runOnce() {
  const { userId } = useSync.getState();
  const token = auth?.token;
  if (!token || !userId) return;
  useSync.setState({ status: 'syncing' });
  try {
    const app = useStore.getState();
    const tz = resolveTimeZone(app.settings.timeZone);
    const today = dayKeyFor(new Date(), tz);
    const arcDays = app.winterArc.joinedAt ? arcSharedDays(arcStatistics({ data: app.winterArc, sessions: app.sessions, today }), today) : undefined;
    const raw = await AsyncStorage.getItem(pushKey(userId));
    const prev: PushState = raw ? JSON.parse(raw) : EMPTY_PUSH;
    const result = await syncOnce(
      httpRemote(token),
      userId,
      {
        name: app.profile.name,
        color: app.avatar.badgeColor,
        sharing: app.settings.sharing,
        showOnLeaderboards: app.settings.showOnLeaderboards,
        sessions: app.sessions,
        today,
        arcDays,
      },
      prev,
    );
    await AsyncStorage.setItem(pushKey(userId), JSON.stringify(result.push));
    useStore.getState().applyRemote(result);

    // "Someone just passed you" — only between passes in this app session.
    for (const { standing, by } of overtakes(standings, result.standings)) {
      const names = by.map((id) => result.people.find((p) => p.id === id)?.name ?? 'Someone');
      showToast(`${names.join(' and ')} passed you in ${standing.challengeTitle} — you’re #${standing.rank}`);
    }
    standings = result.standings;
    if (useSync.getState().userId === userId) useSync.setState({ status: 'ready', lastSyncAt: new Date().toISOString(), error: null });
  } catch (e) {
    if (e instanceof AuthExpiredError) await expire();
    else if (useSync.getState().userId === userId) useSync.setState({ status: 'error', error: friendlyError(e) });
  }
}

// ---------- group operations (server when signed in) ----------

function remote() {
  if (!auth) throw new Error('Log in to use shared groups.');
  return httpRemote(auth.token);
}

async function thenSync<T>(p: Promise<T>): Promise<T> {
  let v: T;
  try {
    v = await p;
  } catch (e) {
    throw new Error(friendlyError(e));
  }
  await syncNow();
  return v;
}

export const groupsApi = {
  create: (name: string) => thenSync(remote().createGroup(name.trim())),
  join: (code: string) => thenSync(remote().joinGroup(code.trim().toUpperCase())),
  leave: (groupId: string) => thenSync(remote().leaveGroup(groupId)),
  remove: (groupId: string) => thenSync(remote().deleteGroup(groupId)),
  rename: (groupId: string, name: string) => thenSync(remote().renameGroup(groupId, name.trim())),
  regenerateInvite: (groupId: string) => thenSync(remote().regenerateInvite(groupId)),
  addChallenge: (groupId: string, c: Omit<Challenge, 'id' | 'createdAt'>) => thenSync(remote().createChallenge(groupId, c)),
  deleteChallenge: (challengeId: string) => thenSync(remote().deleteChallenge(challengeId)),
};

export function syncLabel(s: SyncState): string {
  switch (s.status) {
    case 'signedOut':
      return 'Not logged in';
    case 'syncing':
      return 'Syncing…';
    case 'error':
      return 'Sync problem';
    case 'ready':
      return s.lastSyncAt ? 'Synced' : 'Logged in';
  }
}

// ---------- invite links ----------

const INVITE_KEY = 'form-pending-invite';

/** Remembers an invite code from a link until you have an account (then you join). */
export function setPendingInvite(code: string | null) {
  if (code) AsyncStorage.setItem(INVITE_KEY, code).catch(() => {});
  else AsyncStorage.removeItem(INVITE_KEY).catch(() => {});
}

export async function takePendingInvite(): Promise<string | null> {
  const code = await AsyncStorage.getItem(INVITE_KEY).catch(() => null);
  if (code) await AsyncStorage.removeItem(INVITE_KEY).catch(() => {});
  return code;
}

/** The link that joins a group, for sharing. */
export function inviteLink(code: string): string {
  const origin = Platform.OS === 'web' && typeof location !== 'undefined' ? location.origin : 'https://form-fitness-9zk.pages.dev';
  return `${origin}/join/${code}`;
}
