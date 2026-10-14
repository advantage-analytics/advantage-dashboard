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
} from "./fixtures/live-db";
import { clearPoolLeftovers, poolLogins } from "./fixtures/live-db-pool";

/**
 * `20261011191432_ask_usage.sql` — the Ask page's question limit — proven
 * against the live database rather than the migration's own claims:
 *
 *  1. A fresh month reads 0 of 20 and names the 1st of next month.
 *  2. The 21st reservation in a month is refused with `54000` and a message
 *     starting `ask_limit_reached`; nothing is inserted for it.
 *  3. A released reservation frees its slot.
 *  4. Two reservations sent at once from 19 used yield exactly one success
 *     (the per-user advisory lock).
 *  5. User A's id cannot release user B's reservation.
 *  6. A direct insert or delete on `ask_usage` as `authenticated` is refused
 *     with `42501` (only SELECT is granted), A reads only A's rows, and an
 *     anonymous client cannot call the functions.
 *  7. `ask_release_question(p_user_id, usage_id)` is the server's: a
 *     signed-in user's own client cannot call it in any argument shape (or
 *     the limit would be theirs to reset), and neither can an anonymous one.
 *
 * Reserving and reading go through the user's own client, as the route does
 * them. Releasing goes through the service-role client with the user's id as
 * `p_user_id` — the route's path (`src/lib/services/ask/database.ts`).
 *
 * Every row this spec writes names one of its two pool users, so the sweep
 * in `beforeAll`/`afterAll` goes by `user_id` and no real row is touched.
 *
 * Run on demand:  npx playwright test tests/ask-quota.spec.ts
 */

const TABLE = "ask_usage";
const CAP = 20;
/** Postgres `program_limit_exceeded` — what `ask_reserve_question` raises at the cap. */
const LIMIT_EXCEEDED = "54000";

/** Pool slots, prefixed with this spec's name so no other spec draws them. */
const SLOTS = ["ask-quota-a", "ask-quota-b"];

type Quota = { used: number; cap: number; resets_on: string };
type Reservation = Quota & { usage_id: string };

