import { cache } from "react";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Every admin write re-checks the session.
 *
 * The spec's original design was an emailed approve/reject link. Even there it
 * said the link is "a shortcut to a page, not the authorization itself" — so
 * the check lives here, on the action, and a leaked URL can no more approve a
 * claim than a stranger walking past a screen can.
 *
 * `is_admin` is a real column on `users` with a `false` default; it is not
 * inferred from an email domain.
 *
 * `cache()`d because one request can reach this several times — the upload
 * page's context read, then `loadAdminTournamentAction`, then the snapshot
 * loader inside it — and nothing in a request writes `is_admin` between those
 * reads, so the second and third are the same answer. The cache is
 * per-request: every server action is its own request and still re-checks.
 *
 * Two answers, not one: `{ ok: false, status: 401 }` is "no session" and
 * `{ ok: false, status: 403 }` is "signed in, not an admin", so an API route
 * can answer the status HTTP means. Server actions that only need yes/no use
 * `requireAdmin()` below, which is this with the reason dropped.
 */
export type AdminCheck =
  { ok: true; id: string } | { ok: false; status: 401 | 403 };

export const checkAdmin = cache(async (): Promise<AdminCheck> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401 };

  const { data } = await supabase
    .from("users")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();

  return data?.is_admin
    ? { ok: true, id: user.id }
    : { ok: false, status: 403 };
});

/** `checkAdmin()` as yes/no: the actor, or `null` for either refusal. */
export const requireAdmin = cache(async (): Promise<{ id: string } | null> => {
  const check = await checkAdmin();
  return check.ok ? { id: check.id } : null;
});

/**
 * Same gate as `admin/layout.tsx`, for a server component or loader that is
 * already inside that layout's tree.
 *
 * Defense in depth, not trust in the caller: Next.js does not guarantee a
 * layout has actually run before a nested loader does, so this re-derives the
 * same two outcomes the layout enforces rather than assuming them. No
 * session is genuinely a session problem, so it goes to login exactly like
 * the layout does; a signed-in non-admin gets `notFound()` — a 403 would
 * confirm the route exists and is worth probing, where a 404 says nothing.
 *
 * `cache()`d because the layout and every loader nested under it (e.g.
 * `getAdminTeam`) call this once per request — without memoizing, that is two
 * `users` round trips (one here, one inside the loader) for a check with no
 * arguments to vary on.
 */
export const requireAdminOrNotFound = cache(
  async (): Promise<{ id: string }> => {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/login");

    const { data } = await supabase
      .from("users")
      .select("is_admin")
      .eq("id", user.id)
      .maybeSingle();

    if (!data?.is_admin) notFound();

    return { id: user.id };
  },
);
