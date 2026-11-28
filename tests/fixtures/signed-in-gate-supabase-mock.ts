/**
 * `@/lib/supabase/client` for the signed-in gate harness.
 *
 * `?session=` on the harness URL picks what the browser holds:
 *   - absent / `none` — no session cookie;
 *   - `live` — a session `getUser()` confirms;
 *   - `revoked` — a session cookie the auth server no longer honours.
 * `?signOut=fail` makes sign-out fail. `?profile=0` leaves the `users` row without a name (and the provider
 * metadata empty). Every auth call is recorded in `sessionStorage` under
 * `calls` so a spec can see what a visit cost and what sign-out was asked.
 */
export function record(call: string) {
  const calls = JSON.parse(sessionStorage.getItem("calls") ?? "[]");
  calls.push(call);
  sessionStorage.setItem("calls", JSON.stringify(calls));
}

function signedOut() {
  return sessionStorage.getItem("signedOut") === "1";
}

export function createClient() {
  const params = new URLSearchParams(window.location.search);
  const session = signedOut() ? "none" : (params.get("session") ?? "none");
  const named = params.get("profile") !== "0";
  const user = {
    id: "user-1",
    email: "jordan.avery@university.edu",
    user_metadata: {},
  };

  return {
    auth: {
      async getSession() {
        record("getSession");
        return {
          data: { session: session === "none" ? null : { user } },
          error: null,
        };
      },
      async getUser() {
        record("getUser");
        return session === "live"
          ? { data: { user }, error: null }
          : { data: { user: null }, error: { message: "revoked" } };
      },
      async signOut(options?: { scope?: string }) {
        record(`signOut:${options?.scope ?? "global"}`);
        // `?signOut=fail`: auth-js's failure shape — an error returned, the
        // session left in place.
        if (params.get("signOut") === "fail") {
          return { error: { message: "network" } };
        }
        sessionStorage.setItem("signedOut", "1");
        return { error: null };
      },
    },
    from(table: string) {
      record(`from:${table}`);
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({
          data: named
            ? { first_name: "Jordan", last_name: "Avery" }
            : { first_name: null, last_name: null },
          error: null,
        }),
      };
      return chain;
    },
  };
}