/** `YYYY-MM-01` of the current UTC month, as `currentBillingMonth()` keys it. */
function billingMonth(now = new Date()): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}-01`;
}

/** The 1st of the UTC month after `billingMonth()` — what `resets_on` must say. */
function resetsOn(now = new Date()): string {
  const next = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  );
  return next.toISOString().slice(0, 10);
}

test.describe("ask_usage: the question limit (live)", () => {
  test.describe.configure({ mode: "serial", timeout: 60_000 });
  test.skip(!HAVE_ENV, SKIP_REASON);

  let admin: SupabaseClient; // service role
  let a: Session;
  let b: Session;
  let poolUserIds: string[] = [];

  const anon = () =>
    createClient(SUPABASE_URL!, ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

  const reserve = (s: Session) =>
    s.client.rpc("ask_reserve_question") as unknown as Promise<{
      data: Reservation | null;
      error: { code?: string; message: string } | null;
    }>;

  const quota = (s: Session) =>
    s.client.rpc("ask_quota") as unknown as Promise<{
      data: Quota | null;
      error: { code?: string; message: string } | null;
    }>;

  type Released = {
    data: boolean | null;
    error: { code?: string; message: string } | null;
  };

  /** The server path: the service role, naming whose reservation it is. */
  const release = (s: Session, usageId: string) =>
    admin.rpc("ask_release_question", {
      p_user_id: s.userId,
      usage_id: usageId,
    }) as unknown as Promise<Released>;

  /** Any client, any arguments: the raw call, for the refusal cases. */
  const releaseAs = (client: SupabaseClient, args: Record<string, unknown>) =>
    client.rpc("ask_release_question", args) as unknown as Promise<Released>;

  /** Ground truth, past RLS: the user's row count for the current month. */
  const countFor = async (userId: string): Promise<number> => {
    const rows = await admin
      .from(TABLE)
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("billing_month", billingMonth());
    if (rows.error) throw new Error(`count: ${rows.error.message}`);
    return rows.count ?? 0;
  };

  /** Bring the user to `used` rows this month with service-role writes. */
  const seedTo = async (userId: string, used: number): Promise<void> => {
    const have = await countFor(userId);
    if (have > used) {
      const extra = await admin
        .from(TABLE)
        .select("id")
        .eq("user_id", userId)
        .eq("billing_month", billingMonth())
        .limit(have - used);
      if (extra.error) throw new Error(`seed trim: ${extra.error.message}`);
      const ids = (extra.data as { id: string }[]).map((r) => r.id);
      const gone = await admin.from(TABLE).delete().in("id", ids);
      if (gone.error) throw new Error(`seed trim: ${gone.error.message}`);
    } else if (have < used) {
      const rows = Array.from({ length: used - have }, () => ({
        user_id: userId,
        billing_month: billingMonth(),
      }));
      const seeded = await admin.from(TABLE).insert(rows);
      if (seeded.error) throw new Error(`seed: ${seeded.error.message}`);
    }
    expect(await countFor(userId)).toBe(used);
  };

  const sweep = async () => {
    if (poolUserIds.length === 0) return;
    const gone = await admin.from(TABLE).delete().in("user_id", poolUserIds);
    if (gone.error) throw new Error(`${TABLE} sweep: ${gone.error.message}`);
  };

  test.beforeAll(async () => {
    test.setTimeout(180_000);
    admin = createAdminClient();

    // The reused users outlive the run, and so would an interrupted run's
    // reservations — which would make the first assertion below read "used".
    const leftoverIds = await clearPoolLeftovers(admin, SLOTS);
    poolUserIds = leftoverIds;
    await sweep();

    const sessions = await poolLogins(admin, SLOTS);
    [a, b] = sessions;
    poolUserIds = sessions.map((s) => s.userId);
    await sweep();
  });

  test.afterAll(async () => {
    test.setTimeout(180_000);
    if (!admin) return;
    await sweep();
  });

  // ── 1. Reading ────────────────────────────────────────────────────────────

  test("a fresh month reads 0 of 20 and resets on the 1st of next month", async () => {
    const read = await quota(a);
    expect(read.error).toBeNull();
    expect(read.data).toEqual({ used: 0, cap: CAP, resets_on: resetsOn() });
  });

  test("a reservation counts up and hands back its id", async () => {
    const first = await reserve(a);
    expect(first.error).toBeNull();
    expect(first.data).toMatchObject({
      used: 1,
      cap: CAP,
      resets_on: resetsOn(),
    });
    expect(first.data?.usage_id).toMatch(/^[0-9a-f-]{36}$/);

    const read = await quota(a);
    expect(read.data).toEqual({ used: 1, cap: CAP, resets_on: resetsOn() });
    expect(await countFor(a.userId)).toBe(1);
  });

  // ── 2. The cap ────────────────────────────────────────────────────────────

  test("the 21st reservation in a month is refused and inserts nothing", async () => {
    await seedTo(a.userId, CAP);

    const refused = await reserve(a);
    expect(refused.data).toBeNull();
    expect(refused.error?.code).toBe(LIMIT_EXCEEDED);
    expect(refused.error?.message).toMatch(/^ask_limit_reached/);

    expect(await countFor(a.userId)).toBe(CAP);
    const read = await quota(a);
    expect(read.data).toEqual({ used: CAP, cap: CAP, resets_on: resetsOn() });
  });

  // ── 3. Release ────────────────────────────────────────────────────────────

  test("a released reservation frees its slot", async () => {
    await seedTo(a.userId, CAP - 1);
    const held = await reserve(a);
    expect(held.error).toBeNull();
    expect(held.data?.used).toBe(CAP);

    const released = await release(a, held.data!.usage_id);
    expect(released.error).toBeNull();
    expect(released.data).toBe(true);
    expect(await countFor(a.userId)).toBe(CAP - 1);

    const again = await reserve(a);
    expect(again.error).toBeNull();
    expect(again.data?.used).toBe(CAP);

    // Releasing the same id twice is a no-op, not an error.
    const twice = await release(a, held.data!.usage_id);
    expect(twice.error).toBeNull();
    expect(twice.data).toBe(false);
  });

  // ── 4. Concurrency ────────────────────────────────────────────────────────

  test("two concurrent reservations at 19 used yield exactly one success", async () => {
    await seedTo(a.userId, CAP - 1);

    const [one, two] = await Promise.all([reserve(a), reserve(a)]);
    const outcomes = [one, two];
    const wins = outcomes.filter((r) => r.error === null && r.data !== null);
    const losses = outcomes.filter((r) => r.error?.code === LIMIT_EXCEEDED);
    expect(wins, "one success").toHaveLength(1);
    expect(losses, "one refusal").toHaveLength(1);
    expect(wins[0].data?.used).toBe(CAP);
    expect(await countFor(a.userId)).toBe(CAP);
  });

  // ── 5. Ownership ──────────────────────────────────────────────────────────

  test("user A's id cannot release user B's reservation", async () => {
    const theirs = await reserve(b);
    expect(theirs.error).toBeNull();
    const usageId = theirs.data!.usage_id;

    const stolen = await release(a, usageId);
    expect(stolen.error).toBeNull();
    expect(stolen.data).toBe(false);
    expect(await countFor(b.userId)).toBe(1);

    const own = await release(b, usageId);
    expect(own.error).toBeNull();
    expect(own.data).toBe(true);
    expect(await countFor(b.userId)).toBe(0);
  });

  // ── 6. Privilege boundary ─────────────────────────────────────────────────

  test("a direct insert or delete as authenticated is refused; reads are own rows only", async () => {
    const inserted = await a.client
      .from(TABLE)
      .insert({ user_id: a.userId, billing_month: billingMonth() });
    expect(inserted.error?.code, "insert").toBe(INSUFFICIENT_PRIVILEGE);

    const deleted = await a.client.from(TABLE).delete().eq("user_id", a.userId);
    expect(deleted.error?.code, "delete").toBe(INSUFFICIENT_PRIVILEGE);
    expect(await countFor(a.userId)).toBe(CAP);

    // B holds a row again so A's read has something to withhold.
    const theirs = await reserve(b);
    expect(theirs.error).toBeNull();

    const mine = await a.client.from(TABLE).select("user_id");
    expect(mine.error).toBeNull();
    expect(mine.data).toHaveLength(CAP);
    expect(mine.data?.every((r) => r.user_id === a.userId)).toBe(true);
  });

  test("an anonymous client cannot call the functions", async () => {
    const client = anon();
    for (const fn of ["ask_quota", "ask_reserve_question"]) {
      const call = await client.rpc(fn);
      expect(call.error?.code, fn).toBe(INSUFFICIENT_PRIVILEGE);
    }
  });

  // ── 7. Release is the server's ────────────────────────────────────────────

  test("a user's own client cannot release a reservation, their own included", async () => {
    await seedTo(b.userId, 0);
    const held = await reserve(b);
    expect(held.error).toBeNull();
    const usageId = held.data!.usage_id;

    // The one-argument form the function had while users could call it, the
    // server's form naming themselves, and the server's form naming someone
    // else. PostgREST answers "no such function" and "may not execute" with
    // different errors; either is a refusal, so the code is not pinned.
    const shapes: Record<string, unknown>[] = [
      { usage_id: usageId },
      { p_user_id: b.userId, usage_id: usageId },
      { p_user_id: a.userId, usage_id: usageId },
    ];
    for (const client of [b.client, a.client, anon()]) {
      for (const args of shapes) {
        const got = await releaseAs(client, args);
        const label = Object.keys(args).join(", ");
        expect(got.error, label).not.toBeNull();
        expect(got.data, label).toBeNull();
      }
    }
    // Still held: nothing above gave it back.
    expect(await countFor(b.userId)).toBe(1);

    // A null user is refused, and releases nothing.
    const nobody = await releaseAs(admin, {
      p_user_id: null,
      usage_id: usageId,
    });
    expect(nobody.error).not.toBeNull();
    expect(nobody.data).toBeNull();
    expect(await countFor(b.userId)).toBe(1);

    // The server, naming its owner, does.
    const released = await release(b, usageId);
    expect(released.error).toBeNull();
    expect(released.data).toBe(true);
    expect(await countFor(b.userId)).toBe(0);
  });
});
