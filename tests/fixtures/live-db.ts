import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

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
  for (const dir of [process.cwd(), path.resolve(__dirname, '../..')]) {
    try {
      const raw = readFileSync(path.join(dir, '.env.local'), 'utf8');
      for (const line of raw.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
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

export const SUPABASE_URL = env('NEXT_PUBLIC_SUPABASE_URL');
export const ANON_KEY = env('NEXT_PUBLIC_SUPABASE_ANON_KEY');
export const SERVICE_ROLE_KEY = env('SUPABASE_SERVICE_ROLE_KEY');
export const HAVE_ENV = Boolean(SUPABASE_URL && ANON_KEY && SERVICE_ROLE_KEY);

/** For `test.skip(!HAVE_ENV, SKIP_REASON)` — the suite passes in a keyless checkout. */
export const SKIP_REASON =
  'NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY not set';

// ---------------------------------------------------------------------------
// Postgres error codes, surfaced by PostgREST as `error.code`.
// ---------------------------------------------------------------------------

export const INSUFFICIENT_PRIVILEGE = '42501';
export const NO_DATA_FOUND = 'P0002';

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

/** Create an auth user and sign it in with the anon key — a real RLS-scoped
 *  session. The new user's id is pushed onto `authUserIds` for cleanup. */
export async function createLogin(
  admin: SupabaseClient,
  label: string,
  opts: { mark: string; password: string; authUserIds: string[] }
): Promise<Session> {
  const email = `${opts.mark}-${label}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: opts.password,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(`createUser(${label}): ${error?.message}`);
  }
  opts.authUserIds.push(data.user.id);

  const client = createClient(SUPABASE_URL!, ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signIn = await client.auth.signInWithPassword({
    email,
    password: opts.password,
  });
  if (signIn.error) {
    throw new Error(`signIn(${label}): ${signIn.error.message}`);
  }
  return { client, userId: data.user.id };
}

/**
 * Create several logins concurrently, letting every underlying `createUser`
 * settle before a failure surfaces. Under a bare `Promise.all` a rejected
 * login makes `beforeAll` throw while a sibling's `createUser` is still in
 * flight; `afterAll` then reads `authUserIds` before that id is pushed, and a
 * real auth user is orphaned on the live project. `allSettled` guarantees the
 * array is complete before anything can throw.
 */
export async function createLogins(
  admin: SupabaseClient,
  labels: string[],
  opts: { mark: string; password: string; authUserIds: string[] }
): Promise<Session[]> {
  const results = await Promise.allSettled(
    labels.map((label) => createLogin(admin, label, opts))
  );
  const failed = results.find((r) => r.status === 'rejected');
  if (failed) throw (failed as PromiseRejectedResult).reason;
  return (results as PromiseFulfilledResult<Session>[]).map((r) => r.value);
}

/** Delete fixture auth users in parallel, attempting every deletion even when
 *  one fails. Auth deletion cascades `public.users` and `program_members`. */
export async function deleteAuthUsers(
  admin: SupabaseClient,
  ids: string[]
): Promise<void> {
  await Promise.allSettled(ids.map((id) => admin.auth.admin.deleteUser(id)));
}
