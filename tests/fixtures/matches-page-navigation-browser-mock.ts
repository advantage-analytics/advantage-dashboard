/**
 * `next/navigation` for the Matches-page harness.
 *
 * `MatchesPageContent` reads its filters, sort and deep links
 * (`?match=` / `?draft=`) straight off `useSearchParams()` at mount, so the
 * shared mock's `null` would throw there. This one answers from the harness
 * URL instead, and `usePathname()` from the same place, so the page's
 * `replaceState` mirror writes back onto the harness path. `refresh()` is
 * counted, for the draft rail's discard, which refreshes once the rail has
 * left.
 */
declare global {
  interface Window {
    routerPushes: string[];
    routerRefreshes: number;
  }
}

export function useRouter() {
  return {
    refresh() {
      window.routerRefreshes = (window.routerRefreshes ?? 0) + 1;
    },
    push(href: string) {
      (window.routerPushes ??= []).push(href);
    },
    replace() {},
    prefetch() {},
  };
}

export function useSearchParams(): URLSearchParams {
  return new URLSearchParams(window.location.search);
}

export function usePathname(): string {
  return window.location.pathname;
}
