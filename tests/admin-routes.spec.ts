import {
  expect,
  test,
  type APIRequestContext,
  type APIResponse,
} from "@playwright/test";
import { type SupabaseClient } from "@supabase/supabase-js";

import {
  HAVE_ENV,
  SKIP_REASON,
  SUPABASE_URL,
  type Session,
  createAdminClient,
  createLogins,
  deleteAuthUsers,
  runMarker,
} from "./fixtures/live-db";

/**
 * Route-level smoke test for the admin console this whole queue built (T25,
 * final task): hits real HTTP routes on a *running* server, rather than
 * calling loaders or RPCs directly like the rest of this queue's specs do.
 * That needs a server to hit, which `npm test` cannot stand up for itself —
 * `next dev` is broken on this branch by a separate, already-logged Tailwind
 * content-scanner bug (see this task's own queue file), so the documented way
 * to get one is `npm run build && npm run start -- -p <port>`.
 *
 * So this spec is gated on two env vars, neither of which is set in CI or in
 * an ordinary local run:
 *
 *  - `ADMIN_SMOKE_BASE_URL` — origin of a running server to hit
 *    (e.g. `http://localhost:3500`).
 *  - `ADMIN_SMOKE_CONFIRM=yes` — an explicit second opt-in. Having
 *    `ADMIN_SMOKE_BASE_URL` set is not by itself proof the runner wants this:
 *    the suite creates and deletes real Supabase auth users (and a real
 *    throwaway program) against whichever project that server's own
 *    `.env.local` points at. Requiring both makes running this a decision,
 *    not a side effect of a base URL left set in the shell.
 *
 * It otherwise follows this repo's `HAVE_ENV`-gated live-DB convention (see
 * `tests/admin-program-rpcs.spec.ts`, `tests/fixtures/live-db.ts`) for the
 * Supabase side: two throwaway logins via `createLogins`, one promoted to
 * `is_admin = true` with the service-role client.
 *
 * Auth is proven at the HTTP layer, not the Supabase client layer: each
 * session's access/refresh tokens are packed into the same
 * `sb-<project-ref>-auth-token` cookie `@supabase/ssr` writes (see
 * `node_modules/@supabase/ssr/dist/main/cookies.js` — value is
 * `"base64-" + base64url(JSON.stringify(session))`) and sent as a raw
 * `Cookie` header on a Playwright `APIRequestContext` request, with
 * `maxRedirects: 0` so a redirect response is inspected rather than followed.
 *
 * Run on demand once a build is running:
 *   npm run build && npm run start -- -p 3500
 *   ADMIN_SMOKE_BASE_URL=http://localhost:3500 ADMIN_SMOKE_CONFIRM=yes \
 *     npx playwright test admin-routes
 */

const RAW_BASE_URL = process.env.ADMIN_SMOKE_BASE_URL;
const BASE_URL = RAW_BASE_URL?.replace(/\/+$/, "");
const CONFIRMED = process.env.ADMIN_SMOKE_CONFIRM === "yes";

const READY = HAVE_ENV && Boolean(BASE_URL) && CONFIRMED;

const ADMIN_SMOKE_SKIP_REASON = !HAVE_ENV
  ? SKIP_REASON
  : !BASE_URL
    ? "ADMIN_SMOKE_BASE_URL not set — point it at a running `npm run build && npm run start` server (npm run dev is broken on this branch, see AGENTS.md's queue notes)"
    : 'ADMIN_SMOKE_CONFIRM not set to "yes" — this spec creates/deletes real throwaway Supabase auth users and a throwaway program against whatever project the server at ADMIN_SMOKE_BASE_URL is wired to';

/** A crashed run is findable by hand:
 *  `select * from programs where program_key is null and school_name like 'admin-smoke-%'`. */
const { mark: MARK, password: PASSWORD } = runMarker("admin-smoke");

// @supabase/ssr chunks a cookie once its encoded value exceeds this many
// characters (node_modules/@supabase/ssr/dist/main/utils/chunker.js). These
// fixture sessions are throwaway users with no profile metadata, so the
// encoded session never gets close — the helper below throws instead of
// silently truncating if that ever stops being true, rather than
// reimplementing chunking for a case this spec never hits.
const MAX_UNCHUNKED_COOKIE_SIZE = 3180;
const BASE64_COOKIE_PREFIX = "base64-";

function projectRefFrom(url: string): string {
  return new URL(url).hostname.split(".")[0];
}

/**
 * Build the raw `Cookie` header value `@supabase/ssr` would read back as this
 * session, from the tokens already sitting in the signed-in client's memory
 * (`createLogin` in `fixtures/live-db.ts` already called
 * `signInWithPassword`, so this is a local read, not a network round trip).
 */
