import { expect, test } from "@playwright/test";
import { type SupabaseClient } from "@supabase/supabase-js";

import {
  HAVE_ENV,
  SKIP_REASON,
  type Session,
  createAdminClient,
  runMarker,
} from "./fixtures/live-db";
import { clearPoolLeftovers, poolLogins } from "./fixtures/live-db-pool";

/**
 * Personal-workspace scoping on the dashboard home, proven against the live
 * database.
 *
 * The scenario this locks: one athlete who is ALSO rostered on a program. Their
 * program matches are legitimately readable — RLS's program policy is a UNION,
 * so it returns them — but the personal home (`/dashboard`) must not show them.
 * `matches.program_id` is nullable precisely so "no program" means the personal
 * workspace, and four home-surface reads carry that predicate:
 *
 *   1. `getOverallPerformance()`      — src/lib/data/performance-server.ts
 *   2. the recent-activity list       — src/app/dashboard/(home)/recent-activity.tsx
 *   3. the serve-placement preview    — src/components/dashboard/home/serve-placement-home.tsx
 *   4. `getActivityFeed()`'s personal branch — src/lib/data/activity-server.ts
 *
 * ── What this spec is, honestly ─────────────────────────────────────────────
 * It is a query-shape MIRROR, written AFTER the fix, not red-first. It does not
 * invoke the loaders: `getOverallPerformance()` and `getActivityFeed()` build
 * their Supabase client from request cookies and are not callable from the
 * Playwright node context, and the other two are browser-client effects inside
 * React components. So the spec issues the corrected queries itself — meaning
 * it would have passed against the unfixed source, and no TDD cycle happened
 * here. Its value is the opposite direction: the assertions are copied verbatim
 * from what the four call sites now write, so this file is the record of what
 * those shapes ARE. Whoever drops a predicate from one of them and re-syncs the
 * mirror here gets a red — verified by hand at authoring time: deleting
 * `.is("program_id", null)` from performance-server.ts's matches read and from
 * the mirrored assertion below made that assertion fail, with the program match
 * leaking into a one-element expectation. Note the honest limit of that: because
 * the spec issues its own query rather than calling the loader, editing the
 * source ALONE does not turn it red. Keep the mirror in sync when you touch any
 * of the four sites.
 *
 * This spec talks to the real Supabase project named in `.env.local` — the live
 * DB is this repo's only schema source of truth. Session plumbing (env loading,
 * skip guard) comes from `fixtures/live-db` and the athlete is a reused pool
 * user from `fixtures/live-db-pool`; every fixture row is created by the
 * service-role client in `beforeAll` under a per-run unique prefix and deleted
 * by id in `afterAll` (jobs, then matches — `matches.created_by` has no
 * cascade — then the membership, then the program). The pool user outlives
 * the run, and every read below expects exactly this run's rows, so
 * `beforeAll` first sweeps whatever an interrupted run left on it.
 *
 * Run on demand:  npx playwright test tests/personal-home-scope.spec.ts
 * (or the full suite via `npm run test`).
 */

/** A crashed run is findable by hand:
 *  `select * from programs where program_key like 'home-scope-%'`. */
const { mark: MARK } = runMarker("home-scope");

/** Pool slots, prefixed with this spec's name so no other spec draws them. */
const SLOTS = ["personal-home-scope-athlete"];

