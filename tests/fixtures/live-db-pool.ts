import { createHmac } from "node:crypto";

import { isAuthApiError, type SupabaseClient } from "@supabase/supabase-js";

import {
  ADMIN_RETRY_BUDGET_MS,
  SERVICE_ROLE_KEY,
  assertWritableTarget,
  findUserByEmail,
  hookDeadline,
  isTransientAuthError,
  passwordSignIn,
  retryAuthCall,
  retrySuffix,
  type HookDeadline,
  type Session,
  type SignInAttempt,
} from "./live-db";

/**
 * A fixed pool of reused test users for the live-DB specs.
 *
 * `createLogin` makes a fresh auth user per run and `deleteAuthUsers` removes
 * it, so every run churns users through the live project's auth tables. A
 * pool user is created the first time its slot is asked for and never
 * deleted: later runs look it up and sign it in with a password derived from
 * the service-role key, so the steady state is one sign-in per slot and no
 * admin user writes at all.
 *
 * Sharing is safe only because T2 runs the live specs one file at a time under
 * a lock every worktree on the machine agrees on (`./live-db-lock.ts`) — two
 * specs never hold the same slot at once.
 *
 * A pool user's `public.users` row outlives the run, so a spec's cleanup must
 * go by row id or run marker, never by cascading from an auth delete. What a
 * spec changes on the row itself is put back by `resetPoolUser` before the
 * slot is handed out again; domain rows left pointing at the user fail the
 * next hand-out rather than leaking into another spec's assertions.
 */

/** A slot is part of an email address — keep it to one plain token. */
const SLOT_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

export function poolEmail(slot: string): string {
  if (!SLOT_PATTERN.test(slot)) {
    throw new Error(`pool slot "${slot}" must match ${SLOT_PATTERN}`);
  }
  return `live-pool-${slot}@example.com`;
}

/**
 * The slot's password: an HMAC of the slot keyed by the service-role key. The
 * same on every run and every worktree, so a reused user signs in without a
 * per-run `updateUserById`, and unguessable to anyone without that key.
 * Rotating the key changes every password — `poolLogin` repairs that once per
 * slot on the next run.
 */
export function poolPassword(
  slot: string,
  secret: string | undefined = SERVICE_ROLE_KEY,
): string {
  if (!secret)
    throw new Error("poolPassword: SUPABASE_SERVICE_ROLE_KEY not set");
  const digest = createHmac("sha256", secret)
    .update(`live-pool:${slot}`)
    .digest("base64url");
  return `Pool-${digest}`;
}

/**
 * The `public.users` columns a spec may change, and the value each slot is
 * handed out with. A new-user row from `handle_new_user` already has these
 * values: the pool creates users without name metadata.
 *
 * Only columns a live spec writes are listed, plus `is_admin` and `plan`
 * regardless — a leftover admin or paid flag changes what every later spec
 * sees. `id`, `email` and `created_at` are identity, never reset. When a spec
 * starts writing another column, add it here with the spec's name.
 */
export const POOL_USER_DEFAULTS = {
  // admin-routes, admin-program-rpcs and admin-conferences-rpcs promote their
  // admin with the service role; admin-self-promotion flips it both ways.
  // Each demotes again in its own afterAll; this reset is the backstop for a
  // run that died before afterAll could.
  is_admin: false,
  // No spec writes it today. Billing owns it, and a stray `pro` would unlock
  // features for whichever spec draws the slot next.
  plan: "free",
  // pending-invites and program-owner-name-live name their program's owner;
  // program-owner-name-live also clears the name in its afterAll.
  first_name: null,
  last_name: null,
  // program-member-avatars points it at a test path.
  avatar_path: null,
} as const;

/**
 * Tables whose rows would make a reused user something other than a blank
 * new user, with the columns that reference `public.users`. The pool fails on
 * these rather than deleting them: a leftover is a spec whose cleanup missed,
 * and the fix belongs in that spec.
 */
const LEFTOVER_REFERENCES = [
  { table: "program_members", columns: ["user_id", "invited_by"] },
  { table: "programs", columns: ["owner_user_id"] },
] as const;

export interface PoolOptions {
  /** Shared by `poolLogins` so the hook is extended once per furthest wait. */
  deadline?: HookDeadline;
  /** The HMAC key. Defaults to the service-role key; tests pass their own. */
  secret?: string;
  /** Omit outside unit tests — the real sign-in talks to the live project. */
  signIn?: (email: string, password: string) => Promise<SignInAttempt>;
  /** Omit outside unit tests — the real guard reads this run's env. */
  guard?: (caller: string) => void;
}

