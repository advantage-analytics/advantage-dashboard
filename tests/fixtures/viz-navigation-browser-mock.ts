import { useSyncExternalStore } from "react";

function subscribe(changed: () => void) {
  window.addEventListener("popstate", changed);
  return () => window.removeEventListener("popstate", changed);
}
export function useSearchParams() {
  const search = useSyncExternalStore(subscribe, () => window.location.search);
  return new URLSearchParams(search);
}
export function usePathname() {
  return window.location.pathname;
}
export function useRouter() {
  return {
    replace(url: string) {
      window.history.replaceState(null, "", url);
      window.dispatchEvent(new PopStateEvent("popstate"));
    },
    /** A server re-render of the current URL. A harness that plays the
     *  server listens for it (`season-viz-harness.tsx`); others ignore it. */
    refresh() {
      window.dispatchEvent(new Event("harness-refresh"));
    },
  };
}