test.describe("personal home scoping (live DB)", () => {
  // One worker, in order: every test reads the beforeAll fixture.
  test.describe.configure({ mode: "serial", timeout: 60_000 });
  test.skip(!HAVE_ENV, SKIP_REASON);

  let admin: SupabaseClient;

  /** The athlete: owns a personal match AND a match filed under their program. */
  let athlete: Session;

  const programIds: string[] = [];

  let programId: string;
  let personalMatchId: string;
  let programMatchId: string;

  test.beforeAll(async () => {
    test.setTimeout(180_000);

    admin = createAdminClient();

    // Every assertion below is an exact list of this user's matches and jobs,
    // so the reused user must own none going in: an interrupted run's rows
    // would otherwise read as a leak. Jobs first, then the matches they hang
    // off (`matches.created_by` has no ON DELETE either way).
    const leftoverIds = await clearPoolLeftovers(admin, SLOTS);
    if (leftoverIds.length > 0) {
      const jobs = await admin
        .from("processing_jobs")
        .delete()
        .in("created_by", leftoverIds);
      if (jobs.error) throw new Error(`jobs sweep: ${jobs.error.message}`);
      const matches = await admin
        .from("matches")
        .delete()
        .in("created_by", leftoverIds);
      if (matches.error) {
        throw new Error(`matches sweep: ${matches.error.message}`);
      }
    }

    [athlete] = await poolLogins(admin, SLOTS);

    const program = await admin
      .from("programs")
      .insert({
        program_key: `${MARK}-p`,
        school_group: `${MARK}-p`,
        school_name: `Home Scope Test School ${MARK}`,
        team: "mens",
      })
      .select("id")
      .single();
    if (program.error) throw new Error(`program: ${program.error.message}`);
    programId = program.data.id;
    programIds.push(programId);

    const member = await admin.from("program_members").insert({
      program_id: programId,
      user_id: athlete.userId,
      role: "player",
    });
    if (member.error) throw new Error(`member: ${member.error.message}`);

    // Both matches are created BY the athlete. The only difference is
    // `program_id` — which is exactly the axis the four fixes filter on, so a
    // `created_by`-only read cannot tell them apart.
    const matches = await admin
      .from("matches")
      .insert([
        {
          created_by: athlete.userId,
          program_id: null,
          player1_id: athlete.userId,
          player1_name: "Home Scope Athlete",
          player2_name: "Home Scope Personal Opponent",
          date: new Date().toISOString(),
        },
        {
          created_by: athlete.userId,
          program_id: programId,
          player1_id: athlete.userId,
          player1_name: "Home Scope Athlete",
          player2_name: "Home Scope Program Opponent",
          date: new Date().toISOString(),
        },
      ])
      .select("id, program_id");
    if (matches.error) throw new Error(`matches: ${matches.error.message}`);
    personalMatchId = matches.data.find((m) => m.program_id === null)!.id;
    programMatchId = matches.data.find((m) => m.program_id === programId)!.id;

    // One job per match, both submitted by the athlete: the tray is scoped on
    // the JOB's created_by, so this is the pair that makes the second half of
    // the personal branch (`matches.program_id IS NULL`) load-bearing.
    const jobs = await admin.from("processing_jobs").insert([
      {
        match_id: personalMatchId,
        created_by: athlete.userId,
        status: "pending",
      },
      {
        match_id: programMatchId,
        created_by: athlete.userId,
        status: "pending",
      },
    ]);
    if (jobs.error) throw new Error(`processing_jobs: ${jobs.error.message}`);
  });

  test.afterAll(async () => {
    test.setTimeout(180_000);
    if (!admin) return;

    // Jobs, then matches: created_by has no ON DELETE. Then the membership and
    // the program. The pool user stays, so nothing here may lean on its delete.
    if (athlete) {
      await admin
        .from("processing_jobs")
        .delete()
        .eq("created_by", athlete.userId);
      await admin.from("matches").delete().eq("created_by", athlete.userId);
    }
    if (programIds.length > 0) {
      await admin.from("program_members").delete().in("program_id", programIds);
      await admin.from("programs").delete().in("id", programIds);
    }

    // Prove the teardown actually emptied: nothing under this run's marker may
    // survive. `programs` is the marker-bearing table; matches and jobs are
    // reachable only through ids we just deleted, so re-query those by id.
    // The three reads are independent, so they overlap rather than stack —
    // this runs on every `npm test`.
    // `filter(Boolean)` is not defensive noise: `afterAll` runs even when
    // `beforeAll` threw before assigning these, and `.in('id', [undefined])`
    // fails the uuid cast, returns `data: null`, and coalesces to `[]` below —
    // so the leftover check would pass vacuously on the one path it exists for.
    const matchIds = [personalMatchId, programMatchId].filter(Boolean);
    const [leftoverPrograms, leftoverMatches, leftoverJobs] = await Promise.all(
      [
        admin.from("programs").select("id").like("program_key", `${MARK}-%`),
        admin.from("matches").select("id").in("id", matchIds),
        admin.from("processing_jobs").select("id").in("match_id", matchIds),
      ],
    );
    expect(leftoverPrograms.data ?? []).toEqual([]);
    expect(leftoverMatches.data ?? []).toEqual([]);
    expect(leftoverJobs.data ?? []).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Fixture sanity — zero/one row below must mean "filtered", never "not there".
  // -------------------------------------------------------------------------

  test("the athlete can read BOTH matches (the leak is possible)", async () => {
    // RLS returns the program match too — its policy is a UNION. That is why
    // the four home surfaces need the `program_id IS NULL` predicate of their
    // own: without it, nothing stops the program match from landing on the
    // personal dashboard.
    const { data, error } = await athlete.client
      .from("matches")
      .select("id")
      .in("id", [personalMatchId, programMatchId]);
    expect(error).toBeNull();
    expect(new Set((data ?? []).map((m) => m.id))).toEqual(
      new Set([personalMatchId, programMatchId]),
    );
  });

  // -------------------------------------------------------------------------
  // The three `matches` reads, in the shapes the source now writes.
  // -------------------------------------------------------------------------

  test("getOverallPerformance() shape returns only the personal match", async () => {
    // src/lib/data/performance-server.ts — getOverallPerformance()
    const { data, error } = await athlete.client
      .from("matches")
      .select(
        "id, date, player1_id, player2_id, player1_name, player2_name, score",
      )
      .eq("created_by", athlete.userId)
      .is("program_id", null)
      .order("date", { ascending: false });

    expect(error).toBeNull();
    expect((data ?? []).map((m) => m.id)).toEqual([personalMatchId]);
  });

  test("recent-activity shape returns only the personal match", async () => {
    // src/app/dashboard/(home)/recent-activity.tsx
    const { data, error } = await athlete.client
      .from("matches")
      .select(
        "id, created_by, player1_name, player2_name, tournament_name, round, date, score, result, match_type, court_type, verified, duration, player1_id, player2_id, opponent_hand, opponent_backhand",
      )
      .eq("created_by", athlete.userId)
      .is("program_id", null)
      .order("date", { ascending: false })
      .limit(50);

    expect(error).toBeNull();
    expect((data ?? []).map((m) => m.id)).toEqual([personalMatchId]);
  });

  test("serve-placement-home shape returns only the personal match", async () => {
    // src/components/dashboard/home/serve-placement-home.tsx
    const { data, error } = await athlete.client
      .from("matches")
      .select("id, player1_name, player2_name")
      .eq("created_by", athlete.userId)
      .is("program_id", null)
      .order("date", { ascending: false })
      .limit(4);

    expect(error).toBeNull();
    expect((data ?? []).map((m) => m.id)).toEqual([personalMatchId]);
  });

  // -------------------------------------------------------------------------
  // The activity tray, both directions. Same base query, two branches.
  // -------------------------------------------------------------------------

  test("getActivityFeed() personal branch returns only the personal match job", async () => {
    // src/lib/data/activity-server.ts — the `workspace.kind !== 'team'` branch.
    const { data, error } = await athlete.client
      .from("processing_jobs")
      .select(
        "match_id, status, upload_progress_percent, derivation_version, created_at, matches!inner(player1_name, player2_name, program_id)",
      )
      .order("created_at", { ascending: false })
      .limit(10)
      .eq("created_by", athlete.userId)
      .is("matches.program_id", null);

    expect(error).toBeNull();
    expect((data ?? []).map((r) => r.match_id)).toEqual([personalMatchId]);
  });

  test("getActivityFeed() team branch returns only the program match job", async () => {
    // The other half of the same switch: a team workspace scopes on the
    // match's program, not on who submitted the job.
    const { data, error } = await athlete.client
      .from("processing_jobs")
      .select(
        "match_id, status, upload_progress_percent, derivation_version, created_at, matches!inner(player1_name, player2_name, program_id)",
      )
      .order("created_at", { ascending: false })
      .limit(10)
      .eq("matches.program_id", programId);

    expect(error).toBeNull();
    expect((data ?? []).map((r) => r.match_id)).toEqual([programMatchId]);
  });
});
