import { readFileSync } from "node:fs";
import * as path from "node:path";

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
  createLogins,
  deleteAuthUsers,
  runMarker,
} from "./fixtures/live-db";

/**
 * `20260920120000_point_bookmarks.sql`, proven against the live database
 * rather than the migration's own claims (T1 of per-user point bookmarks).
 *
 *  1. Privilege boundary: an anonymous client is refused SELECT, INSERT and
 *     DELETE with `42501` — the table has no `anon` grant.
 *  2. Own rows on visible matches: the match creator inserts, reads back and
 *     deletes their own bookmark; a program-mate who can see the match (the
 *     membership route of `visible_match_ids()`) bookmarks the same point
 *     independently, and neither ever sees the other's row.
 *  3. Refusals: a user who cannot see the match reads zero rows and is
 *     refused on insert; an insert that names another user's `user_id` is
 *     refused even on a visible match.
 *  4. Backfill contract: the statement below is the migration's, verbatim
 *     (the spec checks the file on disk carries it), and its semantics are
 *     replayed on the fixture rows — a `saved` point becomes a bookmark for
 *     the match's creator, and the replay is idempotent.
 *
 * Every fixture row is marked: the program's key and the match's tournament
 * name start with the run mark, so no real row is ever touched.
 *
 * Run on demand:  npx playwright test tests/point-bookmarks-db.spec.ts
 */

const MIGRATION = "supabase/migrations/20260920120000_point_bookmarks.sql";

/**
 * The migration's backfill, character for character. The live project has no
 * raw-SQL endpoint, so the spec cannot *execute* this text; instead it proves
 * (a) the migration on disk contains exactly this statement and (b) the rows
 * the statement selects — `points.saved` joined to a non-null
 * `matches.created_by` — land as `(created_by, point_id)` bookmarks, with
 * duplicates ignored. Change one copy and change the other.
 */
export const BACKFILL_SQL = `insert into public.point_bookmarks (user_id, point_id)
select m.created_by, p.id
  from public.points p
  join public.matches m on m.id = p.match_id
 where p.saved and m.created_by is not null
on conflict do nothing;`;

const TABLE = "point_bookmarks";

/** A crashed run is findable by hand:
 *  `select * from programs where program_key like 'pbm-%'`. */
const { mark: MARK, password: PASSWORD } = runMarker("pbm");

