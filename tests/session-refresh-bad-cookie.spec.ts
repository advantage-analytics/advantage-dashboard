import { expect, test } from "@playwright/test";
import { NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

/**
 * `updateSession` runs in `src/proxy.ts` in front of every matched route. It
 * calls `supabase.auth.getClaims()` for its refresh-and-set-cookie side effect,
 * and `@supabase/auth-js` `getClaims` has one path that *throws* rather than
 * returning `{ error }`: `validateExp` raises a plain `Error("Missing exp
 * claim")` / `Error("JWT has expired")` from the cookie's access token before
 * any network call, and `getClaims` only converts `AuthError`s into a return
 * value. A stale, foreign-project or hand-made cookie therefore took down every
 * page for that browser with a 500 until the cookie was gone.
 *
 * Nothing here touches the network. `getClaims` reads the session from the
 * cookie, decodes the JWT and validates `exp` before it would fetch a JWK or
 * call `getUser`, and a request with no cookie returns `{ data: null }` from
 * `getSession` without a round-trip — so dummy Supabase credentials are enough.
 */

const SUPABASE_URL = "https://abcdefghijklmnopqrst.supabase.co";
const PROJECT_REF = "abcdefghijklmnopqrst";
const ANON_KEY = "dummy-anon-key";

function base64Url(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

/** A syntactically valid HS256 JWT whose payload carries no `exp` claim. */
function accessTokenWithoutExp(): string {
  const header = base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64Url(
    JSON.stringify({
      sub: "00000000-0000-0000-0000-000000000000",
      role: "authenticated",
      aud: "authenticated",
    }),
  );
  const signature = base64Url("not-a-real-signature");
  return `${header}.${payload}.${signature}`;
}

/**
 * The cookie `@supabase/ssr` writes: `base64-` + base64url(session JSON). The
 * session must carry `access_token`, `refresh_token` and `expires_at` to pass
 * `_isValidSession`, and `expires_at` must be far enough out that
 * `__loadSession` does not try to refresh (which would need the network).
 */
function malformedAuthCookie(): string {
  const session = {
    access_token: accessTokenWithoutExp(),
    refresh_token: "dummy-refresh-token",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: "00000000-0000-0000-0000-000000000000" },
  };
  return `base64-${base64Url(JSON.stringify(session))}`;
}

function requestFor(path: string, cookie?: string): NextRequest {
  const headers = new Headers();
  if (cookie) headers.set("cookie", `sb-${PROJECT_REF}-auth-token=${cookie}`);
  return new NextRequest(`http://localhost:3000${path}`, { headers });
}

test.describe("updateSession survives a malformed auth cookie", () => {
  test.beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = ANON_KEY;
  });

  test("an access token with no exp claim resolves to a response instead of throwing", async () => {
    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map(String).join(" "));
    };
    try {
      const response = await updateSession(
        requestFor("/dashboard", malformedAuthCookie()),
      );
      expect(response.status).toBe(200);
      // Refresh only, never redirect — the layouts own route protection.
      expect(response.headers.get("location")).toBeNull();
      // The cookie is left alone for the layouts' `getUser()` to reject.
      expect(response.cookies.getAll()).toEqual([]);
    } finally {
      console.warn = originalWarn;
    }

    // One warning, naming the failure and the path but never the token.
    const relevant = warnings.filter((w) => w.includes("Missing exp claim"));
    expect(relevant).toHaveLength(1);
    expect(relevant[0]).toContain("/dashboard");
    expect(relevant[0]).not.toContain(accessTokenWithoutExp());
  });

  test("a request with no auth cookie still resolves the same way", async () => {
    const response = await updateSession(requestFor("/dashboard"));
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });
});
