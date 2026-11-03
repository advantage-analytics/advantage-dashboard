import { cache } from "react";
import { redirect, notFound } from "next/navigation";
import { loginRedirectPath } from "@/lib/auth/request-path";
import { createAdminClient, type AdminClient } from "@/lib/supabase/admin";
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
export async function requireAdmin(): Promise<{ id: string } | null> {
  const check = await checkAdmin();
  return check.ok ? { id: check.id } : null;
}

/**
 * Same gate as `admin/layout.tsx`, for a server component or loader that is
 * already inside that layout's tree.
 *
 * Defense in depth, not trust in the caller: Next.js does not guarantee a
 * layout has actually run before a nested loader does, so this re-derives the
 * same two outcomes the layout enforces rather than assuming them. No
 * session is genuinely a session problem, so it goes to login (with `?next=`
 * set to the page asked for) exactly like the layout does; a signed-in
 * non-admin gets `notFound()` — a 403 would
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

    // Back to the page that was asked for once signed in: the internal review
    // emails link straight to `/admin/requests?id=…`, and a bare `/login`
    // dropped the admin on the personal dashboard instead.
    if (!user) redirect(await loginRedirectPath("/admin"));

    const { data } = await supabase
      .from("users")
      .select("is_admin")
      .eq("id", user.id)
      .maybeSingle();

    if (!data?.is_admin) notFound();

    return { id: user.id };
  },
);

// ── Labelling: admin or assigned labeller ──────────────────────────────────

export type LabelActorKind = "admin" | "labeller";
/** Who may work a labelling session: an admin, or the labeller it is assigned to. */
export interface LabelActor {
  id: string;
  kind: LabelActorKind;
}

/**
 * The session a label write names, for `requireLabelActor`. Only the row
 * columns the gate reads; `label-actor.ts` resolves a point or shot to one.
 */
interface LabelSessionGateRow {
  assigned_to: string | null;
  status: string;
}

/** What `requireLabelActor` needs; specs pass fakes. */
export interface LabelActorDependencies {
  checkAdmin: () => Promise<AdminCheck>;
  createClient: () => Promise<{
    auth: {
      getUser: () => Promise<{
        data: { user: { id: string } | null };
      }>;
    };
  }>;
  createAdminClient: () => AdminClient;
}
export const defaultLabelActorDependencies: LabelActorDependencies = {
  checkAdmin,
  createClient,
  createAdminClient,
};

/**
 * The labelling console's gate, where every label service used to ask
 * `requireAdmin()` alone.
 *
 * An admin is `kind: "admin"` on any session, decided by `checkAdmin()` with
 * no session read — the console they already hold works every match. Anyone
 * else must be a labeller (`users.is_labeller`, read service-role: the column
 * has no client grant, so a user cannot read — or write — their own) AND the
 * session must be assigned to them AND still `labelling`. A `submitted`
 * session is out of the labeller's hands until an admin reopens it, and a
 * `complete` one is frozen for everyone, so both refuse here before the
 * service's own `checkSessionOpen` would.
 *
 * Every refusal is `null`, never a throw: the services turn it into the one
 * sentence they already show (`ACTOR_REQUIRED`). Not `cache()`d: the admin
 * branch is cached through `checkAdmin()`, and the labeller branch varies on
 * `sessionId` — a server action is one request working one session, so a
 * second read in the same request is the rare case, not the common one.
 */
export async function requireLabelActor(
  sessionId: string,
  deps: LabelActorDependencies = defaultLabelActorDependencies,
): Promise<LabelActor | null> {
  const check = await deps.checkAdmin();
  if (check.ok) return { id: check.id, kind: "admin" };
  // No session at all: nothing to look up a labeller for.
  if (check.status === 401) return null;
  if (!sessionId) return null;

  const supabase = await deps.createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = deps.createAdminClient();
  const [labeller, session] = await Promise.all([
    admin
      .from("users")
      .select("is_labeller")
      .eq("id", user.id)
      .maybeSingle<{ is_labeller: boolean }>(),
    admin
      .from("label_sessions")
      .select("assigned_to, status")
      .eq("id", sessionId)
      .maybeSingle<LabelSessionGateRow>(),
  ]);
  if (labeller.error || session.error) return null;
  if (labeller.data?.is_labeller !== true) return null;
  if (!session.data) return null;
  if (session.data.assigned_to !== user.id) return null;
  if (session.data.status !== "labelling") return null;

  return { id: user.id, kind: "labeller" };
}

// ── The /label area: admin or any labeller ─────────────────────────────────

/** What `requireLabelViewerOrNotFound` needs; specs pass fakes. */
export interface LabelViewerDependencies {
  createClient: LabelActorDependencies["createClient"];
  createAdminClient: () => AdminClient;
  loginRedirectPath: (fallback: string) => Promise<string>;
  redirect: (path: string) => never;
  notFound: () => never;
}
export const defaultLabelViewerDependencies: LabelViewerDependencies = {
  createClient,
  createAdminClient,
  loginRedirectPath,
  redirect,
  notFound,
};

/**
 * The `/label` area's gate — `requireAdminOrNotFound`'s twin for the
 * labeller's own pages, written once and re-run by every loader beneath
 * `label/layout.tsx` for the same reason the admin one is: Next.js does not
 * promise the layout ran first.
 *
 * No session goes to login with `?next=` set to the page asked for; signed in
 * but neither an admin nor a labeller is `notFound()`, never a 403, so the
 * route's existence is not confirmed to someone probing it. Both flags are
 * read service-role from the caller's own row, keyed by the id
 * `auth.getUser()` verified: `is_labeller` has no client grant, and nothing a
 * client sends can name a different user.
 *
 * Unlike `requireLabelActor`, this asks nothing about a session — it decides
 * who may see the area at all. Which sessions they then see is the loader's
 * business (`listAssignedLabelSessions`), and every write still goes through
 * `requireLabelActor`.
 *
 * `cache()`d: the layout and the page each call it once per request.
 */
export const requireLabelViewerOrNotFound = cache(
  async (
    deps: LabelViewerDependencies = defaultLabelViewerDependencies,
  ): Promise<LabelActor> => {
    const supabase = await deps.createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return deps.redirect(await deps.loginRedirectPath("/label"));

    const { data, error } = await deps
      .createAdminClient()
      .from("users")
      .select("is_admin, is_labeller")
      .eq("id", user.id)
      .maybeSingle<{ is_admin: boolean | null; is_labeller: boolean | null }>();

    // A failed read is treated as no flags: the gate fails closed.
    if (error || !data) return deps.notFound();
    if (data.is_admin === true) return { id: user.id, kind: "admin" };
    if (data.is_labeller === true) return { id: user.id, kind: "labeller" };
    return deps.notFound();
  },
);