test.describe("point_bookmarks table + RLS boundary (live)", () => {
  test.describe.configure({ mode: "serial", timeout: 60_000 });
  test.skip(!HAVE_ENV, SKIP_REASON);

  let admin: SupabaseClient; // service role
  let creator: Session; // files the match; owner of the program
  let mate: Session; // coach in the same program — sees the match via membership
  let outsider: Session; // no route to the match at all

  const authUserIds: string[] = [];
  let programId: string;
  let matchId: string;
  /** The point the bookmark tests toggle. `saved = false`. */
  let pointId: string;
  /** The point the backfill test relies on. `saved = true`. */
  let savedPointId: string;

  const anon = () =>
    createClient(SUPABASE_URL!, ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

  const rowsFor = (session: Session) =>
    session.client
      .from(TABLE)
      .select("user_id, point_id")
      .eq("point_id", pointId);

  test.beforeAll(async () => {
    test.setTimeout(180_000);
    admin = createAdminClient();

    [creator, mate, outsider] = await createLogins(
      admin,
      ["creator", "mate", "outsider"],
      { mark: MARK, password: PASSWORD, authUserIds },
    );

    const program = await admin
      .from("programs")
      .insert({
        program_key: MARK,
        school_group: MARK,
        school_name: `Bookmark Test School ${MARK}`,
        team: "mens",
      })
      .select("id")
      .single();
    if (program.error) throw new Error(`program: ${program.error.message}`);
    programId = program.data.id;

    const members = await admin.from("program_members").insert([
      { program_id: programId, user_id: creator.userId, role: "owner" },
      { program_id: programId, user_id: mate.userId, role: "coach" },
    ]);
    if (members.error) throw new Error(`members: ${members.error.message}`);

    // Filed under the program so `mate` reaches it by membership alone —
    // never as a player: `player1_id` mixes id spaces and is not joined.
    const match = await admin
      .from("matches")
      .insert({
        created_by: creator.userId,
        program_id: programId,
        player1_id: creator.userId,
        player1_name: "Bookmark Creator",
        player2_name: "Bookmark Opponent",
        date: new Date().toISOString(),
        tournament_name: `${MARK}-match`,
        source_provider: "swing-vision",
      })
      .select("id")
      .single();
    if (match.error) throw new Error(`match: ${match.error.message}`);
    matchId = match.data.id;

    const points = await admin
      .from("points")
      .insert([
        {
          match_id: matchId,
          point_number: 1,
          set_number: 1,
          game_number: 1,
          server_is_player1: true,
          won_by_player1: true,
          saved: false,
        },
        {
          match_id: matchId,
          point_number: 2,
          set_number: 1,
          game_number: 1,
          server_is_player1: true,
          won_by_player1: false,
          saved: true,
        },
      ])
      .select("id, point_number");
    if (points.error) throw new Error(`points: ${points.error.message}`);
    pointId = points.data.find((p) => p.point_number === 1)!.id;
    savedPointId = points.data.find((p) => p.point_number === 2)!.id;
  });

  test.afterAll(async () => {
    test.setTimeout(180_000);
    if (!admin) return;
    // Bookmarks cascade from points, points from the match. The match first:
    // `matches.created_by` has no ON DELETE, so it would block the user.
    if (matchId) await admin.from("matches").delete().eq("id", matchId);
    if (programId) await admin.from("programs").delete().eq("id", programId);
    await deleteAuthUsers(admin, authUserIds);
  });

  // ── 0. Fixture sanity — zero rows below must mean "withheld", never "not there".

  test("both members read the fixture point; the outsider does not (fixture is real)", async () => {
    for (const s of [creator, mate]) {
      const seen = await s.client.from("points").select("id").eq("id", pointId);
      expect(seen.error).toBeNull();
      expect(seen.data).toHaveLength(1);
    }
    const hidden = await outsider.client
      .from("points")
      .select("id")
      .eq("id", pointId);
    expect(hidden.error).toBeNull();
    expect(hidden.data).toEqual([]);
  });

  // ── 1. Privilege boundary ─────────────────────────────────────────────────

  test("an anonymous client is refused select, insert and delete", async () => {
    const client = anon();

    const selected = await client.from(TABLE).select("point_id").limit(1);
    expect(selected.error?.code, "anon select").toBe(INSUFFICIENT_PRIVILEGE);

    const inserted = await client
      .from(TABLE)
      .insert({ user_id: creator.userId, point_id: pointId });
    expect(inserted.error?.code, "anon insert").toBe(INSUFFICIENT_PRIVILEGE);

    const deleted = await client.from(TABLE).delete().eq("point_id", pointId);
    expect(deleted.error?.code, "anon delete").toBe(INSUFFICIENT_PRIVILEGE);

    const rows = await admin
      .from(TABLE)
      .select("point_id")
      .eq("point_id", pointId);
    expect(rows.error).toBeNull();
    expect(rows.data).toEqual([]);
  });

  // ── 2. Own rows on visible matches ────────────────────────────────────────

  test("the match creator inserts (user_id defaults to auth.uid()) and reads back", async () => {
    const inserted = await creator.client
      .from(TABLE)
      .insert({ point_id: pointId })
      .select("user_id, point_id")
      .single();
    expect(inserted.error).toBeNull();
    expect(inserted.data).toEqual({
      user_id: creator.userId,
      point_id: pointId,
    });

    const read = await rowsFor(creator);
    expect(read.error).toBeNull();
    expect(read.data).toEqual([{ user_id: creator.userId, point_id: pointId }]);
  });

  test("a program-mate bookmarks the same point independently; neither sees the other's row", async () => {
    const inserted = await mate.client
      .from(TABLE)
      .insert({ user_id: mate.userId, point_id: pointId });
    expect(inserted.error).toBeNull();

    const byMate = await rowsFor(mate);
    expect(byMate.error).toBeNull();
    expect(byMate.data).toEqual([{ user_id: mate.userId, point_id: pointId }]);

    const byCreator = await rowsFor(creator);
    expect(byCreator.error).toBeNull();
    expect(byCreator.data).toEqual([
      { user_id: creator.userId, point_id: pointId },
    ]);

    // Ground truth: two rows exist.
    const all = await admin
      .from(TABLE)
      .select("user_id")
      .eq("point_id", pointId);
    expect(all.data?.map((r) => r.user_id).sort()).toEqual(
      [creator.userId, mate.userId].sort(),
    );
  });

  test("a delete only reaches the caller's own row", async () => {
    // The creator's delete is unfiltered by user: RLS must scope it.
    const deleted = await creator.client
      .from(TABLE)
      .delete()
      .eq("point_id", pointId)
      .select("user_id");
    expect(deleted.error).toBeNull();
    expect(deleted.data).toEqual([{ user_id: creator.userId }]);

    const remaining = await admin
      .from(TABLE)
      .select("user_id")
      .eq("point_id", pointId);
    expect(remaining.data).toEqual([{ user_id: mate.userId }]);

    const gone = await rowsFor(creator);
    expect(gone.data).toEqual([]);
  });

  // ── 3. Refusals ───────────────────────────────────────────────────────────

  test("a user who cannot see the match reads zero rows and is refused on insert", async () => {
    const read = await rowsFor(outsider);
    expect(read.error).toBeNull();
    expect(read.data).toEqual([]);

    const inserted = await outsider.client
      .from(TABLE)
      .insert({ point_id: pointId });
    expect(inserted.error?.code).toBe(INSUFFICIENT_PRIVILEGE);

    // And the outsider's delete removes nothing of the mate's.
    const deleted = await outsider.client
      .from(TABLE)
      .delete()
      .eq("point_id", pointId)
      .select("user_id");
    expect(deleted.error).toBeNull();
    expect(deleted.data).toEqual([]);
    const still = await admin
      .from(TABLE)
      .select("user_id")
      .eq("point_id", pointId);
    expect(still.data).toEqual([{ user_id: mate.userId }]);
  });

  test("an insert that names another user's user_id is refused", async () => {
    // The creator can see the match; the row it names is the outsider's.
    const forged = await creator.client
      .from(TABLE)
      .insert({ user_id: outsider.userId, point_id: pointId });
    expect(forged.error?.code).toBe(INSUFFICIENT_PRIVILEGE);

    const rows = await admin
      .from(TABLE)
      .select("user_id")
      .eq("point_id", pointId)
      .eq("user_id", outsider.userId);
    expect(rows.data).toEqual([]);
  });

  // ── 4. Backfill contract ──────────────────────────────────────────────────

  test("the migration on disk carries the backfill statement verbatim", () => {
    const sql = readFileSync(path.resolve(__dirname, "..", MIGRATION), "utf8");
    expect(sql).toContain(BACKFILL_SQL);
    // The legacy flag is left alone: nothing drops or alters it.
    expect(sql).not.toMatch(/drop\s+column\s+saved|alter\s+column\s+saved/i);
  });

  test("replaying the backfill on the fixture gives the saved point a creator bookmark, idempotently", async () => {
    // Nothing yet: the migration ran before these rows existed.
    const before = await admin
      .from(TABLE)
      .select("user_id")
      .eq("point_id", savedPointId);
    expect(before.data).toEqual([]);

    /** `BACKFILL_SQL` through PostgREST: select + join + insert-ignore. */
    const replay = async () => {
      const selected = await admin
        .from("points")
        .select("id, matches!inner(created_by)")
        .eq("saved", true)
        .in("match_id", [matchId])
        .not("matches.created_by", "is", null);
      if (selected.error) throw new Error(selected.error.message);
      const rows = selected.data.map((p) => ({
        user_id: (p.matches as unknown as { created_by: string }).created_by,
        point_id: p.id,
      }));
      const upserted = await admin.from(TABLE).upsert(rows, {
        onConflict: "user_id,point_id",
        ignoreDuplicates: true,
      });
      if (upserted.error) throw new Error(upserted.error.message);
      return rows;
    };

    // Only the saved point qualifies — the toggled point (saved = false) is
    // out, so the replay cannot resurrect the bookmark the creator deleted.
    const rows = await replay();
    expect(rows).toEqual([{ user_id: creator.userId, point_id: savedPointId }]);

    const after = await admin
      .from(TABLE)
      .select("user_id, point_id")
      .eq("point_id", savedPointId);
    expect(after.data).toEqual([
      { user_id: creator.userId, point_id: savedPointId },
    ]);

    // Second pass: `on conflict do nothing` — same single row, no error.
    await replay();
    const again = await admin
      .from(TABLE)
      .select("user_id")
      .eq("point_id", savedPointId);
    expect(again.data).toHaveLength(1);

    // The creator reads the backfilled row through RLS; the creator's own
    // delete on the toggled point did not touch it.
    const seen = await creator.client
      .from(TABLE)
      .select("point_id")
      .eq("point_id", savedPointId);
    expect(seen.data).toEqual([{ point_id: savedPointId }]);

    // And `points.saved` is untouched by any of this.
    const flag = await admin
      .from("points")
      .select("saved")
      .eq("id", savedPointId)
      .single();
    expect(flag.data?.saved).toBe(true);
  });
});
