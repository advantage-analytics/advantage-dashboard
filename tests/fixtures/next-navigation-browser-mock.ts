export function useRouter() {
  return {
    refresh() {
      window.routerRefreshes += 1;
    },
    push(href: string) {
      window.routerPushes.push(href);
    },
  };
}