/** The auth user's id for `email`, if the pool has created it before. */
async function findPoolUser(
  admin: SupabaseClient,
  email: string,
  deadline: HookDeadline,
): Promise<string | null> {
  // The profile row is the cheap lookup: PostgREST, no auth rate limit.
  const profile = await admin
    .from("users")
    .select("id")
    .eq("email", email)
    .limit(1);
  if (profile.error) {
    throw new Error(`users lookup (${email}): ${profile.error.message}`);
  }
  const rows = (profile.data ?? []) as { id: string }[];
  if (rows.length > 0) return rows[0].id;
  // `handle_new_user` swallows its own failures, so an auth user can exist
  // without a profile row. Ask auth before creating a duplicate.
  const existing = await findUserByEmail(admin, email, deadline);
  return existing?.id ?? null;
}

/** First use of a slot: create its auth user, confirmed, with the derived password. */
async function createPoolUser(
  admin: SupabaseClient,
  email: string,
  password: string,
  deadline: HookDeadline,
): Promise<string> {
  let failedForLoad = false;
  const outcome = await retryAuthCall(
    async () => {
      const created = await admin.auth.admin.createUser({
        email,
        password,
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
        // A 5xx that landed after the write — the user is ours.
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
      `createUser(${email}): ${error?.message}${retrySuffix(outcome)}`,
    );
  }
  return data.user.id;
}

/**
 * Put the slot's `public.users` row back to `POOL_USER_DEFAULTS`, creating the
 * row when `handle_new_user` did not.
 */
export async function resetPoolUser(
  admin: SupabaseClient,
  userId: string,
  email: string,
): Promise<void> {
  const updated = await admin
    .from("users")
    .update(POOL_USER_DEFAULTS)
    .eq("id", userId)
    .select("id");
  if (updated.error) {
    throw new Error(`users reset (${email}): ${updated.error.message}`);
  }
  if ((updated.data ?? []).length > 0) return;

  const inserted = await admin
    .from("users")
    .insert({ id: userId, email, ...POOL_USER_DEFAULTS });
  if (inserted.error) {
    throw new Error(`users insert (${email}): ${inserted.error.message}`);
  }
}

/** Throw, naming the table, when a previous spec left rows pointing at the user. */
async function assertNoLeftovers(
  admin: SupabaseClient,
  userId: string,
  email: string,
): Promise<void> {
  const checks = await Promise.all(
    LEFTOVER_REFERENCES.map(async ({ table, columns }) => ({
      table,
      columns,
      ...(await admin
        .from(table)
        .select("id", { count: "exact", head: true })
        .or(columns.map((column) => `${column}.eq.${userId}`).join(","))),
    })),
  );
  for (const { table, columns, count, error } of checks) {
    if (error) {
      throw new Error(`${table} leftover check (${email}): ${error.message}`);
    }
    if (count) {
      throw new Error(
        `pool user ${email} (${userId}) still has ${count} ${table} row(s) ` +
          `referencing it via ${columns.join("/")} — a spec's cleanup missed ` +
          `them. Delete them by id (\`clearPoolLeftovers\` sweeps a crashed ` +
          `run's); the pool never deletes the user.`,
      );
    }
  }
}

/**
 * Put a pool user a spec promoted with the service role back to a plain user.
 * Call it first in `afterAll` — a pool user left an admin is a standing admin
 * account on the target, and it must not wait on the rest of the cleanup —
 * then throw what it returns last, so that cleanup still runs. The reset in
 * `poolLogin` is the backstop for a run that never reached `afterAll`.
 * Resolves to the failure message, or null.
 */
export async function demotePoolAdmin(
  admin: SupabaseClient,
  session: Session | undefined,
): Promise<string | null> {
  if (!session) return null;
  const { error } = await admin
    .from("users")
    .update({ is_admin: POOL_USER_DEFAULTS.is_admin })
    .eq("id", session.userId);
  return error ? `is_admin reset: ${error.message}` : null;
}

function isInvalidCredentials(error: unknown): boolean {
  return isAuthApiError(error) && error.code === "invalid_credentials";
}

/**
 * A signed-in session for the pool user in `slot`, created on first use.
 *
 * Calls `auth.admin.createUser` only when the slot's email is not registered
 * and never deletes the user. The row reset and the leftover check run on
 * every hand-out, before the sign-in.
 */
export async function poolLogin(
  admin: SupabaseClient,
  slot: string,
  options: PoolOptions = {},
): Promise<Session> {
  const guard = options.guard ?? assertWritableTarget;
  guard(`poolLogin(${slot})`);
  const deadline = options.deadline ?? hookDeadline();
  const signIn =
    options.signIn ??
    ((email: string, password: string) =>
      passwordSignIn(email, password, deadline));
  const email = poolEmail(slot);
  const password = poolPassword(slot, options.secret ?? SERVICE_ROLE_KEY);

  const userId =
    (await findPoolUser(admin, email, deadline)) ??
    (await createPoolUser(admin, email, password, deadline));

  await assertNoLeftovers(admin, userId, email);
  await resetPoolUser(admin, userId, email);

  let attempt = await signIn(email, password);
  if (attempt.error && isInvalidCredentials(attempt.error)) {
    // The rare path, not the per-run one: the user was made under another
    // derivation or before the service-role key was rotated. Set the current
    // password once and sign in again; the next run signs straight in.
    const repaired = await retryAuthCall(
      () => admin.auth.admin.updateUserById(userId, { password }),
      { budgetMs: ADMIN_RETRY_BUDGET_MS, deadline },
    );
    if (repaired.result.error) {
      throw new Error(
        `updateUserById(${email}): ${repaired.result.error.message}${retrySuffix(repaired)}`,
      );
    }
    attempt = await signIn(email, password);
  }
  if (attempt.error) {
    throw new Error(
      `signIn(pool ${slot}): ${attempt.error.message}${attempt.suffix}`,
    );
  }
  return { client: attempt.client, userId };
}

/**
 * Several pool sessions concurrently, one per slot. `allSettled` for the same
 * reason as `createLogins`: nothing is orphaned here, but a rejected slot must
 * not let `afterAll` start cleanup while a sibling's reset is still writing.
 */
export async function poolLogins(
  admin: SupabaseClient,
  slots: string[],
  options: PoolOptions = {},
): Promise<Session[]> {
  (options.guard ?? assertWritableTarget)("poolLogins");
  if (new Set(slots).size !== slots.length) {
    throw new Error(`poolLogins: duplicate slot in [${slots.join(", ")}]`);
  }
  const shared = { ...options, deadline: options.deadline ?? hookDeadline() };
  const results = await Promise.allSettled(
    slots.map((slot) => poolLogin(admin, slot, shared)),
  );
  const failed = results.find((r) => r.status === "rejected");
  if (failed) throw (failed as PromiseRejectedResult).reason;
  return (results as PromiseFulfilledResult<Session>[]).map((r) => r.value);
}

/**
 * The pool user's id for `slot`, or null when the slot has never been handed
 * out. Never creates the user and never signs in, so a spec can find what a
 * crashed run left behind before it asks `poolLogin` for a session.
 */
export async function poolUserId(
  admin: SupabaseClient,
  slot: string,
  deadline: HookDeadline = hookDeadline(),
): Promise<string | null> {
  return findPoolUser(admin, poolEmail(slot), deadline);
}

/**
 * Delete the `LEFTOVER_REFERENCES` rows a crashed run left pointing at this
 * spec's own slots, and return the ids of the slots that exist.
 *
 * `poolLogin` refuses a slot while those rows remain, so without this one
 * interrupted run wedges its spec for good. A spec calls it first thing in
 * `beforeAll`, before `poolLogins`, with the same slot list — slots are
 * prefixed with the spec's name, so what it deletes can only be that spec's.
 * The returned ids are for the spec's own sweep of its domain rows (matches,
 * saved views, invitations …), which only it knows the shape of.
 *
 * Programs the users own go whole: their memberships first, then the
 * program. Everything else is memberships where the user is the member or
 * the inviter.
 */
export async function clearPoolLeftovers(
  admin: SupabaseClient,
  slots: readonly string[],
): Promise<string[]> {
  assertWritableTarget("clearPoolLeftovers");
  const deadline = hookDeadline();
  const found = await Promise.all(
    slots.map((slot) => poolUserId(admin, slot, deadline)),
  );
  const ids = found.filter((id): id is string => id !== null);
  if (ids.length === 0) return ids;

  const owned = await admin
    .from("programs")
    .select("id")
    .in("owner_user_id", ids);
  if (owned.error) {
    throw new Error(`clearPoolLeftovers programs: ${owned.error.message}`);
  }
  const ownedIds = ((owned.data ?? []) as { id: string }[]).map((p) => p.id);

  const fail = (label: string, error: { message: string } | null) => {
    if (error) throw new Error(`clearPoolLeftovers ${label}: ${error.message}`);
  };

  // The two membership sweeps are independent; the programs wait on both.
  const inList = `(${ids.join(",")})`;
  const [ownedMembers, memberships] = await Promise.all([
    ownedIds.length > 0
      ? admin.from("program_members").delete().in("program_id", ownedIds)
      : { error: null },
    admin
      .from("program_members")
      .delete()
      .or(`user_id.in.${inList},invited_by.in.${inList}`),
  ]);
  fail("owned programs' members", ownedMembers.error);
  fail("memberships", memberships.error);
  if (ownedIds.length > 0) {
    const programs = await admin.from("programs").delete().in("id", ownedIds);
    fail("owned programs", programs.error);
  }
  return ids;
}
