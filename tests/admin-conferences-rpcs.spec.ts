import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";
import { type SupabaseClient } from "@supabase/supabase-js";

import {
  HAVE_ENV,
  INSUFFICIENT_PRIVILEGE,
  SKIP_REASON,
  type Session,
  createAdminClient,
  runMarker,
} from "./fixtures/live-db";
import {
  demotePoolAdmin,
  clearPoolLeftovers,
  poolLogins,
} from "./fixtures/live-db-pool";

/**
 * `20260915100000_conferences_table.sql`'s sync triggers and
 * `20260915100100_admin_conference_rpcs.sql`'s admin RPCs, proven against the
 * live database rather than the migrations' own claims (T3, following T2):
 *
 *  1. `admin_upsert_conference` creates conferences whose generated `label`
 *     is `name (short_name)`, and a non-admin session gets `42501` from all
 *     five conference RPCs.
 *  2. `programs_sync_conference`: a known label resolves to its id; an unseen
 *     label creates a parsed conference only for `org_type='college'` written
 *     by an admin session or the service-role client, while a club keeps the
 *     text with `conference_id` null. Since
 *     `20260916100000_conferences_owner_gate_and_locks.sql` (T12) a program
 *     OWNER saving an unseen name through `update_program_settings` mints
 *     nothing either: the text is kept unlinked. The invariant is therefore
 *     the relaxed one — owner-typed text may sit on a college row with a null
 *     `conference_id`, but linked text always equals the conference's label
 *     (`conference_id is not null ⇒ conference = label`).
 *     `admin_set_program_conference` moves a program, rewrites the mirrored
 *     text and writes a `program.conference_changed` audit row.
 *  3. `conferences_mirror_label`: a rename rewrites every pointing program.
 *     `admin_merge_conferences` moves programs, deletes the source and returns
 *     the count, writing exactly one `reason: 'merge'` audit row per moved
 *     program; `admin_delete_conference` refuses a populated conference with
 *     `P0001` and succeeds once it is empty.
 *
 * Every conference name and program name starts with the run mark, so no
 * real conference or program is ever touched. The three logins are reused
 * pool users (`fixtures/live-db-pool`), never deleted: `afterAll` demotes the
 * admin through the service role, and `beforeAll` sweeps a crashed run's
 * programs and conferences by this file's marker.
 *
 * Run on demand:  npx playwright test admin-conferences-rpcs
 */

const RAISE_EXCEPTION = "P0001";

/** A crashed run is findable by hand:
 *  `select * from conferences where name like 'admin-conf-%'` and
 *  `select * from programs where school_name like 'admin-conf-%'`. */
const { mark: MARK } = runMarker("admin-conf");

/** Pool slots, prefixed with this spec's name so no other spec draws them. */
const SLOTS = [
  "admin-conferences-rpcs-admin",
  "admin-conferences-rpcs-stranger",
  "admin-conferences-rpcs-owner",
];

const NAME_A = `${MARK}-a League`;
const NAME_B = `${MARK}-b League`;
const LABEL_A = `${NAME_A} (ML)`;
const LABEL_B = `${NAME_B} (ML)`;

/** Unseen on a college program → a new, parsed conference. */
const UNSEEN_COLLEGE_LABEL = `${MARK}-new League (NL)`;
/** Unseen on a club program → text kept, no conference created. */
const UNSEEN_CLUB_LABEL = `${MARK}-club League (CL)`;

/** An owner typing an unseen name → text kept unlinked, nothing minted. */
const OWNER_LABEL = `${MARK}-owner League (OL)`;
/** The service-role client writing an unseen name → minted and linked. */
const SVC_LABEL = `${MARK}-svc League (SL)`;

const RENAMED_NAME_B = `${MARK}-b Renamed League`;
const RENAMED_LABEL_B = `${RENAMED_NAME_B} (MR)`;

