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
import { clearPoolLeftovers, poolLogins } from "./fixtures/live-db-pool";
import {
  ACQUISITION_SOURCES,
  RECORDING_SOURCES,
  ROSTER_SIZE_BANDS,
  WEEKLY_FILM_BANDS,
} from "@/app/onboarding/answers";

/**
 * The onboarding intake answers' rules, proven against the live database.
 *
 * `20260926182506_onboarding_intake_answers.sql` puts screens 1.5 and 1.7 on
 * `public.users` and screen 5.2's two bands on `public.programs`. The server
 * actions validate the same vocabularies, but the CHECK constraints and the
 * RPC are what keep every other writer honest, so they are asserted from
 * real RLS-scoped sessions rather than the service role:
 *
 *  1. Every value `src/app/onboarding/answers.ts` offers is one the
 *     constraints accept on an own-row update — a vocabulary that drifted
 *     from the SQL would make the onboarding step fail for real users on
 *     exactly the answer nobody tested.
 *  2. An unknown `recording_source`, and a free-text detail beside any source
 *     but `other` — including no source at all, which the original
 *     `acquisition_source = 'other'` let through because a NULL comparison
 *     passes a CHECK — are refused with `23514`.
 *  3. The own-row `users` policy means another user's row is silently
 *     untouched (0 rows, no error) — never written.
 *  4. `set_program_intake` is owner-only (`42501` for a coach and for a
 *     stranger) and, for the owner of a program minted through
 *     `create_custom_program`, writes both bands.
 *
 * The three logins are reused pool users (`fixtures/live-db-pool`), never
 * deleted. The pool does not reset the intake columns, so this spec nulls
 * them itself, before and after. The program is owned by the owner slot
 * (`owner_user_id`), so a crashed run's copy is swept by `clearPoolLeftovers`
 * — which also matters because `create_custom_program` caps an account at two.
 *
 * Run on demand:  npx playwright test tests/onboarding-intake-live.spec.ts
 */

const CHECK_VIOLATION = "23514";

/** A crashed run is findable by hand:
 *  `select * from programs where school_name like 'Intake onboarding-intake-%'`. */
const { mark: MARK } = runMarker("onboarding-intake");

/** Pool slots, prefixed with this spec's name so no other spec draws them. */
const SLOTS = [
  "onboarding-intake-live-owner",
  "onboarding-intake-live-coach",
  "onboarding-intake-live-stranger",
];

/** What a pool user looks like before and after this spec. */
const CLEARED_INTAKE = {
  recording_source: null,
  acquisition_source: null,
  acquisition_source_detail: null,
} as const;

