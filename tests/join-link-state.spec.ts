import { expect, test } from "@playwright/test";

import { createLoader } from "./fixtures/vm-modules";

/**
 * `resolveJoinState()` — which screen `/join/[token]` opens — for every
 * `JoinState` kind, offline.
 *
 * `invite-acceptance.ts` is loaded through the vm loader with both Supabase
 * factories stubbed: the service-role client answers `program_invites`,
 * `programs`, `users`, `program_join_links` and `program_requests` from a
 * per-test scenario, and the cookie client answers `auth.getUser()` and the
 * `program_join_link_preview` RPC (the SQL row shape, read with
 * `.maybeSingle()`). `programs-server`, `person-name` and `tokens` are the
 * real modules, so display names and token hashing are what production runs.
 *
 * Orders pinned here:
 *   - an invitation carrying the token wins; the link preview is never asked
 *   - invite: already_used → expired → ready / wrong_account → sign_in → sign_up
 *   - link: not_found → link_full (no seat AND no roster match) →
 *     link_sign_up → link_requested (approve + open request) → link_ready
 */

type Row = Record<string, unknown>;

interface Scenario {
  /** `program_invites` row for the token's hash, or null for a miss. */
  invite?: Row | null;
  program?: Row | null;
  inviter?: Row | null;
  /** `accountExists()` — a `users` row for the invited address. */
  accountExists?: boolean;
  /** The cookie session's user, or null signed out. */
  user?: { id: string; email: string } | null;
  /** `program_join_link_preview` row, or null for an unknown/revoked token. */
  preview?: Row | null;
  previewError?: { message: string } | null;
  /** The live `program_join_links` row `hasOpenJoinRequest` reads. */
  link?: Row | null;
  openRequest?: boolean;
}

interface Read {
  table: string;
  select: string;
  filters: [string, string, unknown][];
}

const TOKEN = "tok_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnop";
const PROGRAM_ID = "11111111-1111-4111-8111-111111111111";
const INVITED = "player@example.com";

function load(scenario: Scenario) {
  const reads: Read[] = [];
  const rpcs: { name: string; args: unknown }[] = [];

  function answer(read: Read): { data: unknown; error: null } {
    switch (read.table) {
      case "program_invites":
        return { data: scenario.invite ?? null, error: null };
      case "programs":
        return { data: scenario.program ?? null, error: null };
      case "users":
        // Two reads hit `users`: the inviter's name, and `accountExists`.
        return read.select.includes("first_name")
          ? { data: scenario.inviter ?? null, error: null }
          : {
              data: scenario.accountExists ? { id: "existing" } : null,
              error: null,
            };
      case "program_join_links":
        return { data: scenario.link ?? null, error: null };
      case "program_requests":
        return {
          data: scenario.openRequest ? { id: "req-1" } : null,
          error: null,
        };
      default:
        throw new Error(`unexpected table ${read.table}`);
    }
  }

  const admin = {
    from(table: string) {
      const read: Read = { table, select: "", filters: [] };
      reads.push(read);
      const builder = {
        select(columns: string) {
          read.select = columns;
          return builder;
        },
        eq(column: string, value: unknown) {
          read.filters.push(["eq", column, value]);
          return builder;
        },
        is(column: string, value: unknown) {
          read.filters.push(["is", column, value]);
          return builder;
        },
        ilike(column: string, value: unknown) {
          read.filters.push(["ilike", column, value]);
          return builder;
        },
        limit: () => builder,
        maybeSingle: async () => answer(read),
      };
      return builder;
    },
  };

  const cookieClient = {
    auth: {
      getUser: async () => ({
        data: { user: scenario.user ?? null },
        error: null,
      }),
    },
    rpc(name: string, args: unknown) {
      rpcs.push({ name, args });
      return {
        maybeSingle: async () =>
          scenario.previewError
            ? { data: null, error: scenario.previewError }
            : { data: scenario.preview ?? null, error: null },
      };
    },
  };

  const loader = createLoader({
    stubs: {
      "@/lib/supabase/admin": { createAdminClient: () => admin },
      "@/lib/supabase/server": { createClient: async () => cookieClient },
    },
    globals: { Buffer },
  });

  const mod = loader.load("src/lib/services/programs/invite-acceptance.ts");
  const { programDisplayName } = loader.load(
    "src/lib/data/programs-server.ts",
  ) as { programDisplayName: (school: string, team: string | null) => string };

  return {
    reads,
    rpcs,
    programDisplayName,
    resolve: mod.resolveJoinState as (token: string) => Promise<unknown>,
  };
}

