export { unstable_rethrow } from "next/dist/client/components/unstable-rethrow.browser";
export { unstable_isUnrecognizedActionError } from "next/dist/client/components/unrecognized-action-error";

declare global {
  interface Window {
    routerReplaces?: string[];
  }
}

export function useRouter() {
  return {
    refresh() {
      window.routerRefreshes += 1;
    },
    push(href: string) {
      window.routerPushes.push(href);
    },
    replace(href: string) {
      (window.routerReplaces ??= []).push(href);
    },
  };
}

/** The harness uses the real address bar for one-shot Video point links. */
export function useSearchParams() {
  return new URLSearchParams(window.location.search);
}

/** The real address bar's path, for the leave guard's same-page check. */
export function usePathname() {
  return window.location.pathname;
}
