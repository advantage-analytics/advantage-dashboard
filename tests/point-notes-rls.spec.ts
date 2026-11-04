import { expect, test } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  ANON_KEY,
  HAVE_ENV,
  INSUFFICIENT_PRIVILEGE,
  SKIP_REASON,
  SUPABASE_URL,
  type Session,
  createAdminClient,
  runMarker,
} from "./fixtures/live-db";
import { clearPoolLeftovers, poolLogins } from "./fixtures/live-db-pool";

/**
 * `20261104021629_point_notes_and_tags.sql`'s RLS, proven against the live
 * database rather than the migration's own claims:
 *
 *  1. A team match: its members read and write notes; a signed-in
 *     non-member sees none and cannot post; `author_id` cannot be spoofed;
 *     an author edits only their own note; staff may delete a player's note.
 *  2. A personal match: its creator writes; a stranger reads nothing.
 *  3. Tags: a member tags a team point with the team's tag, but never with a
 *     personal tag (the tag must be the match's workspace's own).
 *  4. `point_note_authors` names the thread for a member, nobody else.
 *  5. anon: nothing.
 *
 * Like every live spec it skips against the production project unless
 * `LIVE_DB_ALLOW_PROD=1` (never set in a gate) — `tests/fixtures/live-db.ts`.
 *
 * A crashed run is findable by hand:
 * `select * from programs where school_name like 'ZZ RLS point_notes%'`.
 *
 * Run on demand:  npx playwright test point-notes-rls
 */

const UNDEFINED_TABLE = "PGRST205";
const { mark: MARK } = runMarker("point-notes-rls");
const PROGRAM_NAME = `ZZ RLS point_notes ${MARK}`;

const SLOTS = [
  "point-notes-rls-player",
  "point-notes-rls-staff",
  "point-notes-rls-non-member",
  "point-notes-rls-solo",
];

