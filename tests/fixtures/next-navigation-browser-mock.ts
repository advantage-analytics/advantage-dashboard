export function useRouter() {
  return {
    refresh() {},
    push(href: string) {
      window.routerPushes.push(href);
    },
  };
}
