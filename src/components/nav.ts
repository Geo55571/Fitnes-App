import { router } from 'expo-router';

/** Back if there is history (normal in-app navigation), otherwise to Today (deep links, reloads). */
export function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}