test.describe("point notes and tags RLS (live)", () => {
  test.describe.configure({ mode: "serial", timeout: 60_000 });
  test.skip(!HAVE_ENV, SKIP_REASON);

  let admin: SupabaseClient;
  let tableMissing: string | null = null;

  let player: Session; // team member, role player
  let staff: Session; // team member, role staff
  let nonMember: Session; // signed in, not on the team
  let solo: Session; // owns a personal match

  let programId: string | null = null;
  let teamMatchId: string | null = null;
  let soloMatchId: string | null = null;
  let teamPointId: string;
  let soloPointId: string;
  let poolUserIds: string[] = [];

  test.beforeAll(async () => {
    test.setTimeout(180_000);
    admin = createAdminClient();

    const probe = await admin.from("point_notes").select("id").limit(1);
    if (probe.error?.code === UNDEFINED_TABLE) {
      tableMissing =
        "public.point_notes does not exist — migration " +
        "20261104021629_point_notes_and_tags.sql has not been applied.";
      return;
    }
    if (probe.error) throw new Error(`probe: ${probe.error.message}`);

    await clearPoolLeftovers(admin, SLOTS);
    [player, staff, nonMember, solo] = await poolLogins(admin, SLOTS);
    poolUserIds = [player, staff, nonMember, solo].map((s) => s.userId);

    const program = await admin
      .from("programs")
      .insert({
        program_key: MARK,
        school_group: MARK,
        school_name: PROGRAM_NAME,
        team: "mens",
        status: "active",
      })
      .select("id")
      .single();
    if (program.error) throw new Error(`program: ${program.error.message}`);
    programId = program.data.id as string;

    const members = await admin.from("program_members").insert([
      { program_id: programId, user_id: player.userId, role: "player" },
      { program_id: programId, user_id: staff.userId, role: "staff" },
    ]);
    if (members.error) throw new Error(`members: ${members.error.message}`);

    const matches = await admin
      .from("matches")
      .insert([
        {
          player1_name: "ZZ Team Player",
          player2_name: "ZZ Opponent",
          date: "2026-11-01T00:00:00Z",
          program_id: programId,
          created_by: staff.userId,
        },
        {
          player1_name: "ZZ Solo",
          player2_name: "ZZ Opponent",
          date: "2026-11-01T00:00:00Z",
          created_by: solo.userId,
        },
      ])
      .select("id, program_id");
    if (matches.error) throw new Error(`matches: ${matches.error.message}`);
    teamMatchId = matches.data.find((m) => m.program_id)!.id as string;
    soloMatchId = matches.data.find((m) => !m.program_id)!.id as string;

    const points = await admin
      .from("points")
      .insert(
        [teamMatchId, soloMatchId].map((match_id) => ({
          match_id,
          point_number: 1,
          set_number: 1,
          game_number: 1,
          server_is_player1: true,
          won_by_player1: true,
        })),
      )
      .select("id, match_id");
    if (points.error) throw new Error(`points: ${points.error.message}`);
    teamPointId = points.data.find((p) => p.match_id === teamMatchId)!
      .id as string;
    soloPointId = points.data.find((p) => p.match_id === soloMatchId)!
      .id as string;
  });

  test.beforeEach(() => {
    test.skip(tableMissing !== null, tableMissing ?? "");
  });

  test.afterAll(async () => {
    if (!admin || tableMissing !== null) return;
    // Matches cascade to points, and points to notes and tag links.
    const ids = [teamMatchId, soloMatchId].filter(Boolean) as string[];
    if (ids.length) await admin.from("matches").delete().in("id", ids);
    if (programId) {
      await admin.from("point_tags").delete().eq("account_id", programId);
      await admin.from("program_members").delete().eq("program_id", programId);
      await admin.from("programs").delete().eq("id", programId);
    }
    if (poolUserIds.length)
      await admin.from("point_tags").delete().in("account_id", poolUserIds);
  });

  // ── team match ─────────────────────────────────────────────────────────

  let playerNoteId: string;

  test("a team member writes a note and every member reads it", async () => {
    const insert = await player.client
      .from("point_notes")
      .insert({ point_id: teamPointId, body: "Split-step earlier" })
      .select("id, author_id")
      .single();
    expect(insert.error).toBeNull();
    expect(insert.data!.author_id).toBe(player.userId);
    playerNoteId = insert.data!.id as string;

    const read = await staff.client
      .from("point_notes")
      .select("id")
      .eq("point_id", teamPointId);
    expect(read.error).toBeNull();
    expect(read.data).toHaveLength(1);
  });

  test("a non-member sees no notes and cannot post", async () => {
    const read = await nonMember.client
      .from("point_notes")
      .select("id")
      .eq("point_id", teamPointId);
    expect(read.data ?? []).toHaveLength(0);

    const insert = await nonMember.client
      .from("point_notes")
      .insert({ point_id: teamPointId, body: "Not mine to write" });
    expect(insert.error?.code).toBe(INSUFFICIENT_PRIVILEGE);
  });

  test("author_id cannot be spoofed", async () => {
    const insert = await player.client.from("point_notes").insert({
      point_id: teamPointId,
      body: "Spoofed",
      author_id: staff.userId,
    });
    expect(insert.error?.code).toBe(INSUFFICIENT_PRIVILEGE);
  });

  test("only the author edits a note, and edited_at is the server's", async () => {
    const byStaff = await staff.client
      .from("point_notes")
      .update({ body: "Rewritten by staff" })
      .eq("id", playerNoteId)
      .select("id");
    expect(byStaff.data ?? []).toHaveLength(0);

    const own = await player.client
      .from("point_notes")
      .update({ body: "Split-step a beat earlier" })
      .eq("id", playerNoteId)
      .select("body, edited_at")
      .single();
    expect(own.error).toBeNull();
    expect(own.data!.body).toBe("Split-step a beat earlier");
    expect(own.data!.edited_at).not.toBeNull();
  });

  test("point_note_authors names the thread for a member, nobody else", async () => {
    const member = await staff.client.rpc("point_note_authors", {
      p_match_id: teamMatchId,
    });
    expect(member.error).toBeNull();
    expect(
      (member.data as { user_id: string }[]).map((r) => r.user_id),
    ).toEqual([player.userId]);

    const outsider = await nonMember.client.rpc("point_note_authors", {
      p_match_id: teamMatchId,
    });
    expect(outsider.data ?? []).toHaveLength(0);
  });

  test("staff may delete a player's note on a team match", async () => {
    const del = await staff.client
      .from("point_notes")
      .delete()
      .eq("id", playerNoteId)
      .select("id");
    expect(del.error).toBeNull();
    expect(del.data).toHaveLength(1);
  });

  // ── tags ───────────────────────────────────────────────────────────────

  test("a member tags a team point with the team's tag, never a personal one", async () => {
    const teamTag = await player.client
      .from("point_tags")
      .insert({ account_id: programId, name: "Net approach" })
      .select("id")
      .single();
    expect(teamTag.error).toBeNull();
    const personalTag = await player.client
      .from("point_tags")
      .insert({ account_id: player.userId, name: "My own" })
      .select("id")
      .single();
    expect(personalTag.error).toBeNull();

    const good = await player.client
      .from("point_tag_links")
      .insert({ point_id: teamPointId, tag_id: teamTag.data!.id });
    expect(good.error).toBeNull();

    const wrong = await player.client
      .from("point_tag_links")
      .insert({ point_id: teamPointId, tag_id: personalTag.data!.id });
    expect(wrong.error?.code).toBe(INSUFFICIENT_PRIVILEGE);

    const outsider = await nonMember.client
      .from("point_tag_links")
      .select("tag_id")
      .eq("point_id", teamPointId);
    expect(outsider.data ?? []).toHaveLength(0);
  });

  test("a tag name is unique per workspace, case- and space-blind", async () => {
    const dup = await staff.client
      .from("point_tags")
      .insert({ account_id: programId, name: "  net APPROACH " });
    expect(dup.error?.code).toBe("23505");
  });

  // ── personal match ─────────────────────────────────────────────────────

  test("a personal match's creator writes notes and a stranger reads none", async () => {
    const insert = await solo.client
      .from("point_notes")
      .insert({ point_id: soloPointId, body: "Serve out wide more" });
    expect(insert.error).toBeNull();

    const stranger = await nonMember.client
      .from("point_notes")
      .select("id")
      .eq("point_id", soloPointId);
    expect(stranger.data ?? []).toHaveLength(0);
  });

  // ── anon ───────────────────────────────────────────────────────────────

  test("anon reads nothing", async () => {
    const anon = createClient(SUPABASE_URL!, ANON_KEY!, {
      auth: { persistSession: false },
    });
    for (const table of ["point_notes", "point_tags", "point_tag_links"]) {
      const res = await anon.from(table).select("*").limit(1);
      expect(res.error !== null || (res.data ?? []).length === 0).toBe(true);
    }
  });
});
