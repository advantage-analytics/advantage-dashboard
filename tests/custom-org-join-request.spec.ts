import { expect, test } from "@playwright/test";
import { type SupabaseClient } from "@supabase/supabase-js";

import {
  HAVE_ENV,
  SKIP_REASON,
  type Session,
  createAdminClient,
  runMarker,
} from "./fixtures/live-db";
import {
  clearPoolLeftovers,
  poolEmail,
  poolLogins,
} from "./fixtures/live-db-pool";
import { requestToJoinCustomOrg } from "@/lib/services/programs/join-custom-org";
import type { DbJoinRequestRow } from "@/lib/data/join-requests-server";

/**
 * T3 — a coach asking to join an existing custom org from 7.2, proven
 * against the live database.
 *
 * `askToJoinExistingTeam` (`claim/team/actions.ts`) is a Next server action,
 * which a spec cannot invoke; everything it decides lives in
 * `requestToJoinCustomOrg`, which takes the caller's session client and the
 * admin client as arguments precisely so this file can run it with a REAL
 * signed-in session. The action adds only the mail and the redirect.
 *
 * User A creates a custom org the way the product does (`create_custom_program`)
 * and owns it. User B, signed in and a member of nothing, asks to join it:
 *
 *  1. The ask files ONE `program_requests` row of kind `invite_request` for
 *     that program, carrying B's account address and profile name — never
 *     anything typed — and writes no new `programs` row.
 *  2. An identical second ask is refused as `already-requested`, and the open
 *     row count is still one.
 *  3. A, the owner, sees the request through `program_join_requests` — the
 *     RPC `getPendingJoinRequests()` calls for the roster's list.
 *  4. The owner asking to join their own org is refused as `already-member`;
 *     a college program is refused as `college`; an unknown id as
 *     `not-found`. None of those writes a row.
 *
 * Skips against production (`HAVE_ENV`) and needs the T1 migration applied,
 * since the org is made through the same RPC T1's spec uses. Cleanup deletes
 * the programs by id; `program_requests.program_id` cascades with them.
 * A crashed run's org is findable by hand:
 * `select * from programs where school_name like 'ZZ join custom_org%'`.
 *
 * Run on demand:  npx playwright test custom-org-join-request
 */

const { mark: MARK } = runMarker("custom-org-join");
const ORG_NAME = `ZZ join custom_org ${MARK}`;
const ORG_TYPE = "academy";

const SLOTS = [
  "custom-org-join-request-owner",
  "custom-org-join-request-coach",
];

// B's profile name, set through the service role so the filed row can be
// checked against it. Stored casing comes back verbatim.
const COACH_FIRST = "Rafael";
const COACH_LAST = "Osei";

