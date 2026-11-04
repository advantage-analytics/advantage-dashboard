import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  HAVE_ENV,
  INSUFFICIENT_PRIVILEGE,
  SKIP_REASON,
  type Session,
  createAdminClient,
  runMarker,
} from "./fixtures/live-db";
import { clearPoolLeftovers, poolLogins } from "./fixtures/live-db-pool";
import { getRecentMatchesForSupport } from "@/lib/data/support-server";

/**
 * In-app player messaging (migration 20261103055820, `support_messaging`):
 * one private `support_threads` row per player, its `support_messages`, and
 * the two functions a player may call — proven against the live database
 * through PostgREST, the path the app uses.
 *
 * Two pool users, A and B. Each owns one match (A also sends with it
 * attached). The spec asserts:
 *
 *  1. A's first `send_support_message` creates exactly one thread, with the
 *     origin that call named; a second send reuses it. B's `select` on both
 *     tables returns none of A's rows; A sees only A's.
 *  2. A direct `insert` into `support_messages` as A — as 'staff', as the
 *     console would write — is refused 42501: there is no INSERT policy, so
 *     the table is write-only through the function and the service role.
 *  3. A sending with B's match id is refused (42501); a random id likewise.
 *  4. The 21st player message inside an hour is refused with
 *     `support_rate_limited`; the 20 before it landed.
 *  5. `mark_support_thread_read` stamps A's own `player_read_at` only.
 *
 * Everything seeded names one of the two pool users and is deleted in
 * `afterAll` through the service role; `beforeAll` sweeps what an
 * interrupted run left behind.
 *
 * Run on demand:  npx playwright test tests/support-messaging-rls.spec.ts
 */

const { mark: MARK } = runMarker("support-rls");

/** Pool slots, prefixed with this spec's name so no other spec draws them. */
const SLOTS = ["support-messaging-rls-a", "support-messaging-rls-b"];

/** The function's hourly cap — the 21st send is the one refused. */
const HOURLY_CAP = 20;

type RpcError = { code?: string; message: string; details?: string };
type ThreadRow = {
  id: string;
  user_id: string;
  origin: string;
  last_player_message_at: string | null;
  player_read_at: string | null;
};
type MessageRow = {
  id: string;
  thread_id: string;
  author_id: string | null;
  author_role: string;
  author_name: string | null;
  body: string;
  topic: string | null;
  match_id: string | null;
};

