import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdminUploadContext } from "@/lib/data/admin-upload-server";
import type { WorkspaceContextValue } from "@/lib/workspace/types";

const PROGRAM = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const ACTOR = "admin-login";
type Row = Record<string, unknown>;

function harness() {
  const tables: Record<string, Row[]> = {
    programs: [
      {
        id: PROGRAM,
        school_name: "Westfield",
        team: "mens",
        status: "active",
        org_type: "college",
        time_zone: "UTC",
        players_can_upload: false,
        upload_policy: "owner",
        events_policy: "owner",
      },
    ],
    program_players: [],
    program_members: [],
    users: [],
    processing_usage: [
      {
        account_id: PROGRAM,
        account_type: "program",
        billing_month: "2026-09-01",
        released: false,
        actual_seconds: 20,
        reserved_seconds: 100,
      },
      {
        account_id: PROGRAM,
        account_type: "program",
        billing_month: "2026-09-01",
        released: false,
        actual_seconds: null,
        reserved_seconds: 50,
      },
      {
        account_id: PROGRAM,
        account_type: "program",
        billing_month: "2026-09-01",
        released: true,
        reserved_seconds: 999,
      },
      {
        account_id: OTHER,
        account_type: "program",
        billing_month: "2026-09-01",
        released: false,
        reserved_seconds: 999,
      },
      {
        account_id: PROGRAM,
        account_type: "individual",
        billing_month: "2026-09-01",
        released: false,
        reserved_seconds: 999,
      },
      {
        account_id: PROGRAM,
        account_type: "program",
        billing_month: "2026-08-01",
        released: false,
        reserved_seconds: 999,
      },
    ],
  };
  let authorized = true;
  let failure: string | null = null;
  const calls: string[] = [];
  const session = {
    active: { id: "personal" },
    available: [],
    viewer: { id: ACTOR, name: "Admin", email: "admin@example.test" },
  } as unknown as WorkspaceContextValue;
  const client = {
    from(table: string) {
      calls.push(table);
      let rows = tables[table];
      let start = 0;
      let end = Infinity;
      const query = {
        order() {
          return query;
        },
        range(from: number, to: number) {
          start = from;
          end = to + 1;
          return query;
        },
        select() {
          return query;
        },
        eq(key: string, value: unknown) {
          rows = rows.filter((r) => r[key] === value);
          return query;
        },
        is(key: string, value: unknown) {
          rows = rows.filter((r) => r[key] === value);
          return query;
        },
        in(key: string, values: unknown[]) {
          rows = rows.filter((r) => values.includes(r[key]));
          return query;
        },
        maybeSingle() {
          return Promise.resolve({
            data: rows[0] ?? null,
            error: table === failure ? {} : null,
          });
        },
        then(resolve: (value: unknown) => unknown) {
          return Promise.resolve({
            data: rows.slice(start, end),
            error: table === failure ? {} : null,
          }).then(resolve);
        },
      };
      return query;
    },
  } as unknown as SupabaseClient;
  const deps = {
    requireAdmin: async () => {
      calls.push("guard");
      return authorized ? { id: ACTOR } : null;
    },
    createAdminClient: () => {
      calls.push("service-client");
      return client;
    },
    getWorkspaceContext: async () => session,
    now: () => new Date("2026-09-17T00:00:00Z"),
  };
  return {
    tables,
    session,
    calls,
    deps,
    deny: () => {
      authorized = false;
    },
    fail: (table: string) => {
      failure = table;
    },
  };
}

function profile(id: string, user: string | null, overrides: Row = {}): Row {
  return {
    id,
    program_id: PROGRAM,
    first_name: id,
    last_name: "Player",
    email: null,
    class_year: null,
    lineup_spot: null,
    claimed_by_user_id: user,
    archived_at: null,
    merged_into_id: null,
    ...overrides,
  };
}

function user(id: string): Row {
  return {
    id,
    first_name: id,
    last_name: null,
    email: `${id}@example.test`,
    class: "Junior",
  };
}

test("non-admin and malformed targets refuse before service access", async () => {
  const h = harness();
  h.deny();
  expect(await getAdminUploadContext(PROGRAM, h.deps)).toMatchObject({
    ok: false,
    reason: "admin-required",
  });
  expect(h.calls).toEqual(["guard"]);
  const admin = harness();
  expect(await getAdminUploadContext("bad-id", admin.deps)).toMatchObject({
    ok: false,
    reason: "invalid-program-id",
  });
  expect(admin.calls).toEqual(["guard"]);
  expect(await getAdminUploadContext(OTHER, admin.deps)).toMatchObject({
    ok: false,
    reason: "program-not-found",
  });
  expect(admin.calls).toEqual(["guard", "guard", "service-client", "programs"]);
});

