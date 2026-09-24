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
