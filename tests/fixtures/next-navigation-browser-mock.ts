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

/** No Next router in these harnesses; consumers must tolerate null. */
export function useSearchParams() {
  return null;
}
