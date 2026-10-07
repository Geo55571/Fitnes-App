import { call } from './api';
import type { ArcDayRow, GroupRow, ProfileRow, Remote, SessionRow, TotalRow } from './engine';

/** The sync engine's Remote over the FORM sync server. Privacy rules are enforced by the server. */
export function httpRemote(token: string): Remote {
  const rpc = <T>(op: string, args: Record<string, unknown> = {}) => call<T>(op, args, token);
  return {
    upsertProfile: (profile: ProfileRow) => rpc('upsertProfile', { profile }),
    listMyGroups: () => rpc<GroupRow[]>('listMyGroups'),
    listProfiles: (ids) => rpc<ProfileRow[]>('listProfiles', { ids }),
    listTotals: (challengeIds) => rpc<TotalRow[]>('listTotals', { challengeIds }),
    listSessions: (userIds, since) => rpc<SessionRow[]>('listSessions', { userIds, since }),
    upsertSessions: (rows) => rpc('upsertSessions', { rows }),
    deleteSessions: (ids) => rpc('deleteSessions', { ids }),
    deleteAllMySessions: () => rpc('deleteAllMySessions'),
    upsertTotals: (rows) => rpc('upsertTotals', { rows }),
    deleteMyTotals: (challengeIds) => rpc('deleteMyTotals', { challengeIds }),
    createGroup: (name) => rpc<GroupRow>('createGroup', { name }),
    joinGroup: (code) => rpc<GroupRow>('joinGroup', { code }),
    leaveGroup: (groupId) => rpc('leaveGroup', { groupId }),
    deleteGroup: (groupId) => rpc('deleteGroup', { groupId }),
    renameGroup: (groupId, name) => rpc('renameGroup', { groupId, name }),
    regenerateInvite: (groupId) => rpc<string>('regenerateInvite', { groupId }),
    createChallenge: (groupId, challenge) => rpc('createChallenge', { groupId, challenge }),
    deleteChallenge: (challengeId) => rpc('deleteChallenge', { challengeId }),
    upsertArcDays: (rows) => rpc('upsertArcDays', { rows }),
    deleteMyArcDays: () => rpc('deleteMyArcDays'),
    listArcDays: (userIds, since) => rpc<ArcDayRow[]>('listArcDays', { userIds, since }),
  };
}
