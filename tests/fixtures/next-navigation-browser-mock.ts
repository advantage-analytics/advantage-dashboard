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