test.describe("Admin conference RPC gates + sync invariant (live)", () => {
  test.describe.configure({ mode: "serial", timeout: 60_000 });
  test.skip(!HAVE_ENV, SKIP_REASON);

  let admin: SupabaseClient; // service role
  let adminSession: Session; // is_admin = true
  let stranger: Session; // not an admin
  let owner: Session; // program_members owner of ownerProgram, not an admin

  const programIds: string[] = [];

  let conferenceA: string;
  let conferenceB: string;
  let conferenceNew: string;

  let programOnA: string; // created with p_conference = LABEL_A
  let programUnseen: string; // created with an unseen college label, moved to B
  let programOnB: string; // created with p_conference = LABEL_B
  let clubProgram: string; // club with an unseen label
  let ownerProgram: string; // college whose owner saves an unseen label
  let svcProgram: string; // college the service-role client relabels

  const createCollege = async (suffix: string, conference: string) => {
    const result = await adminSession.client.rpc("admin_create_program", {
      p_org_type: "college",
      p_school_name: `${MARK} College ${suffix}`,
      p_team: "mens",
      p_program_key: `${MARK}-${suffix}`,
      p_school_group: `${MARK}-${suffix}`,
      p_division: "D1",
      p_conference: conference,
      p_city: null,
      p_state: null,
      p_primary_domain: null,
    });
    expect(result.error).toBeNull();
    expect(typeof result.data).toBe("string");
    programIds.push(result.data as string);
    return result.data as string;
  };

  const programRow = async (id: string) => {
    const row = await admin
      .from("programs")
      .select("conference, conference_id")
      .eq("id", id)
      .single();
    expect(row.error).toBeNull();
    return row.data!;
  };

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    admin = createAdminClient();

    // A crashed run's owner program goes with the pool sweep; its other
    // programs are ownerless and go by marker, and only then its conferences
    // (`on delete restrict` from programs). Every name starts with a mark, so
    // nothing outside this file matches.
    await clearPoolLeftovers(admin, SLOTS);
    const stalePrograms = await admin
      .from("programs")
      .delete()
      .like("school_name", "admin-conf-%");
    if (stalePrograms.error) {
      throw new Error(`programs sweep: ${stalePrograms.error.message}`);
    }
    const staleConferences = await admin
      .from("conferences")
      .delete()
      .like("name", "admin-conf-%");
    if (staleConferences.error) {
      throw new Error(`conferences sweep: ${staleConferences.error.message}`);
    }

    [adminSession, stranger, owner] = await poolLogins(admin, SLOTS);

    const flip = await admin
      .from("users")
      .update({ is_admin: true })
      .eq("id", adminSession.userId);
    if (flip.error) {
      throw new Error(`flip is_admin: ${flip.error.message}`);
    }
  });

  test.afterAll(async () => {
    if (!admin) return;

    const demoteError = await demotePoolAdmin(admin, adminSession);

    // Programs first — conferences.id is `on delete restrict` from programs.
    const leftover = await admin
      .from("programs")
      .select("id")
      .like("school_name", `${MARK}%`);
    const ids = new Set([
      ...programIds,
      ...(leftover.data ?? []).map((row) => row.id as string),
    ]);
    for (const id of ids) {
      await admin.from("program_audit_log").delete().eq("program_id", id);
      await admin.from("program_members").delete().eq("program_id", id);
      await admin.from("programs").delete().eq("id", id);
    }

    // Then every conference this run created (A, B, and the trigger-made new + svc).
    await admin.from("conferences").delete().like("name", `${MARK}%`);

    if (demoteError) throw new Error(demoteError);
  });

  // ── admin_upsert_conference + the five gates ──────────────────────────────

  test("an admin creates two conferences whose label is `name (ML)`", async () => {
    for (const name of [NAME_A, NAME_B]) {
      const result = await adminSession.client.rpc("admin_upsert_conference", {
        p_id: null,
        p_name: name,
        p_short_name: "ML",
        p_division: "D1",
        p_website: null,
      });
      expect(result.error).toBeNull();
      expect(typeof result.data).toBe("string");
      if (name === NAME_A) conferenceA = result.data as string;
      else conferenceB = result.data as string;
    }

    const rows = await admin
      .from("conferences")
      .select("id, name, short_name, division, label")
      .in("id", [conferenceA, conferenceB]);
    expect(rows.error).toBeNull();
    const byId = (id: string) => rows.data!.find((row) => row.id === id);
    expect(byId(conferenceA)).toMatchObject({
      name: NAME_A,
      short_name: "ML",
      division: "D1",
      label: LABEL_A,
    });
    expect(byId(conferenceB)).toMatchObject({
      name: NAME_B,
      short_name: "ML",
      division: "D1",
      label: LABEL_B,
    });
  });

  test("a non-admin session gets 42501 from all five conference RPCs", async () => {
    const calls: [string, Record<string, unknown>][] = [
      [
        "admin_upsert_conference",
        {
          p_id: null,
          p_name: `${MARK}-refused League`,
          p_short_name: "RL",
          p_division: null,
          p_website: null,
        },
      ],
      [
        "admin_merge_conferences",
        { p_source: conferenceA, p_target: conferenceB },
      ],
      ["admin_delete_conference", { p_id: conferenceA }],
      [
        "admin_set_program_conference",
        { p_program_id: randomUUID(), p_conference_id: conferenceA },
      ],
      ["admin_list_conferences", {}],
    ];

    for (const [fn, args] of calls) {
      const result = await stranger.client.rpc(fn, args);
      expect(result.error?.code, fn).toBe(INSUFFICIENT_PRIVILEGE);
    }

    // Nothing moved: both conferences survive, the refused one was never made.
    const rows = await admin
      .from("conferences")
      .select("id")
      .like("name", `${MARK}%`);
    expect(rows.data?.map((row) => row.id).sort()).toEqual(
      [conferenceA, conferenceB].sort(),
    );
  });

  // ── programs_sync_conference ──────────────────────────────────────────────

  test("admin_create_program with a known label links conference_id to that conference", async () => {
    programOnA = await createCollege("on-a", LABEL_A);
    expect(await programRow(programOnA)).toEqual({
      conference: LABEL_A,
      conference_id: conferenceA,
    });
  });

  test("an unseen label on a college creates a parsed conference; on a club it leaves conference_id null", async () => {
    programUnseen = await createCollege("unseen", UNSEEN_COLLEGE_LABEL);

    const created = await admin
      .from("conferences")
      .select("id, name, short_name, division, label")
      .eq("label", UNSEEN_COLLEGE_LABEL);
    expect(created.error).toBeNull();
    expect(created.data).toHaveLength(1);
    expect(created.data![0]).toMatchObject({
      name: `${MARK}-new League`,
      short_name: "NL",
      division: "D1",
      label: UNSEEN_COLLEGE_LABEL,
    });
    conferenceNew = created.data![0].id;

    expect(await programRow(programUnseen)).toEqual({
      conference: UNSEEN_COLLEGE_LABEL,
      conference_id: conferenceNew,
    });

    const club = await adminSession.client.rpc("admin_create_program", {
      p_org_type: "club",
      p_school_name: `${MARK} Club`,
      p_team: null,
      p_program_key: null,
      p_school_group: null,
      p_division: null,
      p_conference: UNSEEN_CLUB_LABEL,
      p_city: null,
      p_state: null,
      p_primary_domain: null,
    });
    expect(club.error).toBeNull();
    clubProgram = club.data as string;
    programIds.push(clubProgram);

    expect(await programRow(clubProgram)).toEqual({
      conference: UNSEEN_CLUB_LABEL,
      conference_id: null,
    });

    const noneForClub = await admin
      .from("conferences")
      .select("id")
      .eq("label", UNSEEN_CLUB_LABEL);
    expect(noneForClub.data).toHaveLength(0);
  });

  test("an owner saving an unseen conference through update_program_settings keeps the text unlinked and mints nothing", async () => {
    ownerProgram = await createCollege("owner", "");

    // `is_program_owner` reads `program_members.role` only; owner_user_id is
    // set too so the fixture looks like a claimed program.
    const claim = await admin
      .from("programs")
      .update({ owner_user_id: owner.userId, status: "active" })
      .eq("id", ownerProgram);
    expect(claim.error).toBeNull();
    const membership = await admin.from("program_members").insert({
      program_id: ownerProgram,
      user_id: owner.userId,
      role: "owner",
    });
    expect(membership.error).toBeNull();

    const current = await admin
      .from("programs")
      .select("school_name, team, upload_policy, events_policy")
      .eq("id", ownerProgram)
      .single();
    expect(current.error).toBeNull();

    // Argument list mirrors saveTeamSettings in
    // src/components/dashboard/settings/team-actions.ts.
    const save = await owner.client.rpc("update_program_settings", {
      p_program_id: ownerProgram,
      p_school_name: current.data!.school_name,
      p_team: current.data!.team,
      p_conference: OWNER_LABEL,
      p_home_venue: "",
      p_default_surface: null,
      p_season: "",
      p_players_can_upload: current.data!.upload_policy === "everyone",
      p_upload_policy: current.data!.upload_policy,
      p_events_policy: current.data!.events_policy,
    });
    expect(save.error).toBeNull();

    expect(await programRow(ownerProgram)).toEqual({
      conference: OWNER_LABEL,
      conference_id: null,
    });

    const minted = await admin
      .from("conferences")
      .select("id")
      .like("name", `${MARK}-owner%`);
    expect(minted.error).toBeNull();
    expect(minted.data).toHaveLength(0);
  });

  test("the service-role client writing an unseen conference on a college mints and links it", async () => {
    svcProgram = await createCollege("svc", "");

    // update_program_settings refuses a caller with no auth.uid(), so the
    // service role writes the programs row directly — the seed path.
    const write = await admin
      .from("programs")
      .update({ conference: SVC_LABEL })
      .eq("id", svcProgram);
    expect(write.error).toBeNull();

    const created = await admin
      .from("conferences")
      .select("id, name, short_name, label")
      .eq("label", SVC_LABEL);
    expect(created.error).toBeNull();
    expect(created.data).toHaveLength(1);
    expect(created.data![0]).toMatchObject({
      name: `${MARK}-svc League`,
      short_name: "SL",
      label: SVC_LABEL,
    });

    expect(await programRow(svcProgram)).toEqual({
      conference: SVC_LABEL,
      conference_id: created.data![0].id,
    });
  });

  test("admin_set_program_conference moves the program, rewrites its text and audits the change", async () => {
    const result = await adminSession.client.rpc(
      "admin_set_program_conference",
      { p_program_id: programUnseen, p_conference_id: conferenceB },
    );
    expect(result.error).toBeNull();

    expect(await programRow(programUnseen)).toEqual({
      conference: LABEL_B,
      conference_id: conferenceB,
    });

    const audit = await admin
      .from("program_audit_log")
      .select("actor_user_id, subject_id, details")
      .eq("program_id", programUnseen)
      .eq("action", "program.conference_changed");
    expect(audit.error).toBeNull();
    expect(audit.data).toHaveLength(1);
    expect(audit.data![0]).toMatchObject({
      actor_user_id: adminSession.userId,
      subject_id: conferenceB,
      details: {
        from: conferenceNew,
        to: conferenceB,
        by_admin: true,
        reason: "set",
      },
    });
  });

  // ── rename, merge, delete ─────────────────────────────────────────────────

  test("renaming B rewrites programs.conference for every program pointing at it", async () => {
    programOnB = await createCollege("on-b", LABEL_B);
    expect((await programRow(programOnB)).conference_id).toBe(conferenceB);

    const result = await adminSession.client.rpc("admin_upsert_conference", {
      p_id: conferenceB,
      p_name: RENAMED_NAME_B,
      p_short_name: "MR",
      p_division: "D1",
      p_website: null,
    });
    expect(result.error).toBeNull();
    expect(result.data).toBe(conferenceB);

    const pointing = await admin
      .from("programs")
      .select("id, conference")
      .eq("conference_id", conferenceB);
    expect(pointing.error).toBeNull();
    expect(pointing.data?.map((row) => row.id).sort()).toEqual(
      [programUnseen, programOnB].sort(),
    );
    for (const row of pointing.data!) {
      expect(row.conference).toBe(RENAMED_LABEL_B);
    }

    // A's program is untouched by B's rename.
    expect((await programRow(programOnA)).conference).toBe(LABEL_A);
  });

  test("admin_merge_conferences(A, B) moves A's programs, deletes A and returns the count", async () => {
    const before = await admin
      .from("programs")
      .select("id")
      .eq("conference_id", conferenceA);
    expect(before.error).toBeNull();
    const pointedAtA = before.data!.map((row) => row.id as string).sort();

    const result = await adminSession.client.rpc("admin_merge_conferences", {
      p_source: conferenceA,
      p_target: conferenceB,
    });
    expect(result.error).toBeNull();
    expect(result.data).toBe(1);

    expect(await programRow(programOnA)).toEqual({
      conference: RENAMED_LABEL_B,
      conference_id: conferenceB,
    });

    const gone = await admin
      .from("conferences")
      .select("id")
      .eq("id", conferenceA);
    expect(gone.data).toHaveLength(0);

    const audit = await admin
      .from("program_audit_log")
      .select("actor_user_id, subject_id, details")
      .eq("program_id", programOnA)
      .eq("action", "program.conference_changed");
    expect(audit.data).toHaveLength(1);
    expect(audit.data![0]).toMatchObject({
      actor_user_id: adminSession.userId,
      subject_id: conferenceB,
      details: {
        from: conferenceA,
        to: conferenceB,
        by_admin: true,
        reason: "merge",
      },
    });

    // One merge audit row per moved program — the CTE's count is the return.
    const mergeAudit = await admin
      .from("program_audit_log")
      .select("program_id")
      .eq("action", "program.conference_changed")
      .eq("details->>reason", "merge")
      .eq("subject_id", conferenceB);
    expect(mergeAudit.error).toBeNull();
    expect(mergeAudit.data).toHaveLength(result.data as number);
    expect(
      mergeAudit.data!.map((row) => row.program_id as string).sort(),
    ).toEqual(pointedAtA);
  });

  test("admin_delete_conference rejects a populated conference with P0001, then succeeds once it is empty", async () => {
    const refused = await adminSession.client.rpc("admin_delete_conference", {
      p_id: conferenceB,
    });
    expect(refused.error?.code).toBe(RAISE_EXCEPTION);

    const stillThere = await admin
      .from("conferences")
      .select("id")
      .eq("id", conferenceB);
    expect(stillThere.data).toHaveLength(1);

    // Move every program off B (to the trigger-created conference).
    for (const id of [programOnA, programUnseen, programOnB]) {
      const move = await adminSession.client.rpc(
        "admin_set_program_conference",
        { p_program_id: id, p_conference_id: conferenceNew },
      );
      expect(move.error).toBeNull();
      expect(await programRow(id)).toEqual({
        conference: UNSEEN_COLLEGE_LABEL,
        conference_id: conferenceNew,
      });
    }

    const deleted = await adminSession.client.rpc("admin_delete_conference", {
      p_id: conferenceB,
    });
    expect(deleted.error).toBeNull();

    const gone = await admin
      .from("conferences")
      .select("id")
      .eq("id", conferenceB);
    expect(gone.data).toHaveLength(0);
  });
});