test.describe("Onboarding intake — constraints and set_program_intake (live)", () => {
  test.describe.configure({ mode: "serial", timeout: 60_000 });
  test.skip(!HAVE_ENV, SKIP_REASON);

  let admin: SupabaseClient;
  let owner: Session;
  let coach: Session;
  let stranger: Session; // no membership anywhere

  let programId: string | undefined;

  async function clearIntake(userIds: string[]) {
    const { error } = await admin
      .from("users")
      .update(CLEARED_INTAKE)
      .in("id", userIds);
    if (error) throw new Error(`intake reset: ${error.message}`);
  }

  /** An own-row update through the caller's RLS-scoped client. */
  function updateOwnRow(session: Session, values: Record<string, unknown>) {
    return session.client
      .from("users")
      .update(values)
      .eq("id", session.userId)
      .select(
        "id, recording_source, acquisition_source, acquisition_source_detail",
      );
  }

  test.beforeAll(async () => {
    test.setTimeout(180_000);
    admin = createAdminClient();

    // A crashed run's program is owned by the owner slot, so the pool sweep
    // takes it and the coach membership with it.
    const slotIds = await clearPoolLeftovers(admin, SLOTS);
    if (slotIds.length > 0) await clearIntake(slotIds);

    [owner, coach, stranger] = await poolLogins(admin, SLOTS);

    // Minted exactly as the self-serve flow does it: by the owner's own
    // session, so the owner membership and `owner_user_id` are the RPC's.
    const created = await owner.client.rpc("create_custom_program", {
      p_name: `Intake ${MARK}`,
      p_org_type: "club",
    });
    if (created.error) {
      throw new Error(`create_custom_program: ${created.error.message}`);
    }
    programId = (created.data as { program_id?: string } | null)?.program_id;
    if (!programId) throw new Error("create_custom_program returned no id");

    const member = await admin
      .from("program_members")
      .insert({ program_id: programId, user_id: coach.userId, role: "coach" });
    if (member.error) throw new Error(`coach: ${member.error.message}`);
  });

  test.afterAll(async () => {
    test.setTimeout(180_000);
    if (!admin) return;
    // Children before parents, by program id: the users stay, so nothing
    // cascades from them. Runs whether or not an assertion failed.
    if (programId) {
      await admin
        .from("program_audit_log")
        .delete()
        .eq("program_id", programId);
      await admin.from("program_members").delete().eq("program_id", programId);
      await admin.from("programs").delete().eq("id", programId);
    }
    const ids = [owner, coach, stranger]
      .filter((s): s is Session => Boolean(s))
      .map((s) => s.userId);
    if (ids.length > 0) await clearIntake(ids);
  });

  // ── users: allowed values ─────────────────────────────────────────────────

  test("every recording_source the onboarding step offers is accepted", async () => {
    for (const { value } of RECORDING_SOURCES) {
      const { data, error } = await updateOwnRow(owner, {
        recording_source: value,
      });
      expect(error, value).toBeNull();
      expect(data, value).toHaveLength(1);
      expect(data![0].recording_source).toBe(value);
    }
  });

  test("every acquisition_source the onboarding step offers is accepted", async () => {
    for (const { value } of ACQUISITION_SOURCES) {
      const { data, error } = await updateOwnRow(owner, {
        acquisition_source: value,
        acquisition_source_detail: null,
      });
      expect(error, value).toBeNull();
      expect(data, value).toHaveLength(1);
      expect(data![0].acquisition_source).toBe(value);
    }
  });

  test("a detail is accepted beside acquisition_source 'other'", async () => {
    const detail = "A friend at the club";
    const { data, error } = await updateOwnRow(owner, {
      acquisition_source: "other",
      acquisition_source_detail: detail,
    });
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0].acquisition_source).toBe("other");
    expect(data![0].acquisition_source_detail).toBe(detail);
  });

  // ── users: refused values ─────────────────────────────────────────────────

  test("an unknown recording_source is refused with 23514", async () => {
    const { data, error } = await updateOwnRow(owner, {
      recording_source: "carrier-pigeon",
    });
    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(error!.code).toBe(CHECK_VIOLATION);
  });

  test("a detail beside any source but 'other' is refused with 23514", async () => {
    const others = ACQUISITION_SOURCES.filter(({ value }) => value !== "other");
    expect(others.length).toBeGreaterThan(0);
    for (const { value } of others) {
      const { data, error } = await updateOwnRow(owner, {
        acquisition_source: value,
        acquisition_source_detail: "should not be kept",
      });
      expect(data, value).toBeNull();
      expect(error, value).not.toBeNull();
      expect(error!.code, value).toBe(CHECK_VIOLATION);
    }
  });

  test("a detail with no acquisition_source is refused with 23514", async () => {
    // `acquisition_source = 'other'` is NULL — and so passes — when the source
    // is NULL; `is not distinct from` (T7) makes it false instead.
    const { data, error } = await updateOwnRow(owner, {
      acquisition_source: null,
      acquisition_source_detail: "no source given",
    });
    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(error!.code).toBe(CHECK_VIOLATION);
  });

  // ── users: own-row RLS ────────────────────────────────────────────────────

  test("another user's row is untouched: 0 rows, no error", async () => {
    await clearIntake([owner.userId]);

    const { data, error } = await stranger.client
      .from("users")
      .update({ recording_source: "video", acquisition_source: "google" })
      .eq("id", owner.userId)
      .select("id");
    expect(error).toBeNull();
    expect(data).toHaveLength(0);

    const after = await admin
      .from("users")
      .select("recording_source, acquisition_source")
      .eq("id", owner.userId)
      .single();
    expect(after.error).toBeNull();
    expect(after.data).toEqual({
      recording_source: null,
      acquisition_source: null,
    });
  });

  // ── set_program_intake ────────────────────────────────────────────────────

  test("set_program_intake refuses a coach and a stranger with 42501", async () => {
    for (const [who, session] of [
      ["coach", coach],
      ["stranger", stranger],
    ] as const) {
      const { error } = await session.client.rpc("set_program_intake", {
        p_program_id: programId,
        p_roster_size_band: ROSTER_SIZE_BANDS[0].value,
        p_weekly_film_band: WEEKLY_FILM_BANDS[0].value,
      });
      expect(error, who).not.toBeNull();
      expect(error!.code, who).toBe(INSUFFICIENT_PRIVILEGE);
    }

    const row = await admin
      .from("programs")
      .select("roster_size_band, weekly_film_band")
      .eq("id", programId!)
      .single();
    expect(row.error).toBeNull();
    expect(row.data).toEqual({
      roster_size_band: null,
      weekly_film_band: null,
    });
  });

  test("set_program_intake writes both bands for the owner", async () => {
    const roster = ROSTER_SIZE_BANDS[ROSTER_SIZE_BANDS.length - 1].value;
    const film = WEEKLY_FILM_BANDS[WEEKLY_FILM_BANDS.length - 1].value;

    const { error } = await owner.client.rpc("set_program_intake", {
      p_program_id: programId,
      p_roster_size_band: roster,
      p_weekly_film_band: film,
    });
    expect(error).toBeNull();

    // Read back through the owner's own session: a custom org is readable by
    // its owner only, so this also proves the owner still sees the program.
    const row = await owner.client
      .from("programs")
      .select("roster_size_band, weekly_film_band")
      .eq("id", programId!)
      .single();
    expect(row.error).toBeNull();
    expect(row.data).toEqual({
      roster_size_band: roster,
      weekly_film_band: film,
    });
  });
});
