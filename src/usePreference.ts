import { useSyncExternalStore } from 'react';

/** Live OS/browser preferences, including a change while a decision is running. */
export function usePreference(query: string) {
  return useSyncExternalStore(
    callback => {
      const media = matchMedia(query);
      media.addEventListener('change', callback);
      return () => media.removeEventListener('change', callback);
    },
    () => matchMedia(query).matches,
  );
}
