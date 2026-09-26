import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Upload eligibility on direct writes — the database side of
 * `src/lib/workspace/upload-eligibility.ts`, exercised as the signed-in
 * clients the wizard, `/api/upload` and `createProcessingJob()` actually are.
 *
 * Under test: `supabase/migrations/20260911000000_upload_eligibility.sql`.
 * The transitions it guards, each named by the write that IS the transition:
 *   - `matches` INSERT of an upload-shaped row (the wizard's create path);
 *   - `matches` UPDATE that turns a hand-recorded row into an upload;
 *   - `processing_jobs` INSERT — `createProcessingJob()` in
 *     `src/lib/services/splitstep/submit-match-video.ts`, the video
 *     transition, and the ONLY write the wizard's existing-match path makes
 *     to attach a video (it never inserts a match for a scheduled line whose
 *     row already exists);
 *   - `match_files` INSERT — `uploadMatchFile()` behind `/api/upload`, the
 *     same transition for a SwingVision import.
 * And what must keep working: hand-recorded scores, reads and unrelated
 * updates of historical rows, service-role processing, the scheduled-line
 * and regraft rules.
 *
 * THIS RUNS AGAINST A LOCAL DOCKER STACK ONLY — never the live project. It
 * reads `LOCAL_SUPABASE_URL` / `LOCAL_SUPABASE_ANON_KEY` /
 * `LOCAL_SUPABASE_SERVICE_ROLE_KEY` from the process environment (not from
 * `.env.local`, which names production), skips when they are unset so a
 * keyless checkout and CI stay green, and refuses any URL that is not
 * loopback. The stack is seeded from `tests/fixtures/local-supabase/
 * live-baseline.sql` — a RECONSTRUCTION of the live objects the migration
 * touches, not a dump — so a green run proves the migration applies over
 * those definitions and behaves as written. It does not prove production.
 *
 *   supabase start            # or: supabase db reset, after editing the SQL
 *   set -a; eval "$(supabase status -o env \
 *     --override-name api.url=LOCAL_SUPABASE_URL \
 *     --override-name auth.anon_key=LOCAL_SUPABASE_ANON_KEY \
 *     --override-name auth.service_role_key=LOCAL_SUPABASE_SERVICE_ROLE_KEY)"; set +a
 *   npx playwright test tests/upload-write-eligibility.spec.ts
 *
 * (`set -a` because `-o env` prints plain KEY="value" lines, which `eval`
 * would otherwise set without exporting.)
 */

// ---------------------------------------------------------------------------
// Environment — local only.
// ---------------------------------------------------------------------------

const LOCAL_URL = process.env.LOCAL_SUPABASE_URL;
const LOCAL_ANON_KEY = process.env.LOCAL_SUPABASE_ANON_KEY;
const LOCAL_SERVICE_ROLE_KEY = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;
const HAVE_LOCAL_ENV = Boolean(
  LOCAL_URL && LOCAL_ANON_KEY && LOCAL_SERVICE_ROLE_KEY,
);
const SKIP_REASON =
  "LOCAL_SUPABASE_URL / LOCAL_SUPABASE_ANON_KEY / LOCAL_SUPABASE_SERVICE_ROLE_KEY not set (local Docker stack only)";

function assertLoopback(url: string): void {
  const host = new URL(url).hostname;
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(host)) {
    throw new Error(
      `upload-write-eligibility runs against a local stack only; refusing ${host}`,
    );
  }
}

/** PostgREST surfaces the trigger's `errcode` as `error.code`. */
const INSUFFICIENT_PRIVILEGE = "42501";

type Session = { client: SupabaseClient; userId: string };