test("non-member admin retains actor and active workspace while billing the selected program", async () => {
  const h = harness();
  const before = JSON.stringify(h.session);
  const result = await getAdminUploadContext(PROGRAM, h.deps);
  expect(result).toMatchObject({
    ok: true,
    context: {
      source: "admin",
      actorId: ACTOR,
      viewer: h.session.viewer,
      workspace: {
        id: PROGRAM,
        kind: "team",
        programStatus: "active",
        canSubmitVideo: true,
      },
      roster: [],
      videoAllowance: {
        accountId: PROGRAM,
        accountType: "program",
        usedSeconds: 70,
        capSeconds: 270000,
        remainingSeconds: 269930,
        billingMonth: "2026-09-01",
      },
    },
  });
  expect(h.calls.slice(0, 3)).toEqual(["guard", "service-client", "programs"]);
  expect(JSON.stringify(h.session)).toBe(before);
  expect(JSON.stringify(result)).not.toContain("service-client");
});

test("roster preserves profile IDs, safety-arm exclusions and actor's own staff profile", async () => {
  const h = harness();
  h.tables.program_players = [
    profile("coach-managed", null, { lineup_spot: 1 }),
    profile("claimed", "player-login", { lineup_spot: 2 }),
    profile("archived", "archived-login", { archived_at: "2026-09-01" }),
    profile("merged", "merged-login", { merged_into_id: "claimed" }),
    profile("staff-profile", "coach-login"),
    profile("own-profile", ACTOR, { lineup_spot: 3 }),
    profile("other-program", null, { program_id: OTHER }),
  ];
  h.tables.program_members = [
    ...["player-login", "archived-login", "merged-login", "legacy-login"].map(
      (user_id) => ({
        program_id: PROGRAM,
        user_id,
        role: "player",
        ladder_position: null,
      }),
    ),
    { program_id: PROGRAM, user_id: "coach-login", role: "coach" },
    { program_id: PROGRAM, user_id: ACTOR, role: "owner" },
    { program_id: OTHER, user_id: "other-login", role: "player" },
  ];
  h.tables.users = [
    "player-login",
    "archived-login",
    "merged-login",
    "legacy-login",
    "coach-login",
    ACTOR,
    "other-login",
  ].map(user);
  const result = await getAdminUploadContext(PROGRAM, h.deps);
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.context.roster.map((r) => r.playerId)).toEqual([
    "coach-managed",
    "claimed",
    "own-profile",
    "legacy-login",
    "merged-login",
  ]);
  expect(result.context.roster[1]).toMatchObject({
    userId: "player-login",
    email: "player-login@example.test",
    classYear: "Junior",
  });
});

for (const status of ["claim_pending", "suspended", "unclaimed"]) {
  test(`${status} remains visible but cannot send video; custom tier stays reduced`, async () => {
    const h = harness();
    Object.assign(h.tables.programs[0], { status, org_type: "club" });
    expect(await getAdminUploadContext(PROGRAM, h.deps)).toMatchObject({
      ok: true,
      context: {
        workspace: { programStatus: status, canSubmitVideo: false },
        videoAllowance: { capSeconds: 7200, accountType: "program" },
      },
    });
  });
}

for (const table of [
  "programs",
  "program_players",
  "program_members",
  "users",
  "processing_usage",
]) {
  test(`${table} failure refuses instead of returning partial permissions or zero usage`, async () => {
    const h = harness();
    h.tables.program_players = [profile("claimed", "player-login")];
    h.fail(table);
    expect(await getAdminUploadContext(PROGRAM, h.deps)).toMatchObject({
      ok: false,
      reason: "read-failed",
    });
  });
}

test("allowance and roster read beyond the first response page", async () => {
  const h = harness();
  h.tables.program_players = Array.from({ length: 1001 }, (_, i) =>
    profile(`player-${i}`, null),
  );
  h.tables.processing_usage = Array.from({ length: 1001 }, () => ({
    account_id: PROGRAM,
    account_type: "program",
    billing_month: "2026-09-01",
    released: false,
    reserved_seconds: 10,
    actual_seconds: null,
  }));
  const result = await getAdminUploadContext(PROGRAM, h.deps);
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.context.roster).toHaveLength(1001);
  expect(result.context.videoAllowance.usedSeconds).toBe(10010);
});