test.describe("support messaging: RLS and send guards (live)", () => {
  test.describe.configure({ mode: "serial", timeout: 60_000 });
  test.skip(!HAVE_ENV, SKIP_REASON);

  let admin: SupabaseClient; // service role
  let a: Session;
  let b: Session;
  let aMatchId: string;
  let bMatchId: string;
  let aThreadId: string;

  const send = (
    s: Session,
    body: string,
    opts: {
      topic?: string | null;
      matchId?: string | null;
      origin?: string;
    } = {},
  ) =>
    s.client.rpc("send_support_message", {
      p_body: body,
      p_topic: opts.topic ?? null,
      p_match_id: opts.matchId ?? null,
      p_origin: opts.origin ?? "help",
    }) as unknown as Promise<{ data: string | null; error: RpcError | null }>;

  /** Delete the users' threads (messages cascade) and matches. */
  const sweep = async (userIds: string[]) => {
    if (userIds.length === 0) return;
    const threads = await admin
      .from("support_threads")
      .delete()
      .in("user_id", userIds);
    if (threads.error) {
      throw new Error(`support_threads sweep: ${threads.error.message}`);
    }
    const matches = await admin
      .from("matches")
      .delete()
      .in("created_by", userIds);
    if (matches.error) {
      throw new Error(`matches sweep: ${matches.error.message}`);
    }
  };

  const seedMatch = async (owner: Session, label: string) => {
    const inserted = await admin
      .from("matches")
      .insert({
        created_by: owner.userId,
        player1_id: owner.userId,
        player1_name: "Support RLS Me",
        player2_name: `Support RLS Opp ${label}`,
        date: new Date().toISOString(),
        tournament_name: `${MARK} ${label}`,
        score: { player1: [6], player2: [4] },
        source_provider: "swing-vision",
      })
      .select("id")
      .single();
    if (inserted.error) {
      throw new Error(`seed match ${label}: ${inserted.error.message}`);
    }
    return (inserted.data as { id: string }).id;
  };

  test.beforeAll(async () => {
    test.setTimeout(180_000);
    admin = createAdminClient();

    const leftoverIds = await clearPoolLeftovers(admin, SLOTS);
    await sweep(leftoverIds);

    [a, b] = await poolLogins(admin, SLOTS);
    await sweep([a.userId, b.userId]);

    aMatchId = await seedMatch(a, "a");
    bMatchId = await seedMatch(b, "b");
  });

  test.afterAll(async () => {
    test.setTimeout(180_000);
    if (!admin) return;
    await sweep([a?.userId, b?.userId].filter((id): id is string => !!id));
  });

  // ── 1. One thread, private to its player ─────────────────────────────────

  test("A's first send creates one thread with that send's origin; a second send reuses it", async () => {
    const first = await send(a, `${MARK} first`, {
      topic: "match",
      matchId: aMatchId,
      origin: "match_report",
    });
    expect(first.error).toBeNull();
    expect(typeof first.data).toBe("string");

    const second = await send(a, `${MARK} second`, { origin: "account_menu" });
    expect(second.error).toBeNull();

    // The service role sees the whole picture: exactly one thread for A.
    const threads = await admin
      .from("support_threads")
      .select("id, user_id, origin, last_player_message_at, player_read_at")
      .eq("user_id", a.userId);
    expect(threads.error).toBeNull();
    expect(threads.data).toHaveLength(1);
    const thread = (threads.data as ThreadRow[])[0];
    aThreadId = thread.id;
    expect(thread.origin).toBe("match_report");
    // The trigger stamped the player side.
    expect(thread.last_player_message_at).not.toBeNull();
    expect(thread.player_read_at).toBeNull();

    const messages = await admin
      .from("support_messages")
      .select(
        "id, thread_id, author_id, author_role, author_name, body, topic, match_id",
      )
      .eq("thread_id", aThreadId)
      .order("created_at");
    expect(messages.error).toBeNull();
    const rows = messages.data as MessageRow[];
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      author_id: a.userId,
      author_role: "player",
      author_name: null,
      body: `${MARK} first`,
      topic: "match",
      match_id: aMatchId,
    });
    expect(rows[1]).toMatchObject({
      author_id: a.userId,
      author_role: "player",
      topic: null,
      match_id: null,
    });
  });

  test("A reads only A's thread and messages; B reads none of them", async () => {
    const aThreads = await a.client.from("support_threads").select("id");
    expect(aThreads.error).toBeNull();
    expect(aThreads.data).toEqual([{ id: aThreadId }]);

    const aMessages = await a.client.from("support_messages").select("id");
    expect(aMessages.error).toBeNull();
    expect(aMessages.data).toHaveLength(2);

    const bThreads = await b.client.from("support_threads").select("id");
    expect(bThreads.error).toBeNull();
    expect(bThreads.data).toEqual([]);

    const bMessages = await b.client.from("support_messages").select("id");
    expect(bMessages.error).toBeNull();
    expect(bMessages.data).toEqual([]);

    // Naming A's thread outright does not help B either.
    const byId = await b.client
      .from("support_messages")
      .select("id")
      .eq("thread_id", aThreadId);
    expect(byId.error).toBeNull();
    expect(byId.data).toEqual([]);
  });

  // ── 2. No write policy ───────────────────────────────────────────────────

  test("a direct insert into support_messages as A (as 'staff') is refused 42501", async () => {
    const forged = await a.client.from("support_messages").insert({
      thread_id: aThreadId,
      author_id: a.userId,
      author_role: "staff",
      author_name: "Forged",
      body: `${MARK} forged staff reply`,
    });
    expect(forged.error).not.toBeNull();
    expect(forged.error?.code).toBe(INSUFFICIENT_PRIVILEGE);

    // Nor a thread of B's own making, nor an update to A's read stamp.
    const thread = await b.client
      .from("support_threads")
      .insert({ user_id: b.userId, origin: "help" });
    expect(thread.error?.code).toBe(INSUFFICIENT_PRIVILEGE);

    const stamp = await a.client
      .from("support_threads")
      .update({ staff_read_at: new Date().toISOString() })
      .eq("id", aThreadId);
    expect(stamp.error?.code).toBe(INSUFFICIENT_PRIVILEGE);

    const count = await admin
      .from("support_messages")
      .select("id", { count: "exact", head: true })
      .eq("thread_id", aThreadId);
    expect(count.count).toBe(2);
  });

  // ── 3. The match must be the caller's ────────────────────────────────────

  test("A sending with B's match id is refused; so is a random one", async () => {
    const theirs = await send(a, `${MARK} with B's match`, {
      matchId: bMatchId,
    });
    expect(theirs.data).toBeNull();
    expect(theirs.error?.code).toBe(INSUFFICIENT_PRIVILEGE);
    expect(theirs.error?.message).toContain("match not found");

    const ghost = await send(a, `${MARK} with no match`, {
      matchId: "00000000-0000-4000-8000-000000000000",
    });
    expect(ghost.error?.code).toBe(INSUFFICIENT_PRIVILEGE);

    // Neither wrote anything.
    const count = await admin
      .from("support_messages")
      .select("id", { count: "exact", head: true })
      .eq("thread_id", aThreadId);
    expect(count.count).toBe(2);
  });

  test("a blank or over-long body is refused", async () => {
    const blank = await send(a, "   \n ");
    expect(blank.error?.code).toBe("22023");
    const long = await send(a, "x".repeat(4001));
    expect(long.error?.code).toBe("22023");
  });

  // ── 4. Rate limit ────────────────────────────────────────────────────────

  test("the 21st send inside the hour is refused with support_rate_limited", async () => {
    test.setTimeout(120_000);
    // Two landed already; send up to the cap one at a time, so the thread
    // lock is never contended and each refusal is the function's own.
    for (let n = 3; n <= HOURLY_CAP; n++) {
      const sent = await send(a, `${MARK} message ${n}`);
      expect(sent.error, `send ${n}`).toBeNull();
    }
    const over = await send(a, `${MARK} message ${HOURLY_CAP + 1}`);
    expect(over.data).toBeNull();
    expect(over.error?.message).toContain("support_rate_limited");

    const count = await admin
      .from("support_messages")
      .select("id", { count: "exact", head: true })
      .eq("thread_id", aThreadId);
    expect(count.count).toBe(HOURLY_CAP);

    // B is not rate-limited by A's thread.
    const bFirst = await send(b, `${MARK} B first`, { origin: "help" });
    expect(bFirst.error).toBeNull();
  });

  // ── 5. Read stamp ────────────────────────────────────────────────────────

  test("mark_support_thread_read stamps the caller's own thread only", async () => {
    const marked = await a.client.rpc("mark_support_thread_read");
    expect(marked.error).toBeNull();

    const threads = await admin
      .from("support_threads")
      .select("user_id, player_read_at")
      .in("user_id", [a.userId, b.userId]);
    expect(threads.error).toBeNull();
    const byUser = new Map(
      (threads.data as ThreadRow[]).map((t) => [t.user_id, t.player_read_at]),
    );
    expect(byUser.get(a.userId)).not.toBeNull();
    expect(byUser.get(b.userId)).toBeNull();
  });

  // ── 6. The "About" picker reads the real schema ─────────────────────────
  //
  // The offline spec's fake client accepts any column name, so a select
  // naming a column `matches` does not have (it once asked for `created_at`)
  // passed there and emptied the picker in the app. This runs the real query.

  test("the About picker lists A's own personal match and not B's", async () => {
    const personal = await getRecentMatchesForSupport(a.client, {
      id: a.userId,
      kind: "personal",
    });
    const ids = personal.map((m) => m.id);
    expect(ids).toContain(aMatchId);
    expect(ids).not.toContain(bMatchId);
    const mine = personal.find((m) => m.id === aMatchId);
    expect(mine?.label).toBe("vs. Support RLS Opp a");
    expect(mine?.scoreText).not.toBe("");
  });

  test("the About picker in a program A is not in lists nothing", async () => {
    const team = await getRecentMatchesForSupport(a.client, {
      id: "00000000-0000-0000-0000-000000000000",
      kind: "team",
    });
    expect(team).toEqual([]);
  });
});
