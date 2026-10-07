import { router } from 'expo-router';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { showToast } from '@/components/toast';
import { useStore } from '@/store/store';

import { groupsApi, startSync, syncNow, takePendingInvite, useSync } from './index';

const DEBOUNCE_MS = 4000;
const INTERVAL_MS = 120_000;

/** Keeps synced groups fresh. Renders nothing. */
export function SyncRunner() {
  const userId = useSync((s) => s.userId);
  // Anything that changes what others see.
  const shared = useStore(
    useShallow((s) => ({
      sessions: s.sessions,
      name: s.profile.name,
      color: s.avatar.badgeColor,
      sharing: s.settings.sharing,
      leaderboards: s.settings.showOnLeaderboards,
    })),
  );

  useEffect(() => startSync(), []);

  // Sign-in, return to foreground, and a slow heartbeat while open.
  useEffect(() => {
    if (!userId) return;
    syncNow();
    // Opened an invite link before having an account: join now.
    takePendingInvite().then((code) => {
      if (!code) return;
      groupsApi
        .join(code)
        .then((g) => {
          showToast(`You joined ${g.name}`);
          router.push({ pathname: '/group/[id]', params: { id: g.id } });
        })
        .catch((e) => showToast(e instanceof Error ? e.message : 'Couldn’t join the group.'));
    });
    const sub = AppState.addEventListener('change', (state) => state === 'active' && syncNow());
    const id = setInterval(() => AppState.currentState === 'active' && syncNow(), INTERVAL_MS);
    return () => {
      sub.remove();
      clearInterval(id);
    };
  }, [userId]);

  // Push local changes shortly after they happen.
  useEffect(() => {
    if (!userId) return;
    const t = setTimeout(() => syncNow(), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [userId, shared]);

  return null;
}
