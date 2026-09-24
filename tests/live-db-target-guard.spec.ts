import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { expect, test } from "@playwright/test";

import { PRODUCTION_REF, isProductionTarget } from "./fixtures/live-db";
import { LIVE_DB_LOCK_PATH, acquireLiveDbLock } from "./fixtures/live-db-lock";
import { LIVE_DB_CALL, LIVE_DB_SPECS } from "./fixtures/live-db-specs";

/**
 * The guards around live-DB runs, offline.
 *
 * `HAVE_ENV` and the auth helpers' refusal both rest on `isProductionTarget`,
 * so the cases that decide whether a gate run may write to production are
 * pinned here with made-up keys and no network. So are the two that keep live
 * runs from bursting the auth rate limits: the serial project's spec list and
 * the machine-wide lock, the latter with a fake clock and a fake pid check.
 */

/** An unsigned legacy-style JWT carrying `payload` — enough for a claim read. */
function fakeJwt(payload: Record<string, unknown>): string {
  const part = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${part({ alg: "HS256", typ: "JWT" })}.${part(payload)}.signature`;
}

const PROD_URL = `https://${PRODUCTION_REF}.supabase.co`;
const BRANCH_URL = "https://abcdefghijklmnopqrst.supabase.co";
const PROD_KEY = fakeJwt({
  iss: "supabase",
  ref: PRODUCTION_REF,
  role: "anon",
});
const BRANCH_KEY = fakeJwt({
  iss: "supabase",
  ref: "abcdefghijklmnopqrst",
  role: "service_role",
});
/** The Supabase CLI's local-stack keys carry no ref at all. */
const LOCAL_KEY = fakeJwt({ iss: "supabase-demo", role: "anon" });

test.describe("isProductionTarget", () => {
  test("the production hostname is production, whatever the key", () => {
    expect(isProductionTarget(PROD_URL, BRANCH_KEY)).toBe(true);
    expect(isProductionTarget(PROD_URL, undefined)).toBe(true);
  });

  test("a branch hostname paired with a prod-ref key is production", () => {
    // `env()` falls back per key to `.env.local`, so this pairing is what a
    // run gets when only the URL is exported.
    expect(isProductionTarget(BRANCH_URL, PROD_KEY)).toBe(true);
    expect(isProductionTarget(BRANCH_URL, BRANCH_KEY, PROD_KEY)).toBe(true);
  });

  test("a branch hostname with branch keys is not production", () => {
    expect(isProductionTarget(BRANCH_URL, BRANCH_KEY, BRANCH_KEY)).toBe(false);
  });

  test("a loopback URL with local keys is not production", () => {
    expect(isProductionTarget("http://127.0.0.1:54321", LOCAL_KEY)).toBe(false);
    expect(isProductionTarget("http://localhost:54321", LOCAL_KEY)).toBe(false);
  });

  test("a non-JWT sb_secret_ key carries no ref and does not throw", () => {
    const secret = `sb_secret_${"x".repeat(31)}`;
    expect(isProductionTarget(BRANCH_URL, secret)).toBe(false);
    expect(isProductionTarget(BRANCH_URL, "sb_publishable_abc.def.ghi")).toBe(
      false,
    );
    expect(isProductionTarget(PROD_URL, secret)).toBe(true);
  });

  test("malformed keys and URLs never throw", () => {
    for (const key of ["", "a.b.c", "a.%%%.c", `x.${"e30"}.y`, "not a key"]) {
      expect(isProductionTarget(BRANCH_URL, key)).toBe(false);
    }
    expect(isProductionTarget("not a url", undefined)).toBe(false);
    expect(isProductionTarget(undefined, undefined)).toBe(false);
  });
});

test.describe("the live-DB spec list", () => {
  test("names exactly the specs that create auth users", () => {
    const testsDir = path.resolve(__dirname);
    const creating = readdirSync(testsDir)
      .filter((file) => file.endsWith(".spec.ts"))
      .filter((file) =>
        LIVE_DB_CALL.test(readFileSync(path.join(testsDir, file), "utf8")),
      )
      .sort();

    // A real list, so a renamed helper cannot make this pass vacuously.
    expect(creating.length).toBeGreaterThanOrEqual(10);
    expect([...LIVE_DB_SPECS].sort()).toEqual(creating);
  });
});

test.describe("the live-DB lock", () => {
  let dir: string;
  let lockPath: string;

  test.beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), "live-db-lock-"));
    lockPath = path.join(dir, "live-db.lock");
  });

  test.afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  /** A clock that only moves when the lock sleeps. */
  function fakeClock() {
    const clock = { t: 1_000_000, sleeps: [] as number[] };
    return {
      clock,
      now: () => clock.t,
      sleep: async (ms: number) => {
        clock.sleeps.push(ms);
        clock.t += ms;
      },
    };
  }

  const quiet = () => {};

  test("sits at one fixed path under the OS temp dir, whatever the checkout", () => {
    expect(path.dirname(LIVE_DB_LOCK_PATH)).toBe(os.tmpdir());
    expect(LIVE_DB_LOCK_PATH).not.toContain(process.cwd());
  });

  test("a free lock is taken at once and released on request", async () => {
    const { clock, now, sleep } = fakeClock();
    const release = await acquireLiveDbLock({
      lockPath,
      pid: 101,
      isAlive: () => true,
      now,
      sleep,
      log: quiet,
    });

    expect(clock.sleeps).toEqual([]);
    expect(JSON.parse(readFileSync(lockPath, "utf8")).pid).toBe(101);
    release();
    expect(existsSync(lockPath)).toBe(false);
    // Only the lock file itself was ever left in the directory.
    expect(readdirSync(dir)).toEqual([]);
  });

  test("a live holder is waited on for a bounded time, then named", async () => {
    const holder = await acquireLiveDbLock({
      lockPath,
      pid: 202,
      isAlive: () => true,
      log: quiet,
    });
    const { clock, now, sleep } = fakeClock();

    const error = await acquireLiveDbLock({
      lockPath,
      pid: 303,
      isAlive: (pid) => pid === 202,
      waitMs: 30_000,
      pollMs: 10_000,
      now,
      sleep,
      log: quiet,
    }).then(
      () => null,
      (e: Error) => e,
    );

    expect(error?.message).toContain(lockPath);
    expect(error?.message).toContain("pid 202");
    // Polls at 0s, 10s, 20s; a fourth wait would pass the 30s bound.
    expect(clock.sleeps).toEqual([10_000, 10_000, 10_000]);
    // The holder's lock is untouched by the loser.
    expect(JSON.parse(readFileSync(lockPath, "utf8")).pid).toBe(202);
    holder();
  });

  test("a holder that lets go during the wait hands the lock over", async () => {
    const holder = await acquireLiveDbLock({
      lockPath,
      pid: 202,
      isAlive: () => true,
      log: quiet,
    });
    const { clock, now } = fakeClock();

    const release = await acquireLiveDbLock({
      lockPath,
      pid: 303,
      isAlive: () => true,
      pollMs: 5_000,
      now,
      sleep: async (ms) => {
        clock.t += ms;
        holder();
      },
      log: quiet,
    });

    expect(JSON.parse(readFileSync(lockPath, "utf8")).pid).toBe(303);
    release();
  });

  test("a lock left by a dead pid is taken over without waiting", async () => {
    // A crashed run: its record is still on disk, its process is gone.
    await acquireLiveDbLock({
      lockPath,
      pid: 404,
      isAlive: () => true,
      log: quiet,
    });
    const { clock, now, sleep } = fakeClock();
    const logged: string[] = [];

    const release = await acquireLiveDbLock({
      lockPath,
      pid: 505,
      isAlive: (pid) => pid !== 404,
      now,
      sleep,
      log: (message) => logged.push(message),
    });

    expect(clock.sleeps).toEqual([]);
    expect(JSON.parse(readFileSync(lockPath, "utf8")).pid).toBe(505);
    expect(logged.join("\n")).toContain("dead pid 404");
    release();
    expect(readdirSync(dir)).toEqual([]);
  });

  test("an unreadable lock file is taken over, not waited on", async () => {
    writeFileSync(lockPath, "not json");
    const { clock, now, sleep } = fakeClock();

    const release = await acquireLiveDbLock({
      lockPath,
      pid: 606,
      isAlive: () => true,
      now,
      sleep,
      log: quiet,
    });

    expect(clock.sleeps).toEqual([]);
    expect(JSON.parse(readFileSync(lockPath, "utf8")).pid).toBe(606);
    release();
  });

  test("release never removes a successor's lock", async () => {
    const first = await acquireLiveDbLock({
      lockPath,
      pid: 707,
      isAlive: () => true,
      log: quiet,
    });
    // 707 is presumed dead and taken over while its release is still pending.
    const second = await acquireLiveDbLock({
      lockPath,
      pid: 808,
      isAlive: (pid) => pid !== 707,
      log: quiet,
    });

    first();
    expect(JSON.parse(readFileSync(lockPath, "utf8")).pid).toBe(808);
    second();
    expect(existsSync(lockPath)).toBe(false);
  });
});