const FUTURE = new Date(Date.now() + 7 * 86_400_000).toISOString();
const PAST = new Date(Date.now() - 86_400_000).toISOString();

function inviteRow(overrides: Row = {}): Row {
  return {
    id: "inv-1",
    program_id: PROGRAM_ID,
    email: "Player@Example.com",
    role: "player",
    expires_at: FUTURE,
    accepted_at: null,
    invited_by: "coach-1",
    ...overrides,
  };
}

const PROGRAM = { school_name: "Lakeside", team: null, org_type: "college" };
const INVITER = { first_name: "elena", last_name: "vasquez" };

function previewRow(overrides: Row = {}): Row {
  return {
    program_name: "Northside Club",
    program_team: null,
    org_type: "club",
    mode: "open",
    seats_free: true,
    created_by_name: "Sam Coach",
    roster_match_name: null,
    ...overrides,
  };
}

const SIGNED_IN = { id: "u-1", email: "Joiner@Example.com" };

test.describe("resolveJoinState — invitation tokens", () => {
  test("an invitation carrying the token wins over a link with the same token", async () => {
    const { resolve, rpcs, reads } = load({
      invite: inviteRow(),
      program: PROGRAM,
      inviter: INVITER,
      user: { id: "u-1", email: INVITED },
      preview: previewRow(),
      link: { program_id: PROGRAM_ID },
    });
    const state = (await resolve(TOKEN)) as { kind: string };
    expect(state.kind).toBe("ready");
    expect(rpcs).toHaveLength(0);
    expect(reads.map((r) => r.table)).not.toContain("program_join_links");
  });

  test("the invitation is looked up by the token's hash, never the raw token", async () => {
    const { resolve, reads } = load({ invite: null, preview: null });
    await resolve(TOKEN);
    const lookup = reads.find((r) => r.table === "program_invites")!;
    const [, column, value] = lookup.filters[0];
    expect(column).toBe("token_hash");
    expect(value).toMatch(/^[0-9a-f]{64}$/);
    expect(value).not.toBe(TOKEN);
  });

  test("accepted → already_used, even when also expired", async () => {
    const { resolve } = load({
      invite: inviteRow({ accepted_at: PAST, expires_at: PAST }),
      program: PROGRAM,
    });
    expect(await resolve(TOKEN)).toEqual({
      kind: "already_used",
      programName: "Lakeside",
    });
  });

  test("past its expiry → expired, carrying the inviter's name", async () => {
    const { resolve } = load({
      invite: inviteRow({ expires_at: PAST }),
      program: PROGRAM,
      inviter: INVITER,
    });
    expect(await resolve(TOKEN)).toEqual({
      kind: "expired",
      programName: "Lakeside",
      inviterName: "Elena Vasquez",
    });
  });

  test("signed in as the invited address (any case) → ready", async () => {
    const { resolve } = load({
      invite: inviteRow(),
      program: { ...PROGRAM, org_type: "club" },
      inviter: INVITER,
      user: { id: "u-1", email: "PLAYER@example.com" },
    });
    expect(await resolve(TOKEN)).toEqual({
      kind: "ready",
      programName: "Lakeside",
      programOrgType: "club",
      programPilotEligible: false,
      role: "player",
      email: INVITED,
      inviterName: "Elena Vasquez",
    });
  });

  test("signed in as someone else → wrong_account", async () => {
    const { resolve } = load({
      invite: inviteRow(),
      program: PROGRAM,
      user: { id: "u-2", email: "Other@Example.com" },
    });
    expect(await resolve(TOKEN)).toEqual({
      kind: "wrong_account",
      programName: "Lakeside",
      invitedEmail: INVITED,
      signedInAs: "other@example.com",
    });
  });

  test("signed out with an existing account → sign_in", async () => {
    const { resolve, reads } = load({
      invite: inviteRow(),
      program: PROGRAM,
      user: null,
      accountExists: true,
    });
    expect(await resolve(TOKEN)).toEqual({ kind: "sign_in" });
    const lookup = reads.find(
      (r) => r.table === "users" && !r.select.includes("first_name"),
    )!;
    expect(lookup.filters).toContainEqual(["ilike", "email", INVITED]);
  });

  test("signed out with no account → sign_up; a vanished inviter and program fall back", async () => {
    const { resolve } = load({
      invite: inviteRow({ invited_by: null }),
      program: null,
      user: null,
      accountExists: false,
    });
    expect(await resolve(TOKEN)).toEqual({
      kind: "sign_up",
      programName: "your program",
      programOrgType: "college",
      programPilotEligible: false,
      role: "player",
      email: INVITED,
      inviterName: null,
    });
  });
});

