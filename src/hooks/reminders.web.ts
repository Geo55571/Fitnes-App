// Local notifications aren't available on web; keep expo-notifications out of the web bundle.
import type { PlannedNotification } from '@/domain/reminders';

export const remindersSupported = false;

export type PermissionResult = 'granted' | 'denied' | 'unsupported';

export async function ensurePermission(): Promise<PermissionResult> {
  return 'unsupported';
}

export async function syncReminders(_plan: PlannedNotification[]): Promise<void> {}

export async function scheduleRestDone(_at: Date): Promise<void> {}

export async function cancelRestDone(): Promise<void> {}
