import { useEffect, useState } from 'react';

/**
 * Automatic updates: every time the app is opened or brought back to the
 * front (and every 15 minutes while open), it checks version.json — fetched
 * with no-store so no cache can hide a new release. When a new version is
 * live, the app reloads itself onto it. Everything saved (diary, profile,
 * Gemini key, saved foods/restaurants) lives in this site's storage and is
 * kept across the reload — nothing to delete or re-add.
 *
 * It never reloads in the middle of something unsaved (a scan being reviewed,
 * an AI research): those screens mark themselves busy and the update waits.
 */

let busyReasons = 0;
export function markUpdateBusy(busy: boolean) {
  busyReasons = Math.max(0, busyReasons + (busy ? 1 : -1));
}

const JUST_UPDATED = 'nai-just-updated';
const TRIED = 'nai-update-tried';

export type UpdateState = 'idle' | 'waiting' | 'updating' | 'updated';

export function useAutoUpdate(): UpdateState {
  const [state, setState] = useState<UpdateState>(() => {
    try {
      if (sessionStorage.getItem(JUST_UPDATED)) {
        sessionStorage.removeItem(JUST_UPDATED);
        return 'updated';
      }
    } catch {
      /* ignore */
    }
    return 'idle';
  });

  useEffect(() => {
    if (state !== 'updated') return;
    const t = window.setTimeout(() => setState('idle'), 3500);
    return () => window.clearTimeout(t);
  }, [state]);

  useEffect(() => {
    if (import.meta.env.DEV) return;
    let cancelled = false;
    let waitTimer: number | undefined;

    function reloadInto(build: string) {
      if (busyReasons > 0) {
        setState('waiting');
        waitTimer = window.setTimeout(() => reloadInto(build), 3000);
        return;
      }
      setState('updating');
      try {
        sessionStorage.setItem(JUST_UPDATED, '1');
        sessionStorage.setItem(TRIED, build);
      } catch {
        /* ignore */
      }
      // A new query string makes the browser fetch the new index.html instead of a cached copy.
      const url = new URL(window.location.href);
      url.searchParams.set('v', String(Date.now()));
      window.setTimeout(() => window.location.replace(url.toString()), 600);
    }

    async function check() {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return;
        const { build } = (await res.json()) as { build?: string };
        if (cancelled || !build || build === __BUILD_ID__) return;
        // Guard against a reload loop if the CDN briefly serves an older index.html.
        try {
          if (sessionStorage.getItem(TRIED) === build) return;
        } catch {
          /* ignore */
        }
        reloadInto(build);
      } catch {
        /* offline — try again later */
      }
    }

    void check();
    const onVisible = () => document.visibilityState === 'visible' && void check();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    const interval = window.setInterval(check, 15 * 60 * 1000);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      window.clearInterval(interval);
      if (waitTimer) window.clearTimeout(waitTimer);
    };
  }, []);

  return state;
}