test.describe("resolveJoinState — join links", () => {
  test("an unknown or revoked token (no preview row) → not_found", async () => {
    const { resolve, rpcs } = load({ invite: null, preview: null });
    expect(await resolve(TOKEN)).toEqual({ kind: "not_found" });
    expect(rpcs).toEqual([
      { name: "program_join_link_preview", args: { p_token: TOKEN } },
    ]);
  });

  test("a preview error reads as not_found", async () => {
    const { resolve } = load({
      invite: null,
      user: SIGNED_IN,
      previewError: { message: "boom" },
    });
    const errors: unknown[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => errors.push(args);
    try {
      expect(await resolve(TOKEN)).toEqual({ kind: "not_found" });
    } finally {
      console.error = original;
    }
    // Message only — the token is a credential.
    expect(JSON.stringify(errors)).not.toContain(TOKEN);
  });

  test("an empty token is not_found without asking the database", async () => {
    const { resolve, rpcs } = load({
      invite: inviteRow(),
      preview: previewRow(),
    });
    expect(await resolve("   ")).toEqual({ kind: "not_found" });
    expect(rpcs).toHaveLength(0);
  });

  test("signed out, seats free → link_sign_up", async () => {
    const { resolve, programDisplayName } = load({
      invite: null,
      user: null,
      preview: previewRow({
        program_name: "Lakeside",
        program_team: "womens",
        mode: "approve",
      }),
    });
    expect(await resolve(TOKEN)).toEqual({
      kind: "link_sign_up",
      programName: programDisplayName("Lakeside", "womens"),
      programOrgType: "club",
      programPilotEligible: false,
      mode: "approve",
    });
  });

  test("signed out and full → link_full, not sign-up", async () => {
    const { resolve } = load({
      invite: null,
      user: null,
      preview: previewRow({ seats_free: false }),
    });
    expect(await resolve(TOKEN)).toEqual({
      kind: "link_full",
      programName: "Northside Club",
      signedIn: false,
    });
  });

  test("signed in, seats_free=false, no roster match → link_full", async () => {
    const { resolve } = load({
      invite: null,
      user: SIGNED_IN,
      preview: previewRow({ seats_free: false }),
    });
    expect(await resolve(TOKEN)).toEqual({
      kind: "link_full",
      programName: "Northside Club",
      signedIn: true,
    });
  });

  test("signed in, full, but a roster row carries the address → link_ready, not full", async () => {
    const { resolve } = load({
      invite: null,
      user: SIGNED_IN,
      preview: previewRow({
        seats_free: false,
        roster_match_name: "  Jo Joiner ",
      }),
    });
    expect(await resolve(TOKEN)).toEqual({
      kind: "link_ready",
      programName: "Northside Club",
      programOrgType: "club",
      programPilotEligible: false,
      mode: "open",
      seatsFree: false,
      inviterName: "Sam Coach",
      rosterMatchName: "Jo Joiner",
    });
  });

  test("approve mode with an open request for the session's address → link_requested", async () => {
    const { resolve, reads } = load({
      invite: null,
      user: SIGNED_IN,
      preview: previewRow({ mode: "approve" }),
      link: { program_id: PROGRAM_ID },
      openRequest: true,
    });
    expect(await resolve(TOKEN)).toEqual({
      kind: "link_requested",
      programName: "Northside Club",
    });

    const link = reads.find((r) => r.table === "program_join_links")!;
    expect(link.filters).toEqual([
      ["eq", "token", TOKEN],
      ["is", "revoked_at", null],
    ]);
    const request = reads.find((r) => r.table === "program_requests")!;
    expect(request.filters).toEqual(
      expect.arrayContaining([
        ["eq", "kind", "invite_request"],
        ["eq", "program_id", PROGRAM_ID],
        ["eq", "status", "open"],
        ["ilike", "email", "joiner@example.com"],
      ]),
    );
  });

  test("approve mode with no open request → link_ready in approve mode", async () => {
    const { resolve } = load({
      invite: null,
      user: SIGNED_IN,
      preview: previewRow({ mode: "approve" }),
      link: { program_id: PROGRAM_ID },
      openRequest: false,
    });
    expect(await resolve(TOKEN)).toMatchObject({
      kind: "link_ready",
      mode: "approve",
    });
  });

  test("open mode never consults program_requests", async () => {
    const { resolve, reads } = load({
      invite: null,
      user: SIGNED_IN,
      preview: previewRow(),
      link: { program_id: PROGRAM_ID },
      openRequest: true,
    });
    expect(await resolve(TOKEN)).toMatchObject({ kind: "link_ready" });
    expect(reads.map((r) => r.table)).not.toContain("program_requests");
  });

  test("a pilot-eligible program's link carries it, read by token with the service role", async () => {
    const { resolve, reads } = load({
      invite: null,
      user: null,
      preview: previewRow({}),
      link: { program_id: PROGRAM_ID },
      program: { pilot_eligible: true },
    });
    expect(await resolve(TOKEN)).toMatchObject({
      kind: "link_sign_up",
      programPilotEligible: true,
    });
    const linkRead = reads.find((r) => r.table === "program_join_links");
    expect(linkRead?.filters).toEqual([
      ["eq", "token", TOKEN],
      ["is", "revoked_at", null],
    ]);
    const programRead = reads.filter((r) => r.table === "programs").pop();
    expect(programRead?.filters).toEqual([["eq", "id", PROGRAM_ID]]);
  });

  test("open mode, signed in → link_ready carrying rosterMatchName from the preview", async () => {
    const { resolve } = load({
      invite: null,
      user: SIGNED_IN,
      preview: previewRow({
        roster_match_name: "Jo Joiner",
        created_by_name: "sam coach",
      }),
    });
    expect(await resolve(TOKEN)).toEqual({
      kind: "link_ready",
      programName: "Northside Club",
      programOrgType: "club",
      programPilotEligible: false,
      mode: "open",
      seatsFree: true,
      inviterName: "Sam Coach",
      rosterMatchName: "Jo Joiner",
    });
  });

  test("a preview with no creator, org type or name falls back", async () => {
    const { resolve } = load({
      invite: null,
      user: SIGNED_IN,
      preview: previewRow({
        program_name: null,
        org_type: null,
        created_by_name: null,
        mode: "something-else",
      }),
    });
    expect(await resolve(TOKEN)).toEqual({
      kind: "link_ready",
      programName: "your program",
      programOrgType: "college",
      programPilotEligible: false,
      mode: "open",
      seatsFree: true,
      inviterName: null,
      rosterMatchName: null,
    });
  });
});
