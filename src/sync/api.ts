/**
 * Client for the FORM sync server (server/src/index.ts): one POST per operation, with the
 * login token. On the website the server sits behind this site's own /api/sync; the phone app
 * uses the deployed site (or EXPO_PUBLIC_SYNC_URL).
 */
import { Platform } from 'react-native';

const BASE = process.env.EXPO_PUBLIC_SYNC_URL ?? (Platform.OS === 'web' ? '/api/sync' : 'https://form-fitness-9zk.pages.dev/api/sync');

/** The server refused the login token (signed out elsewhere, or the account is gone). */
export class AuthExpiredError extends Error {}

export async function call<T>(op: string, args: Record<string, unknown> = {}, token?: string | null): Promise<T> {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ op, args }),
  });
  const body = (await res.json().catch(() => null)) as { ok: boolean; data?: T; error?: string } | null;
  if (!body) throw new Error(res.status === 503 || res.status === 404 ? 'Accounts aren’t available right now. Try again later.' : `The sync server answered ${res.status}.`);
  if (!body.ok) {
    if (res.status === 401 && token) throw new AuthExpiredError(body.error ?? 'Please log in again.');
    throw new Error(body.error ?? 'Something went wrong.');
  }
  return body.data as T;
}