test.describe("asking to join an existing custom org (live)", () => {
  test.describe.configure({ mode: "serial", timeout: 60_000 });
  test.skip(!HAVE_ENV, SKIP_REASON);

  let admin: SupabaseClient;
  let owner: Session; // user A: made the org, owns it
  let coach: Session; // user B: signed in, no membership anywhere

  let programId: string | null = null;
  let collegeId: string | null = null;

  test.beforeAll(async () => {
    test.setTimeout(180_000);
    admin = createAdminClient();

    await clearPoolLeftovers(admin, SLOTS);
    // A crashed run's college row is ownerless, so the pool sweep leaves it.
    const staleCollege = await admin
      .from("programs")
      .delete()
      .like("program_key", "custom-org-join-%");
    if (staleCollege.error) {
      throw new Error(`programs sweep: ${staleCollege.error.message}`);
    }

    [owner, coach] = await poolLogins(admin, SLOTS);

    const named = await admin
      .from("users")
      .update({ first_name: COACH_FIRST, last_name: COACH_LAST })
      .eq("id", coach.userId);
    if (named.error) throw new Error(`users: ${named.error.message}`);

    const created = await owner.client.rpc("create_custom_program", {
      p_name: ORG_NAME,
      p_org_type: ORG_TYPE,
    });
    if (created.error) {
      throw new Error(`create_custom_program: ${created.error.message}`);
    }
    programId = (created.data as { program_id: string }).program_id;

    const college = await admin
      .from("programs")
      .insert({
        program_key: `${MARK}-college`,
        school_group: `${MARK}-college`,
        school_name: `ZZ join college ${MARK}`,
        team: "mens",
      })
      .select("id")
      .single();
    if (college.error) throw new Error(`college: ${college.error.message}`);
    collegeId = college.data.id as string;
  });

  test.afterAll(async () => {
    test.setTimeout(180_000);
    if (!admin) return;
    // Requests cascade from the program; members are swept explicitly so the
    // pool's leftover check finds nothing pointing at the owner.
    if (programId) {
      await admin.from("program_members").delete().eq("program_id", programId);
      await admin.from("programs").delete().eq("id", programId);
    }
    if (collegeId) await admin.from("programs").delete().eq("id", collegeId);
    if (coach) {
      await admin
        .from("users")
        .update({ first_name: null, last_name: null })
        .eq("id", coach.userId);
    }
  });

  const ask = (session: Session, id: string, role?: string) =>
    requestToJoinCustomOrg(
      { session: session.client, admin },
      {
        programId: id,
        role,
      },
    );

  const openRequests = async () => {
    const { data, error } = await admin
      .from("program_requests")
      .select("id, kind, program_id, email, name, role, note, status")
      .eq("program_id", programId!)
      .eq("status", "open");
    if (error) throw new Error(`program_requests: ${error.message}`);
    return data;
  };

  test("the coach's ask files one invite_request carrying the session's own address and name", async () => {
    const result = await ask(coach, programId!, "assistant_coach");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.programId).toBe(programId);
    expect(result.programName).toBe(ORG_NAME);
    expect(result.requesterEmail).toBe(poolEmail(SLOTS[1]));
    expect(result.requesterName).toBe(`${COACH_FIRST} ${COACH_LAST}`);

    const rows = await openRequests();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: result.requestId,
      kind: "invite_request",
      program_id: programId,
      email: poolEmail(SLOTS[1]),
      name: `${COACH_FIRST} ${COACH_LAST}`,
      role: "assistant_coach",
      note: null,
      status: "open",
    });
  });

  test("an identical second ask is refused as already-requested and files nothing", async () => {
    const result = await ask(coach, programId!, "assistant_coach");
    expect(result).toEqual({ ok: false, reason: "already-requested" });
    expect(await openRequests()).toHaveLength(1);
  });

  test("the owner sees the request through program_join_requests", async () => {
    const { data, error } = await owner.client.rpc("program_join_requests", {
      p_program_id: programId,
    });
    expect(error).toBeNull();
    const rows = (data ?? []) as DbJoinRequestRow[];
    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe(poolEmail(SLOTS[1]));
    expect(rows[0].name).toBe(`${COACH_FIRST} ${COACH_LAST}`);
  });

  test("the owner, a college program and an unknown id are each refused without a row", async () => {
    expect(await ask(owner, programId!)).toEqual({
      ok: false,
      reason: "already-member",
    });
    expect(await ask(coach, collegeId!)).toEqual({
      ok: false,
      reason: "college",
    });
    expect(await ask(coach, "00000000-0000-4000-8000-000000000000")).toEqual({
      ok: false,
      reason: "not-found",
    });
    expect(await ask(coach, "not-a-uuid")).toEqual({
      ok: false,
      reason: "not-found",
    });

    const college = await admin
      .from("program_requests")
      .select("id")
      .eq("program_id", collegeId!);
    expect(college.error).toBeNull();
    expect(college.data).toEqual([]);
    expect(await openRequests()).toHaveLength(1);
  });

  test("programs still holds exactly one row with the org's name", async () => {
    const { data, error } = await admin
      .from("programs")
      .select("id")
      .eq("school_name", ORG_NAME);
    expect(error).toBeNull();
    expect(data).toEqual([{ id: programId }]);
  });
});
