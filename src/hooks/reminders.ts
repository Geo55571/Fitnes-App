import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { PlannedNotification } from '@/domain/reminders';

export const remindersSupported = Platform.OS === 'ios' || Platform.OS === 'android';

const PREFIX = 'form-';
const CHANNEL = 'reminders';

let handlerSet = false;
function ensureHandler() {
  if (handlerSet) return;
  handlerSet = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

export type PermissionResult = 'granted' | 'denied' | 'unsupported';

/** Asks for notification permission if needed (only call from a user action). */
export async function ensurePermission(): Promise<PermissionResult> {
  ensureHandler();
  let perm = await Notifications.getPermissionsAsync();
  if (!perm.granted && perm.canAskAgain) perm = await Notifications.requestPermissionsAsync();
  if (!perm.granted) return 'denied';
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: 'Reminders',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  return 'granted';
}

let lastSignature = '';

/**
 * Makes the scheduled notifications match `plan` exactly. Only touches notifications FORM
 * scheduled itself, and does nothing if the plan hasn't changed since the last sync.
 */
export async function syncReminders(plan: PlannedNotification[]): Promise<void> {
  const signature = JSON.stringify(plan.map((n) => [n.id, n.at.getTime(), n.title, n.body]));
  if (signature === lastSignature) return;
  ensureHandler();
  const perm = await Notifications.getPermissionsAsync();
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((n) => n.identifier.startsWith(PREFIX) || n.identifier === 'form-daily-reminder')
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
  if (perm.granted) {
    for (const n of plan) {
      await Notifications.scheduleNotificationAsync({
        identifier: `${PREFIX}${n.id}`,
        content: { title: n.title, body: n.body },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: n.at, channelId: CHANNEL },
      });
    }
  }
  lastSignature = signature;
}

const REST_ID = 'rest-timer';

/** "Rest over" alert for when the app is in the background during a rest (no permission prompt). */
export async function scheduleRestDone(at: Date): Promise<void> {
  const perm = await Notifications.getPermissionsAsync();
  if (!perm.granted) return;
  ensureHandler();
  await Notifications.cancelScheduledNotificationAsync(REST_ID).catch(() => {});
  await Notifications.scheduleNotificationAsync({
    identifier: REST_ID,
    content: { title: 'Rest over', body: 'Time for your next set.' },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId: CHANNEL },
  });
}

export async function cancelRestDone(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(REST_ID).catch(() => {});
}
