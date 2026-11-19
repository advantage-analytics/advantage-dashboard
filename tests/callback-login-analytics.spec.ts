import { expect, test } from "@playwright/test";
import { NextRequest } from "next/server";

import { createLoader } from "./fixtures/vm-modules";

/**
 * Google sign-in ends in `/callback`'s server redirect, so the browser never
 * reports it — and an MCP-connector sign-in (/login?next=/oauth/consent →
 * Google → /oauth/consent) never reaches DashboardShell's identify either.
 * The route captures `login_completed { method: "google" }` itself, the twin
 * of the password form's client event, keyed on the user id and carrying
 * nothing else (athletes include minors: ids and enums only).
 *
 * Driven through the vm loader with `@/lib/supabase/server` and
 * `@/lib/analytics-server` stubbed. Nothing here opens a database.
 */

type Captured = { distinctId: string; event: string; properties: unknown };
type Exchange = {
  data: { user: { id: string } | null; session: unknown };
  error: { message: string; code?: string } | null;
};

function loadCallback(exchange: Exchange) {
  const captured: Captured[] = [];
  const client = {
    auth: { exchangeCodeForSession: async () => exchange },
  };
  const loader = createLoader({
    stubs: {
      "@/lib/supabase/server": { createClient: async () => client },
      "@/lib/analytics-server": {
        trackServer: (distinctId: string, event: string, properties: unknown) =>
          captured.push({ distinctId, event, properties }),
      },
    },
    globals: { URL, URLSearchParams },
  });
  const GET = loader.load("src/app/(auth)/callback/route.ts").GET as (
    req: NextRequest,
  ) => Promise<Response>;
  return { GET, captured };
}

const request = (query: string) =>
  new NextRequest(`https://app.example/callback${query}`);

test("a successful exchange captures login_completed with the user id and method only", async () => {
  const { GET, captured } = loadCallback({
    data: { user: { id: "u-google" }, session: {} },
    error: null,
  });
  const res = await GET(request("?code=abc&next=/oauth/consent"));
  expect(res.status).toBe(307);
  expect(captured).toEqual([
    {
      distinctId: "u-google",
      event: "login_completed",
      properties: { method: "google" },
    },
  ]);
});

test("a failed exchange, or no code, captures nothing", async () => {
  const failed = loadCallback({
    data: { user: null, session: null },
    error: { message: "invalid grant" },
  });
  const res = await failed.GET(request("?code=bad"));
  expect(res.headers.get("location")).toContain("/error");
  expect(failed.captured).toEqual([]);

  const noCode = loadCallback({
    data: { user: { id: "u-google" }, session: {} },
    error: null,
  });
  await noCode.GET(request(""));
  expect(noCode.captured).toEqual([]);
});
