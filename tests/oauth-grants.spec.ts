import { expect, test } from "@playwright/test";

import {
  GRANTS_UNAVAILABLE_ERROR,
  listOAuthGrants,
  parseOAuthGrants,
  REVOKE_FAILED_ERROR,
  revokeOAuthGrant,
} from "@/lib/auth/oauth-grants";

/**
 * Settings › Connections reads the viewer's approved apps from Supabase
 * Auth's OAuth server and revokes one (`oauth-grants.ts`). These hold the
 * parsing and the two calls; the page itself is eyes-on territory.
 */

const call = {
  supabaseUrl: "https://example.supabase.co/",
  anonKey: "anon",
  accessToken: "token",
};

test("parses grants, keeps only rows with a client id, and names a nameless client", () => {
  expect(
    parseOAuthGrants([
      {
        client: { id: "c1", name: "Claude", uri: "https://claude.ai" },
        scopes: ["email", 7],
        granted_at: "2026-10-16T07:00:00Z",
      },
      { client: { id: "c2" }, scopes: null },
      { client: {}, scopes: [] },
      "garbage",
    ]),
  ).toEqual([
    {
      clientId: "c1",
      name: "Claude",
      grantedAt: "2026-10-16T07:00:00Z",
      scopes: ["email"],
    },
    { clientId: "c2", name: "An application", grantedAt: null, scopes: [] },
  ]);
  expect(parseOAuthGrants({ not: "a list" })).toBeNull();
});

test("lists with the viewer's own token and turns any failure into one sentence", async () => {
  let seen: { url: string; auth: string | null } | null = null;
  const ok = await listOAuthGrants({
    ...call,
    fetch: (async (url: string, init?: RequestInit) => {
      seen = {
        url,
        auth: new Headers(init?.headers).get("authorization"),
      };
      return new Response(JSON.stringify([]), { status: 200 });
    }) as typeof fetch,
  });
  expect(ok).toEqual({ ok: true, value: [] });
  expect(seen).toEqual({
    url: "https://example.supabase.co/auth/v1/user/oauth/grants",
    auth: "Bearer token",
  });

  const refused = await listOAuthGrants({
    ...call,
    fetch: (async () => new Response("no", { status: 500 })) as typeof fetch,
  });
  expect(refused).toEqual({ ok: false, message: GRANTS_UNAVAILABLE_ERROR });

  const thrown = await listOAuthGrants({
    ...call,
    fetch: (async () => {
      throw new Error("offline");
    }) as typeof fetch,
  });
  expect(thrown).toEqual({ ok: false, message: GRANTS_UNAVAILABLE_ERROR });
});

test("revokes by client id with DELETE", async () => {
  let seen: { url: string; method: string | undefined } | null = null;
  const ok = await revokeOAuthGrant({
    ...call,
    clientId: "c 1",
    fetch: (async (url: string, init?: RequestInit) => {
      seen = { url, method: init?.method };
      return new Response(null, { status: 204 });
    }) as typeof fetch,
  });
  expect(ok).toEqual({ ok: true, value: null });
  expect(seen).toEqual({
    url: "https://example.supabase.co/auth/v1/user/oauth/grants?client_id=c%201",
    method: "DELETE",
  });

  const refused = await revokeOAuthGrant({
    ...call,
    clientId: "c1",
    fetch: (async () => new Response("no", { status: 404 })) as typeof fetch,
  });
  expect(refused).toEqual({ ok: false, message: REVOKE_FAILED_ERROR });
});
