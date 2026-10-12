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
 * `20260926221500_match_share_links.sql`, proven against the live database:
 *
 *  1. An anonymous client reads nothing — the table has no `anon` grant.
 *  2. The match's uploader, either seated player, and program staff can each
 *     mint a link (insert), see it (select) and remove it (delete).
 *  3. A plain program member — who CAN read the match — cannot mint a link,
 *     cannot see one that exists, and cannot delete it. A stranger can do
 *     none of it either.
 *  4. `created_by` cannot be spoofed, and a second link for one match is a
 *     unique violation (the toggle's "already on" path).
 *
 * A crashed run's program is findable by hand:
 * `select * from programs where school_name like 'ZZ RLS match_share%'`.
 *
 * Run on demand:  npx playwright test match-share-links-rls
 */

const UNIQUE_VIOLATION = "23505";

const { mark: MARK } = runMarker("match-share-rls");
const PROGRAM_NAME = `ZZ RLS match_share ${MARK}`;

const SLOTS = [
  "match-share-links-rls-creator",
  "match-share-links-rls-seated",
  "match-share-links-rls-staff",
  "match-share-links-rls-member",
  "match-share-links-rls-stranger",
];

test.describe("match_share_links RLS (live)", () => {
  test.describe.configure({ mode: "serial", timeout: 60_000 });
  test.skip(!HAVE_ENV, SKIP_REASON);

  let admin: SupabaseClient;
  let creator: Session; // uploaded the match; program member, role player
  let seated: Session; // player2_id on the match; program member, role player
  let staff: Session; // program member, role staff
  let member: Session; // program member, role player, on neither seat
  let stranger: Session; // signed in, no membership

  let programId: string | null = null;
  let matchId: string | null = null;

  async function linkCount(session: Session): Promise<number> {
    const { data, error } = await session.client
      .from("match_share_links")
      .select("match_id")
      .eq("match_id", matchId!);
    expect(error).toBeNull();
    return data?.length ?? 0;
  }

  async function removeLink() {
    const { error } = await admin
      .from("match_share_links")
      .delete()
      .eq("match_id", matchId!);
    if (error) throw new Error(`link sweep: ${error.message}`);
  }

  test.beforeAll(async () => {
    test.setTimeout(180_000);
    admin = createAdminClient();

    const leftoverIds = await clearPoolLeftovers(admin, SLOTS);
    if (leftoverIds.length > 0) {
      const swept = await admin
        .from("matches")
        .delete()
        .in("created_by", leftoverIds);
      if (swept.error) throw new Error(`matches sweep: ${swept.error.message}`);
    }

    [creator, seated, staff, member, stranger] = await poolLogins(admin, SLOTS);

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
      { program_id: programId, user_id: creator.userId, role: "player" },
      { program_id: programId, user_id: seated.userId, role: "player" },
      { program_id: programId, user_id: staff.userId, role: "staff" },
      { program_id: programId, user_id: member.userId, role: "player" },
    ]);
    if (members.error) throw new Error(`members: ${members.error.message}`);

    const match = await admin
      .from("matches")
      .insert({
        created_by: creator.userId,
        program_id: programId,
        player1_id: creator.userId,
        player2_id: seated.userId,
        player1_name: "Share Creator",
        player2_name: "Share Seated",
        date: new Date().toISOString(),
        tournament_name: `${MARK}-match`,
        source_provider: "swing-vision",
      })
      .select("id")
      .single();
    if (match.error) throw new Error(`match: ${match.error.message}`);
    matchId = match.data.id as string;
  });

  test.afterAll(async () => {
    if (!admin) return;
    if (matchId) {
      await admin.from("match_share_links").delete().eq("match_id", matchId);
      await admin.from("matches").delete().eq("id", matchId);
    }
    if (programId) {
      await admin.from("program_members").delete().eq("program_id", programId);
      await admin.from("programs").delete().eq("id", programId);
    }
  });

  test("fixture: every member reads the match; the stranger does not", async () => {
    for (const s of [creator, seated, staff, member]) {
      const seen = await s.client
        .from("matches")
        .select("id")
        .eq("id", matchId!);
      expect(seen.error).toBeNull();
      expect(seen.data).toHaveLength(1);
    }
    const hidden = await stranger.client
      .from("matches")
      .select("id")
      .eq("id", matchId!);
    expect(hidden.error).toBeNull();
    expect(hidden.data).toHaveLength(0);
  });

  test("the uploader can mint, see and remove a link", async () => {
    const insert = await creator.client.from("match_share_links").insert({
      match_id: matchId,
      token: `${MARK}-creator`,
      created_by: creator.userId,
    });
    expect(insert.error).toBeNull();
    expect(await linkCount(creator)).toBe(1);

    const del = await creator.client
      .from("match_share_links")
      .delete()
      .eq("match_id", matchId!);
    expect(del.error).toBeNull();
    expect(await linkCount(creator)).toBe(0);
  });

  test("a seated player can mint a link for their own match", async () => {
    const insert = await seated.client.from("match_share_links").insert({
      match_id: matchId,
      token: `${MARK}-seated`,
      created_by: seated.userId,
    });
    expect(insert.error).toBeNull();
    expect(await linkCount(seated)).toBe(1);
    await removeLink();
  });

  test("program staff can mint a link", async () => {
    const insert = await staff.client.from("match_share_links").insert({
      match_id: matchId,
      token: `${MARK}-staff`,
      created_by: staff.userId,
    });
    expect(insert.error).toBeNull();
    expect(await linkCount(staff)).toBe(1);
    await removeLink();
  });

  test("a plain member and a stranger cannot mint a link", async () => {
    for (const s of [member, stranger]) {
      const insert = await s.client.from("match_share_links").insert({
        match_id: matchId,
        token: `${MARK}-${s.userId}`,
        created_by: s.userId,
      });
      expect(insert.error?.code).toBe(INSUFFICIENT_PRIVILEGE);
    }
  });

  test("created_by cannot be spoofed", async () => {
    const insert = await creator.client.from("match_share_links").insert({
      match_id: matchId,
      token: `${MARK}-spoof`,
      created_by: seated.userId,
    });
    expect(insert.error?.code).toBe(INSUFFICIENT_PRIVILEGE);
  });

  test("an existing link: sharers see it, a member and a stranger do not, and neither can delete it; a second link is a unique violation", async () => {
    const insert = await creator.client.from("match_share_links").insert({
      match_id: matchId,
      token: `${MARK}-live`,
      created_by: creator.userId,
    });
    expect(insert.error).toBeNull();

    for (const s of [creator, seated, staff])
      expect(await linkCount(s)).toBe(1);
    for (const s of [member, stranger]) expect(await linkCount(s)).toBe(0);

    for (const s of [member, stranger]) {
      // RLS filters the row out of the delete rather than erroring, so the
      // proof is that the row is still there afterwards.
      const del = await s.client
        .from("match_share_links")
        .delete()
        .eq("match_id", matchId!);
      expect(del.error).toBeNull();
      expect(await linkCount(creator)).toBe(1);
    }

    const dup = await seated.client.from("match_share_links").insert({
      match_id: matchId,
      token: `${MARK}-dup`,
      created_by: seated.userId,
    });
    expect(dup.error?.code).toBe(UNIQUE_VIOLATION);

    await removeLink();
  });

  test("what a link includes: sharers can change that one column, nobody can change the token, and a member changes nothing", async () => {
    const insert = await creator.client.from("match_share_links").insert({
      match_id: matchId,
      token: `${MARK}-opts`,
      created_by: creator.userId,
    });
    expect(insert.error).toBeNull();

    const read = async () =>
      (
        await creator.client
          .from("match_share_links")
          .select("token, include_visualizations")
          .eq("match_id", matchId!)
          .single()
      ).data;
    // A link made without asking stays statistics-only.
    expect((await read())?.include_visualizations).toBe(false);

    for (const s of [seated, staff]) {
      const on = await s.client
        .from("match_share_links")
        .update({ include_visualizations: true })
        .eq("match_id", matchId!);
      expect(on.error).toBeNull();
      expect((await read())?.include_visualizations).toBe(true);
      await creator.client
        .from("match_share_links")
        .update({ include_visualizations: false })
        .eq("match_id", matchId!);
    }

    // The column grant, not the policy: even a sharer cannot re-key a link.
    const rekey = await creator.client
      .from("match_share_links")
      .update({ token: `${MARK}-rekeyed` })
      .eq("match_id", matchId!);
    expect(rekey.error?.code).toBe(INSUFFICIENT_PRIVILEGE);
    expect((await read())?.token).toBe(`${MARK}-opts`);

    for (const s of [member, stranger]) {
      const update = await s.client
        .from("match_share_links")
        .update({ include_visualizations: true })
        .eq("match_id", matchId!);
      expect(update.error).toBeNull();
      expect((await read())?.include_visualizations).toBe(false);
    }

    await removeLink();
  });

  test("video on a link: only through the function, staff by default, players once the program allows it", async () => {
    const insert = await creator.client.from("match_share_links").insert({
      match_id: matchId,
      token: `${MARK}-video`,
      created_by: creator.userId,
    });
    expect(insert.error).toBeNull();

    const read = async () =>
      (
        await staff.client
          .from("match_share_links")
          .select("include_visualizations, include_video")
          .eq("match_id", matchId!)
          .single()
      ).data;
    const setVideo = (s: typeof creator, include: boolean) =>
      s.client.rpc("set_match_share_video", {
        p_match_id: matchId,
        p_include: include,
      });
    expect((await read())?.include_video).toBe(false);

    // The column has no grant: not even staff can write it directly.
    const direct = await staff.client
      .from("match_share_links")
      .update({ include_video: true })
      .eq("match_id", matchId!);
    expect(direct.error?.code).toBe(INSUFFICIENT_PRIVILEGE);

    // A player who may share the match may not add its video…
    for (const s of [creator, seated]) {
      expect((await setVideo(s, true)).error?.code).toBe(
        INSUFFICIENT_PRIVILEGE,
      );
      expect(
        (await s.client.rpc("can_share_match_video", { p_match_id: matchId }))
          .data,
      ).toBe(false);
    }
    // …and someone who cannot share it at all cannot touch it either way.
    for (const s of [member, stranger])
      expect((await setVideo(s, false)).error?.code).toBe(
        INSUFFICIENT_PRIVILEGE,
      );
    expect((await read())?.include_video).toBe(false);

    // Staff can.
    expect((await setVideo(staff, true)).error).toBeNull();
    expect((await read())?.include_video).toBe(true);

    // With the video on, a player can still change the link's other option —
    // the reason `include_video` is not policed in the UPDATE policy.
    const viz = await seated.client
      .from("match_share_links")
      .update({ include_visualizations: true })
      .eq("match_id", matchId!);
    expect(viz.error).toBeNull();
    expect(await read()).toEqual({
      include_visualizations: true,
      include_video: true,
    });

    // And can take the video of their own match back down.
    expect((await setVideo(seated, false)).error).toBeNull();
    expect((await read())?.include_video).toBe(false);

    // The program's setting: a player cannot move it, staff can, and once it
    // is on a player who may share the match may add the video.
    const setProgram = (s: typeof creator, enabled: boolean) =>
      s.client.rpc("set_program_players_can_share_video", {
        p_program_id: programId,
        p_enabled: enabled,
      });
    expect((await setProgram(seated, true)).error?.code).toBe(
      INSUFFICIENT_PRIVILEGE,
    );
    expect((await setProgram(staff, true)).error).toBeNull();
    expect((await setVideo(seated, true)).error).toBeNull();
    expect((await read())?.include_video).toBe(true);
    // A plain member still cannot: they could never share the match.
    expect((await setVideo(member, true)).error?.code).toBe(
      INSUFFICIENT_PRIVILEGE,
    );

    expect((await setProgram(staff, false)).error).toBeNull();
    await removeLink();

    // A link cannot be born with the video on it.
    const born = await staff.client.from("match_share_links").insert({
      match_id: matchId,
      token: `${MARK}-born`,
      created_by: staff.userId,
      include_video: true,
    });
    expect(born.error?.code).toBe(INSUFFICIENT_PRIVILEGE);
  });

  test("an anonymous client reads nothing", async () => {
    const anon = createClient(SUPABASE_URL!, ANON_KEY!);
    const { data, error } = await anon
      .from("match_share_links")
      .select("match_id")
      .limit(1);
    if (error) expect(error.code).toBe(INSUFFICIENT_PRIVILEGE);
    else expect(data).toHaveLength(0);
  });
});