const RUN = `uwe-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
const PASSWORD = `Local-${randomUUID()}`;

function admin(): SupabaseClient {
  return createClient(LOCAL_URL!, LOCAL_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function login(
  root: SupabaseClient,
  label: string,
  authUserIds: string[],
): Promise<Session> {
  const email = `${RUN}-${label}@example.com`;
  const { data, error } = await root.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user)
    throw new Error(`createUser(${label}): ${error?.message}`);
  authUserIds.push(data.user.id);

  const client = createClient(LOCAL_URL!, LOCAL_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signIn = await client.auth.signInWithPassword({
    email,
    password: PASSWORD,
  });
  if (signIn.error)
    throw new Error(`signIn(${label}): ${signIn.error.message}`);
  return { client, userId: data.user.id };
}

// ---------------------------------------------------------------------------
// Row shapes — what the app actually writes.
// ---------------------------------------------------------------------------

type MatchRow = Record<string, unknown>;

/** The wizard's create path: a provider named, a non-manual method. */
function uploadRow(by: Session, overrides: MatchRow): MatchRow {
  return {
    player1_name: "Our Player",
    player2_name: "Their Player",
    date: "2026-09-01T12:00:00Z",
    source_provider: "swing-vision",
    analysis_method: "elc",
    created_by: by.userId,
    program_id: null,
    player1_id: null,
    ...overrides,
  };
}

/** `recordScore()` in src/lib/schedule/actions.ts: no provider, 'manual'. */
function manualRow(by: Session, overrides: MatchRow): MatchRow {
  return {
    ...uploadRow(by, overrides),
    source_provider: null,
    analysis_method: "manual",
    score: { player1: [6, 6], player2: [3, 4] },
    result: "Final Score",
    ...overrides,
  };
}

function expectRefused(
  result: { error: { code?: string; message: string } | null },
  says: RegExp,
): void {
  expect(result.error, "expected a refusal, got success").not.toBeNull();
  expect(result.error!.code).toBe(INSUFFICIENT_PRIVILEGE);
  expect(result.error!.message).toMatch(says);
}

async function insertMatch(s: Session, row: MatchRow) {
  return s.client.from("matches").insert(row).select("id").single();
}

async function insertJob(s: Session, matchId: string) {
  // `createProcessingJob()`'s columns, verbatim.
  return s.client
    .from("processing_jobs")
    .insert({
      match_id: matchId,
      created_by: s.userId,
      provider: "splitstep",
      status: "pending",
      start_time_seconds: 0,
      end_time_seconds: 600,
      billable_seconds: 600,
    })
    .select("id")
    .single();
}

async function insertFile(s: Session, matchId: string) {
  return s.client
    .from("match_files")
    .insert({
      match_id: matchId,
      uploaded_by: s.userId,
      provider_id: "swing-vision",
      file_name: "match.xlsx",
      storage_path: `${s.userId}/${matchId}/match.xlsx`,
    })
    .select("id")
    .single();
}

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

test.describe("upload eligibility on direct writes (local database)", () => {
  test.describe.configure({ mode: "serial", timeout: 60_000 });
  test.skip(!HAVE_LOCAL_ENV, SKIP_REASON);

  let root: SupabaseClient;

  // Logins.
  let owner: Session; // owner of ACTIVE and OWNER_ONLY; holds a player profile on ACTIVE
  let coach: Session; // coach of ACTIVE and OWNER_ONLY; no profile — a staff-only id
  let player: Session; // player on ACTIVE, upload_enabled, claimed profile
  let playerOff: Session; // player on ACTIVE, upload_enabled = false
  let pendingCoach: Session; // coach of PENDING
  let solo: Session; // no program — personal uploads
  let outsider: Session; // no program

  // Programs.
  let ACTIVE: string;
  let PENDING: string;
  let OWNER_ONLY: string;

  // Profiles (program_players.id).
  let ownerProfile: string;
  let playerProfile: string;
  let playerOffProfile: string;
  let unclaimedProfile: string;
  let archivedProfile: string;
  let pendingProfile: string;

  // A scheduled line on ACTIVE.
  let lineEntryId: string;

  // Rows created along the way.
  const authUserIds: string[] = [];
  let soloMatchId: string; // solo's personal upload
  let coachMatchId: string; // coach's upload for playerProfile
  let lineMatchId: string; // coach's hand-recorded score on the line, player1 = coach
  let histStaffMatchId: string; // service-role row: upload attributed to the coach's login
  let histPendingMatchId: string; // service-role row on the pending program

  test.beforeAll(async () => {
    assertLoopback(LOCAL_URL!);
    root = admin();

    [owner, coach, player, playerOff, pendingCoach, solo, outsider] =
      await Promise.all(
        [
          "owner",
          "coach",
          "player",
          "playeroff",
          "pending",
          "solo",
          "outsider",
        ].map((label) => login(root, label, authUserIds)),
      );

    const programs = await root
      .from("programs")
      .insert([
        {
          program_key: `${RUN}-active`,
          school_group: `${RUN}-active`,
          school_name: `Active U ${RUN}`,
          team: "mens",
          status: "active",
          upload_policy: "everyone",
        },
        {
          program_key: `${RUN}-pending`,
          school_group: `${RUN}-pending`,
          school_name: `Pending U ${RUN}`,
          team: "mens",
          status: "claim_pending",
          upload_policy: "everyone",
        },
        {
          program_key: `${RUN}-owner-only`,
          school_group: `${RUN}-owner-only`,
          school_name: `Owner Only U ${RUN}`,
          team: "mens",
          status: "active",
          upload_policy: "owner",
        },
      ])
      .select("id, program_key");
    if (programs.error) throw new Error(`programs: ${programs.error.message}`);
    const byKey = (k: string) =>
      programs.data!.find((p) => p.program_key === `${RUN}-${k}`)!.id as string;
    ACTIVE = byKey("active");
    PENDING = byKey("pending");
    OWNER_ONLY = byKey("owner-only");

    const members = await root.from("program_members").insert([
      // Every row names upload_enabled: a bulk insert fills a missing key
      // with an explicit null, and the column is NOT NULL.
      {
        program_id: ACTIVE,
        user_id: owner.userId,
        role: "owner",
        upload_enabled: true,
      },
      {
        program_id: ACTIVE,
        user_id: coach.userId,
        role: "coach",
        upload_enabled: true,
      },
      {
        program_id: ACTIVE,
        user_id: player.userId,
        role: "player",
        upload_enabled: true,
      },
      {
        program_id: ACTIVE,
        user_id: playerOff.userId,
        role: "player",
        upload_enabled: false,
      },
      {
        program_id: PENDING,
        user_id: pendingCoach.userId,
        role: "coach",
        upload_enabled: true,
      },
      {
        program_id: OWNER_ONLY,
        user_id: owner.userId,
        role: "owner",
        upload_enabled: true,
      },
      {
        program_id: OWNER_ONLY,
        user_id: coach.userId,
        role: "coach",
        upload_enabled: true,
      },
    ]);
    if (members.error) throw new Error(`members: ${members.error.message}`);

    const now = new Date().toISOString();
    const profiles = await root
      .from("program_players")
      .insert([
        {
          program_id: ACTIVE,
          first_name: "Owner",
          last_name: "Plays",
          claimed_by_user_id: owner.userId,
          claimed_at: now,
        },
        {
          program_id: ACTIVE,
          first_name: "Player",
          last_name: "One",
          claimed_by_user_id: player.userId,
          claimed_at: now,
        },
        {
          program_id: ACTIVE,
          first_name: "Player",
          last_name: "Off",
          claimed_by_user_id: playerOff.userId,
          claimed_at: now,
        },
        { program_id: ACTIVE, first_name: "Coach", last_name: "Managed" },
        {
          program_id: ACTIVE,
          first_name: "Former",
          last_name: "Player",
          archived_at: now,
        },
        { program_id: PENDING, first_name: "Pending", last_name: "Player" },
      ])
      .select("id, program_id, last_name");
    if (profiles.error) throw new Error(`profiles: ${profiles.error.message}`);
    const profile = (programId: string, lastName: string) =>
      profiles.data!.find(
        (p) => p.program_id === programId && p.last_name === lastName,
      )!.id as string;
    ownerProfile = profile(ACTIVE, "Plays");
    playerProfile = profile(ACTIVE, "One");
    playerOffProfile = profile(ACTIVE, "Off");
    unclaimedProfile = profile(ACTIVE, "Managed");
    archivedProfile = profile(ACTIVE, "Player");
    pendingProfile = profile(PENDING, "Player");

    const event = await root
      .from("program_events")
      .insert({
        program_id: ACTIVE,
        kind: "dual",
        name: `Dual ${RUN}`,
        starts_on: "2026-09-01",
        ends_on: "2026-09-01",
        site: "home",
        created_by: owner.userId,
      })
      .select("id")
      .single();
    if (event.error) throw new Error(`event: ${event.error.message}`);
    const entry = await root
      .from("program_event_entries")
      .insert({
        event_id: event.data.id,
        program_id: ACTIVE,
        discipline: "singles",
        slot: "1",
        position: 1,
        player_user_ids: [coach.userId],
        player_labels: ["Coach Who Plays"],
      })
      .select("id")
      .single();
    if (entry.error) throw new Error(`entry: ${entry.error.message}`);
    lineEntryId = entry.data.id as string;

    // Historical rows, written the way processing writes them: service role,
    // which the guards do not gate. One attributes an upload to the coach's
    // login (the shape the wizard used to produce); one sits on the pending
    // program.
    const hist = await root
      .from("matches")
      .insert([
        uploadRow(coach, {
          program_id: ACTIVE,
          player1_id: coach.userId,
          source_provider: "splitstep",
          analysis_method: "ai",
        }),
        uploadRow(pendingCoach, {
          program_id: PENDING,
          player1_id: pendingProfile,
        }),
      ])
      .select("id, program_id");
    if (hist.error) throw new Error(`historical rows: ${hist.error.message}`);
    histStaffMatchId = hist.data.find((m) => m.program_id === ACTIVE)!
      .id as string;
    histPendingMatchId = hist.data.find((m) => m.program_id === PENDING)!
      .id as string;
  });

  test.afterAll(async () => {
    if (!root) return;
    // matches.created_by has no cascade; jobs and files cascade from matches.
    await root.from("matches").delete().in("created_by", authUserIds);
    await root
      .from("programs")
      .delete()
      .in("id", [ACTIVE, PENDING, OWNER_ONLY].filter(Boolean));
    await Promise.allSettled(
      authUserIds.map((id) => root.auth.admin.deleteUser(id)),
    );
  });

  // -------------------------------------------------------------------------
  // The migration is present — a run against a bare baseline must not pass
  // by accident.
  // -------------------------------------------------------------------------

  test("the migration is applied to this database", async () => {
    const r = await root.rpc("match_is_upload_shaped", {
      p_source_provider: null,
      p_analysis_method: "manual",
    });
    expect(
      r.error,
      "20260911000000_upload_eligibility.sql is not applied",
    ).toBeNull();
    expect(r.data).toBe(false);
  });

  // -------------------------------------------------------------------------
  // matches INSERT — the wizard's create path.
  // -------------------------------------------------------------------------

  test("personal upload passes when the uploader is the athlete", async () => {
    const r = await insertMatch(
      solo,
      uploadRow(solo, { player1_id: solo.userId }),
    );
    expect(r.error).toBeNull();
    soloMatchId = r.data!.id as string;
  });

  test("personal upload refuses another account as the athlete", async () => {
    expectRefused(
      await insertMatch(solo, uploadRow(solo, { player1_id: outsider.userId })),
      /your own account/,
    );
  });

  test("coach uploads for a claimed roster profile", async () => {
    const r = await insertMatch(
      coach,
      uploadRow(coach, { program_id: ACTIVE, player1_id: playerProfile }),
    );
    expect(r.error).toBeNull();
    coachMatchId = r.data!.id as string;
  });

  test("coach uploads for a coach-managed (unclaimed) profile", async () => {
    const r = await insertMatch(
      coach,
      uploadRow(coach, { program_id: ACTIVE, player1_id: unclaimedProfile }),
    );
    expect(r.error).toBeNull();
  });

  test("owner with a player profile uploads for that profile", async () => {
    const r = await insertMatch(
      owner,
      uploadRow(owner, { program_id: ACTIVE, player1_id: ownerProfile }),
    );
    expect(r.error).toBeNull();
  });

  test("owner's login id is accepted because it holds a live profile here", async () => {
    const r = await insertMatch(
      owner,
      uploadRow(owner, { program_id: ACTIVE, player1_id: owner.userId }),
    );
    expect(r.error).toBeNull();
  });

  test("staff-only athlete id is refused: a coach's login as player1_id", async () => {
    // The gap this migration closes. The coach's program_members row used to
    // satisfy the regraft trigger's membership arm; role was never asked.
    expectRefused(
      await insertMatch(
        coach,
        uploadRow(coach, { program_id: ACTIVE, player1_id: coach.userId }),
      ),
      /isn't on .* roster/,
    );
  });

  test("an archived profile is not on the roster", async () => {
    expectRefused(
      await insertMatch(
        coach,
        uploadRow(coach, { program_id: ACTIVE, player1_id: archivedProfile }),
      ),
      /isn't on .* roster/,
    );
  });

  test("a pending program refuses uploads with the approval notice", async () => {
    expectRefused(
      await insertMatch(
        pendingCoach,
        uploadRow(pendingCoach, {
          program_id: PENDING,
          player1_id: pendingProfile,
        }),
      ),
      /awaiting approval/,
    );
  });

  test("player with upload enabled uploads for their own profile", async () => {
    const r = await insertMatch(
      player,
      uploadRow(player, { program_id: ACTIVE, player1_id: playerProfile }),
    );
    expect(r.error).toBeNull();
  });

  test("player with upload switched off is refused", async () => {
    expectRefused(
      await insertMatch(
        playerOff,
        uploadRow(playerOff, {
          program_id: ACTIVE,
          player1_id: playerOffProfile,
        }),
      ),
      /isn't switched on for your account/,
    );
  });

  test("upload_policy = owner: coach refused, owner permitted", async () => {
    expectRefused(
      await insertMatch(coach, uploadRow(coach, { program_id: OWNER_ONLY })),
      /limits uploads to owner only/,
    );
    const r = await insertMatch(
      owner,
      uploadRow(owner, { program_id: OWNER_ONLY }),
    );
    expect(r.error).toBeNull();
  });

  test("non-member is still refused by the existing membership rule", async () => {
    expectRefused(
      await insertMatch(
        outsider,
        uploadRow(outsider, { program_id: ACTIVE, player1_id: playerProfile }),
      ),
      /program you belong to/,
    );
  });

  // -------------------------------------------------------------------------
  // Hand-recorded scores keep today's rules — including the line rule.
  // -------------------------------------------------------------------------

  test("score-only entry on a scheduled line still passes, even naming a coach", async () => {
    const r = await insertMatch(
      coach,
      manualRow(coach, {
        program_id: ACTIVE,
        event_entry_id: lineEntryId,
        player1_id: coach.userId,
      }),
    );
    expect(r.error).toBeNull();
    lineMatchId = r.data!.id as string;
  });

  test("a player still cannot attach a match to a scheduled line", async () => {
    expectRefused(
      await insertMatch(
        player,
        manualRow(player, {
          program_id: ACTIVE,
          event_entry_id: lineEntryId,
          player1_id: playerProfile,
        }),
      ),
      /staff can attach a match to a scheduled line/,
    );
  });

  // -------------------------------------------------------------------------
  // matches UPDATE — only the transition INTO an upload is gated.
  // -------------------------------------------------------------------------

  test("correcting the score on a hand-recorded row is untouched", async () => {
    const r = await coach.client
      .from("matches")
      .update({ score: { player1: [7, 6], player2: [5, 4] } })
      .eq("id", lineMatchId)
      .select("id");
    expect(r.error).toBeNull();
    expect(r.data).toHaveLength(1);
  });

  test("turning that row into an upload is refused while player1_id is the coach", async () => {
    expectRefused(
      await coach.client
        .from("matches")
        .update({ source_provider: "swing-vision", analysis_method: "elc" })
        .eq("id", lineMatchId)
        .select("id")
        .single(),
      /isn't on .* roster/,
    );
  });

  test("re-attributed to a roster profile, the same transition passes", async () => {
    // The regraft trigger's UPDATE rule (same roster) admits the move.
    const moved = await coach.client
      .from("matches")
      .update({ player1_id: playerProfile })
      .eq("id", lineMatchId)
      .select("id");
    expect(moved.error).toBeNull();
    expect(moved.data).toHaveLength(1);

    const r = await coach.client
      .from("matches")
      .update({ source_provider: "swing-vision", analysis_method: "elc" })
      .eq("id", lineMatchId)
      .select("id");
    expect(r.error).toBeNull();
    expect(r.data).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // Historical rows: reads and unrelated updates untouched; the upload
  // transition re-asked.
  // -------------------------------------------------------------------------

  test("a historical staff-attributed upload is still readable by its program", async () => {
    const r = await coach.client
      .from("matches")
      .select("id, player1_id")
      .eq("id", histStaffMatchId);
    expect(r.error).toBeNull();
    expect(r.data).toHaveLength(1);
    expect(r.data![0].player1_id).toBe(coach.userId);
  });

  test("an unrelated update to that historical row is untouched", async () => {
    const r = await coach.client
      .from("matches")
      .update({
        tournament_name: "Renamed",
        score: { player1: [6], player2: [0] },
      })
      .eq("id", histStaffMatchId)
      .select("id");
    expect(r.error).toBeNull();
    expect(r.data).toHaveLength(1);
  });

  test("processing_jobs INSERT on that row is refused: the athlete is staff-only", async () => {
    expectRefused(
      await insertJob(coach, histStaffMatchId),
      /isn't on .* roster/,
    );
  });

  test("processing_jobs INSERT on a pending program's match is refused", async () => {
    expectRefused(
      await insertJob(pendingCoach, histPendingMatchId),
      /awaiting approval/,
    );
  });

  test("service-role processing still creates jobs on any row", async () => {
    const r = await root
      .from("processing_jobs")
      .insert({
        match_id: histPendingMatchId,
        created_by: pendingCoach.userId,
        provider: "splitstep",
        status: "queued",
      })
      .select("id")
      .single();
    expect(r.error).toBeNull();
  });

  // -------------------------------------------------------------------------
  // processing_jobs INSERT — createProcessingJob(), the video transition.
  // -------------------------------------------------------------------------

  test("coach creates the job for an eligible team upload", async () => {
    const r = await insertJob(coach, coachMatchId);
    expect(r.error).toBeNull();
  });

  test("personal: the creator creates the job", async () => {
    const r = await insertJob(solo, soloMatchId);
    expect(r.error).toBeNull();
  });

  test("personal: another account cannot attach a job to it", async () => {
    expectRefused(
      await insertJob(outsider, soloMatchId),
      /account that recorded it/,
    );
  });

  test("a non-member cannot attach a job to a team match", async () => {
    expectRefused(
      await insertJob(solo, coachMatchId),
      /do not have access to the workspace/,
    );
  });

  // -------------------------------------------------------------------------
  // match_files INSERT — uploadMatchFile(), the import transition.
  // -------------------------------------------------------------------------

  test("coach records the import file for an eligible team upload", async () => {
    const r = await insertFile(coach, coachMatchId);
    expect(r.error).toBeNull();
  });

  test("match_files INSERT on the staff-attributed row is refused", async () => {
    expectRefused(
      await insertFile(coach, histStaffMatchId),
      /isn't on .* roster/,
    );
  });

  test("match_files INSERT on a pending program's match is refused", async () => {
    expectRefused(
      await insertFile(pendingCoach, histPendingMatchId),
      /awaiting approval/,
    );
  });
});
