import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import * as path from "node:path";

import { test } from "@playwright/test";
import {
  createClient,
  isAuthApiError,
  isAuthRetryableFetchError,
  type SupabaseClient,
  type User,
} from "@supabase/supabase-js";

/**
 * Shared plumbing for specs that run against the live Supabase project — the
 * live DB is this repo's only schema source of truth, so RLS proofs run
 * nowhere else. This module owns the session plumbing only: env loading, the
 * skip guard, client construction, signed-in logins and auth-user cleanup.
 *
 * Domain fixtures (programs, members, matches, requests) stay inline in each
 * spec on purpose: an isolation claim is legible only when the rows sit next
 * to the assertions, and the specs' cleanup orders differ for real domain
 * reasons.
 */

// ---------------------------------------------------------------------------
// Environment — Playwright does not load .env.local; do it by hand.
// ---------------------------------------------------------------------------

function loadEnvLocal(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const dir of [process.cwd(), path.resolve(__dirname, "../..")]) {
    try {
      const raw = readFileSync(path.join(dir, ".env.local"), "utf8");
      for (const line of raw.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq === -1) continue;
        const key = trimmed.slice(0, eq).trim();
        let value = trimmed.slice(eq + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        if (!(key in out)) out[key] = value;
      }
      break; // first .env.local found wins
    } catch {
      // keep looking
    }
  }
  return out;
}

const fileEnv = loadEnvLocal();
const env = (key: string): string | undefined =>
  process.env[key] ?? fileEnv[key];

export const SUPABASE_URL = env("NEXT_PUBLIC_SUPABASE_URL");
export const ANON_KEY = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
export const SERVICE_ROLE_KEY = env("SUPABASE_SERVICE_ROLE_KEY");
export const HAVE_ENV = Boolean(SUPABASE_URL && ANON_KEY && SERVICE_ROLE_KEY);

/** For `test.skip(!HAVE_ENV, SKIP_REASON)` — the suite passes in a keyless checkout. */
export const SKIP_REASON =
  "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY not set";

// ---------------------------------------------------------------------------
// Postgres error codes, surfaced by PostgREST as `error.code`.
// ---------------------------------------------------------------------------

export const INSUFFICIENT_PRIVILEGE = "42501";
export const NO_DATA_FOUND = "P0002";

// ---------------------------------------------------------------------------
// Auth under load — retry what the server refused for load, and never let the
// wait eat the hook's budget.
// ---------------------------------------------------------------------------

/**
 * Why the auth calls below retry.
 *
 * `npm test` runs fully parallel, so the live specs create and sign in their
 * throwaway users in one burst: about 36 password sign-ins and 73 admin user
 * calls per run. Supabase Auth limits `POST /auth/v1/token` per IP with a
 * token bucket — a burst of 30, then a slow refill — and one run fits it with
 * almost nothing to spare. Every worktree and every session on a machine
 * shares that IP, so a second run started within a few minutes (another
 * worktree's gate, a re-run, a subagent running the live specs) empties the
 * bucket and the sign-ins come back `429 over_request_rate_limit`. Separately,
 * the admin user endpoints have had short spells of `500 unexpected_failure`
 * and `504` under the same parallel load.
 *
 * Both were measured, not guessed. On 2026-09-16 the project's auth logs show
 * clean runs at 36 sign-ins, 429s only in the minutes where two runs overlapped
 * (14:30–14:31Z and 14:51Z), and `/admin/users` failing 103 of 162 calls
 * around 07:32Z ("unable to find identity by email for duplicates: … timeout").
 * Each failure blocked a correct change at the task gate.
 *
 * None of these say anything about the code under test, so the fixture waits
 * them out instead of failing the spec. Raising the project's sign-in rate
 * limit would also work, but that setting guards the production app's real
 * users against credential stuffing; the tests adapt to it rather than the
 * other way round.
 *
 * Only load is retried: 429, 5xx, gateway and network failures. A 400, 401,
 * 403, 404, 409 or 422 is an answer, and a spec that gets one has a real bug.
 */
export function isTransientAuthError(error: unknown): boolean {
  // 502/503/504 and failures below HTTP (status 0).
  if (isAuthRetryableFetchError(error)) return true;
  if (isAuthApiError(error)) {
    return (
      error.status === 429 ||
      error.status >= 500 ||
      error.code === "request_timeout"
    );
  }
  // A non-JSON body — an HTML error page from a proxy in front of Auth.
  return error instanceof Error && error.name === "AuthUnknownError";
}

const RETRY_BASE_MS = 2_000;
/** Near the bucket's refill interval, so a waiter polls about once per new token. */
const RETRY_CAP_MS = 15_000;