async function sessionCookieHeader(session: Session): Promise<string> {
  const { data, error } = await session.client.auth.getSession();
  if (error || !data.session) {
    throw new Error(
      `sessionCookieHeader: no in-memory session (${error?.message ?? "session missing"})`,
    );
  }

  const encoded =
    BASE64_COOKIE_PREFIX +
    Buffer.from(JSON.stringify(data.session), "utf8").toString("base64url");

  if (encodeURIComponent(encoded).length > MAX_UNCHUNKED_COOKIE_SIZE) {
    throw new Error(
      "sessionCookieHeader: fixture session cookie exceeds @supabase/ssr's " +
        "chunk size; this helper does not implement chunking",
    );
  }

  const cookieName = `sb-${projectRefFrom(SUPABASE_URL!)}-auth-token`;
  return `${cookieName}=${encodeURIComponent(encoded)}`;
}

function locationPathname(response: APIResponse): string {
  const location = response.headers()["location"];
  if (!location) {
    throw new Error("expected a Location header on a redirect response");
  }
  return new URL(location, BASE_URL).pathname;
}

async function get(
  request: APIRequestContext,
  path: string,
  cookie?: string,
): Promise<APIResponse> {
  return request.get(`${BASE_URL}${path}`, {
    headers: cookie ? { cookie } : undefined,
    maxRedirects: 0,
  });
}

/** The three routes proven for both the admin and non-admin session. */
const TEAM_ROUTES = ["/admin/teams", "/admin/requests"] as const;

test.describe("Admin console route smoke test (live)", () => {
  test.describe.configure({ mode: "serial", timeout: 60_000 });
  test.skip(!READY, ADMIN_SMOKE_SKIP_REASON);

  let admin: SupabaseClient; // service role
  let adminSession: Session; // is_admin = true
  let memberSession: Session; // signed in, not an admin

  const authUserIds: string[] = [];
  let programId: string | null = null;

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    admin = createAdminClient();

    [adminSession, memberSession] = await createLogins(
      admin,
      ["admin", "member"],
      { mark: MARK, password: PASSWORD, authUserIds },
    );

    const flip = await admin
      .from("users")
      .update({ is_admin: true })
      .eq("id", adminSession.userId);
    if (flip.error) {
      throw new Error(`flip is_admin: ${flip.error.message}`);
    }

    // A throwaway club program (T23's admin_create_program, minimal fields —
    // same shape proven in tests/admin-program-rpcs.spec.ts) to hit for the
    // /admin/teams/<id> 200/404 cases. Club org type takes no program_key.
    const created = await adminSession.client.rpc("admin_create_program", {
      p_org_type: "club",
      p_school_name: `${MARK} Smoke Club`,
      p_team: null,
      p_program_key: null,
      p_school_group: null,
      p_division: null,
      p_conference: null,
      p_city: "Austin",
      p_state: "TX",
      p_primary_domain: null,
    });
    if (created.error || typeof created.data !== "string") {
      throw new Error(
        `admin_create_program: ${created.error?.message ?? "no id returned"}`,
      );
    }
    programId = created.data;
  });

  test.afterAll(async () => {
    if (!admin) return;
    if (programId) {
      await admin
        .from("program_audit_log")
        .delete()
        .eq("program_id", programId);
      await admin.from("program_members").delete().eq("program_id", programId);
      await admin.from("programs").delete().eq("id", programId);
    }
    await deleteAuthUsers(admin, authUserIds);
  });

  // ── unauthenticated ─────────────────────────────────────────────────────

  for (const path of TEAM_ROUTES) {
    test(`unauthenticated GET ${path} redirects 307 to /login`, async ({
      request,
    }) => {
      const response = await get(request, path);
      expect(response.status()).toBe(307);
      expect(locationPathname(response)).toBe("/login");
    });
  }

  test("unauthenticated GET /admin/teams/<id> redirects 307 to /login", async ({
    request,
  }) => {
    const response = await get(request, `/admin/teams/${programId}`);
    expect(response.status()).toBe(307);
    expect(locationPathname(response)).toBe("/login");
  });

  test("/admin/claims redirects 307 to /admin/requests, unauthenticated or not", async ({
    request,
  }) => {
    const response = await get(request, "/admin/claims");
    expect(response.status()).toBe(307);
    expect(locationPathname(response)).toBe("/admin/requests");
  });

  // ── admin session ───────────────────────────────────────────────────────

  test("the admin session gets 200 on Teams, Requests and the team detail page", async ({
    request,
  }) => {
    const cookie = await sessionCookieHeader(adminSession);
    for (const path of [...TEAM_ROUTES, `/admin/teams/${programId}`]) {
      const response = await get(request, path, cookie);
      expect(response.status(), path).toBe(200);
    }
  });

  // ── non-admin session ───────────────────────────────────────────────────

  test("a signed-in non-admin session gets 404 on the same three routes", async ({
    request,
  }) => {
    const cookie = await sessionCookieHeader(memberSession);
    for (const path of [...TEAM_ROUTES, `/admin/teams/${programId}`]) {
      const response = await get(request, path, cookie);
      expect(response.status(), path).toBe(404);
    }
  });
});
