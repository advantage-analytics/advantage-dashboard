/** `next/navigation` stub for vm-loaded modules: `redirect()` throws a `Redirect` carrying its target. */
export class Redirect extends Error {
  constructor(readonly to: string) {
    super(`redirect ${to}`);
  }
}

export const redirectStub = {
  redirect: (to: string) => {
    throw new Redirect(to);
  },
};