/** A sign-in behind another run's burst waits for the bucket to refill: minutes. */
export const SIGN_IN_RETRY_BUDGET_MS = 8 * 60_000;
/** The admin 5xx spells observed lasted about three minutes. */
export const ADMIN_RETRY_BUDGET_MS = 3 * 60_000;

/**
 * Exponential backoff with half jitter: attempt 0 waits 1–2s, doubling to a
 * 7.5–15s band. The jitter keeps parallel workers from retrying in lockstep
 * and draining each refilled token together.
 */
export function retryDelayMs(
  attempt: number,
  random: number = Math.random(),
): number {
  const ceiling = Math.min(RETRY_CAP_MS, RETRY_BASE_MS * 2 ** attempt);
  return Math.round(ceiling / 2 + (ceiling / 2) * random);
}

/**
 * The largest hook budget any live-DB spec sets with `test.setTimeout`.
 * `tests/live-db-auth-retry.spec.ts` fails if a spec sets a larger one.
 *
 * Playwright can raise a running hook's timeout (`test.info().setTimeout`) but
 * cannot report it: inside `beforeAll`, `test.info().timeout` returns the
 * describe block's test timeout, not the hook's own. So an extension cannot add
 * to the current budget. It sets an absolute one, never below this floor,
 * which by construction never lowers the budget a spec chose.
 */
export const LIVE_HOOK_BUDGET_FLOOR_MS = 180_000;
/** Room after a wait for the next attempt, which a 504 holds for 10s, and the rest of the hook. */
const HOOK_HEADROOM_MS = 90_000;

/** When a fixture call began, and the furthest it has pushed the hook's deadline. */
export interface HookDeadline {
  start: number;
  extendedTo: number;
}

function hookDeadline(): HookDeadline {
  return { start: Date.now(), extendedTo: 0 };
}

/**
 * Make sure the running hook outlives a wait that is about to happen.
 *
 * A timeout set on a hook is measured from the hook's start. The fixtures are
 * called first thing in `beforeAll`, so a fixture call's own start stands in
 * for it; the headroom covers setup a spec runs before calling in.
 */
function extendHookBudget(deadline: HookDeadline, waitMs: number): void {
  const needed = Date.now() - deadline.start + waitMs + HOOK_HEADROOM_MS;
  const next = Math.max(LIVE_HOOK_BUDGET_FLOOR_MS, needed);
  if (next <= deadline.extendedTo) return;
  deadline.extendedTo = next;
  try {
    test.info().setTimeout(next);
  } catch {
    // Called outside a test or hook — there is no budget to extend.
  }
}

export interface RetryOptions {
  budgetMs: number;
  /** Extend the running hook's timeout before each wait. Omit in unit tests. */
  deadline?: HookDeadline;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  random?: () => number;
}

export interface RetryOutcome<R> {
  result: R;
  attempts: number;
  waitedMs: number;
}

const realSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Run a supabase-js auth call — which resolves `{ data, error }` rather than
 * throwing — until it succeeds, fails with an answer, or the budget is spent.
 * Whatever it last returned comes back, so the caller reports the real error.
 */
export async function retryAuthCall<R extends { error: unknown }>(
  call: () => Promise<R>,
  options: RetryOptions,
): Promise<RetryOutcome<R>> {
  const sleep = options.sleep ?? realSleep;
  const now = options.now ?? Date.now;
  const random = options.random ?? Math.random;
  const started = now();
  let waitedMs = 0;

  for (let attempt = 0; ; attempt += 1) {
    const result = await call();
    if (!result.error || !isTransientAuthError(result.error)) {
      return { result, attempts: attempt + 1, waitedMs };
    }
    const wait = retryDelayMs(attempt, random());
    if (now() - started + wait > options.budgetMs) {
      return { result, attempts: attempt + 1, waitedMs };
    }
    if (options.deadline) extendHookBudget(options.deadline, wait);
    await sleep(wait);
    waitedMs += wait;
  }
}

/** "(after 4 attempts over 23s)", or nothing when the first attempt settled it. */
function retrySuffix(outcome: RetryOutcome<unknown>): string {
  return outcome.attempts > 1
    ? ` (after ${outcome.attempts} attempts over ${Math.round(outcome.waitedMs / 1000)}s)`
    : "";
}

// ---------------------------------------------------------------------------
// Sessions.
// ---------------------------------------------------------------------------

export type Session = { client: SupabaseClient; userId: string };

/**
 * Per-run marker for every fixture row, so a crashed run is findable by hand:
 * `select * from programs where program_key like '<prefix>-%'`.
 */
export function runMarker(prefix: string): {
  mark: string;
  password: string;
} {
  return {
    mark: `${prefix}-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`,
    password: `Live-${randomUUID()}`,
  };
}

export function createAdminClient(): SupabaseClient {
  return createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * The auth user already registered under `email`, if any. Only asked after a
 * `createUser` failed for load and its retry reports the email as taken: a
 * 500 or 504 can land after the user was written, and without this the retry
 * would fail on a user this run created and orphan it on the live project.
 */
async function findUserByEmail(
  admin: SupabaseClient,
  email: string,
  deadline: HookDeadline,
): Promise<User | null> {
  const perPage = 1000;
  for (let page = 1; ; page += 1) {
    const outcome = await retryAuthCall(
      () => admin.auth.admin.listUsers({ page, perPage }),
      { budgetMs: ADMIN_RETRY_BUDGET_MS, deadline },
    );
    const { data, error } = outcome.result;
    if (error) return null;
    const match = data.users.find((user) => user.email === email);
    if (match) return match;
    if (data.users.length < perPage) return null;
  }
}

async function signIn(
  label: string,
  email: string,
  password: string,
  deadline: HookDeadline,
): Promise<SupabaseClient> {
  const client = createClient(SUPABASE_URL!, ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const outcome = await retryAuthCall(
    () => client.auth.signInWithPassword({ email, password }),
    { budgetMs: SIGN_IN_RETRY_BUDGET_MS, deadline },
  );
  if (outcome.result.error) {
    throw new Error(
      `signIn(${label}): ${outcome.result.error.message}${retrySuffix(outcome)}`,
    );
  }
  return client;
}

/** Create an auth user and sign it in with the anon key — a real RLS-scoped
 *  session. The new user's id is pushed onto `authUserIds` for cleanup. */
export async function createLogin(
  admin: SupabaseClient,
  label: string,
  opts: { mark: string; password: string; authUserIds: string[] },
  deadline: HookDeadline = hookDeadline(),
): Promise<Session> {
  const email = `${opts.mark}-${label}@example.com`;

  let failedForLoad = false;
  const outcome = await retryAuthCall(
    async () => {
      const created = await admin.auth.admin.createUser({
        email,
        password: opts.password,
        email_confirm: true,
      });
      if (created.error && isTransientAuthError(created.error)) {
        failedForLoad = true;
      } else if (
        failedForLoad &&
        isAuthApiError(created.error) &&
        (created.error.code === "email_exists" ||
          created.error.code === "user_already_exists")
      ) {
        const existing = await findUserByEmail(admin, email, deadline);
        if (existing) {
          return { data: { user: existing }, error: null } as const;
        }
      }
      return created;
    },
    { budgetMs: ADMIN_RETRY_BUDGET_MS, deadline },
  );

  const { data, error } = outcome.result;
  if (error || !data.user) {
    throw new Error(
      `createUser(${label}): ${error?.message}${retrySuffix(outcome)}`,
    );
  }
  opts.authUserIds.push(data.user.id);

  const client = await signIn(label, email, opts.password, deadline);
  return { client, userId: data.user.id };
}

/**
 * Create several logins concurrently, letting every underlying `createUser`
 * settle before a failure surfaces. Under a bare `Promise.all` a rejected
 * login makes `beforeAll` throw while a sibling's `createUser` is still in
 * flight; `afterAll` then reads `authUserIds` before that id is pushed, and a
 * real auth user is orphaned on the live project. `allSettled` guarantees the
 * array is complete before anything can throw.
 *
 * The logins share one hook deadline, so however many of them wait, the hook
 * is extended once per new furthest wait rather than once per login.
 */
export async function createLogins(
  admin: SupabaseClient,
  labels: string[],
  opts: { mark: string; password: string; authUserIds: string[] },
): Promise<Session[]> {
  const deadline = hookDeadline();
  const results = await Promise.allSettled(
    labels.map((label) => createLogin(admin, label, opts, deadline)),
  );
  const failed = results.find((r) => r.status === "rejected");
  if (failed) throw (failed as PromiseRejectedResult).reason;
  return (results as PromiseFulfilledResult<Session>[]).map((r) => r.value);
}

/** Delete fixture auth users in parallel, attempting every deletion even when
 *  one fails. Auth deletion cascades `public.users` and `program_members`.
 *  A deletion refused for load is retried, so a busy moment does not strand a
 *  throwaway user on the live project. */
export async function deleteAuthUsers(
  admin: SupabaseClient,
  ids: string[],
): Promise<void> {
  const deadline = hookDeadline();
  await Promise.allSettled(
    ids.map((id) =>
      retryAuthCall(() => admin.auth.admin.deleteUser(id), {
        budgetMs: ADMIN_RETRY_BUDGET_MS,
        deadline,
      }),
    ),
  );
}
