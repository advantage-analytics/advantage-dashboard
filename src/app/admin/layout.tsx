import { AdminHeader } from "@/components/admin/admin-header";
import { getInitials } from "@/lib/data/match-utils";
import { requireAdminOrNotFound } from "@/lib/services/programs/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { USER_AVATARS_BUCKET } from "@/lib/user/avatar";

/**
 * The admin area, gated once for everything beneath it.
 *
 * `notFound()` rather than a redirect for a signed-in non-admin: a 403 confirms
 * the route exists and is worth probing, where a 404 says nothing. Someone who
 * is not signed in goes to login instead, since for them it is genuinely a
 * session problem rather than a permissions one. Both outcomes now come from
 * `requireAdminOrNotFound()`, which is the same two-branch gate written once —
 * the loaders beneath re-run it rather than trusting that this layout ran,
 * because Next.js does not guarantee the order.
 *
 * `users.is_admin` is a real NOT NULL column defaulting to false. It is never
 * inferred from an email domain, and the server actions beneath this re-check
 * it anyway — a layout guard protects the page, not the write.
 */

/** Claims a human still has to decide — `needsReview()`'s two statuses. */
const REVIEWABLE_CLAIM_STATUSES = ["pending_review", "objected"];

/**
 * What the Requests tab counts: claims waiting on a decision plus open
 * program requests.
 *
 * Service role, not the session client, and not by choice: `program_requests`
 * carries no RLS policies at all, so a cookie-scoped read returns zero rows
 * rather than an error — a count that is silently always 0. The guard above
 * has already run, so this only ever executes for an admin.
 *
 * `head: true` with `count: "exact"` so neither query ships a row.
 */
async function loadRequestsCount(): Promise<number> {
  const db = createAdminClient();

  const [claims, requests] = await Promise.all([
    db
      .from("program_claims")
      .select("id", { count: "exact", head: true })
      .in("status", REVIEWABLE_CLAIM_STATUSES),
    db
      .from("program_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "open"),
  ]);

  return (claims.count ?? 0) + (requests.count ?? 0);
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdminOrNotFound();

  const supabase = await createClient();
  const [
    {
      data: { user },
    },
    requestsCount,
  ] = await Promise.all([supabase.auth.getUser(), loadRequestsCount()]);

  // `requireAdminOrNotFound()` already redirected a session-less visitor, so
  // this is a narrowing for the type checker rather than a second gate.
  const email = user?.email ?? "";

  // Own row only — `users` RLS is a blanket `auth.uid() = id`, which is all
  // this needs: the header draws the viewer, nobody else.
  const { data: profile } = await supabase
    .from("users")
    .select("first_name, last_name, avatar_path")
    .eq("id", user?.id ?? "")
    .maybeSingle();

  const fullName = [profile?.first_name, profile?.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  const localPart = email.split("@")[0] ?? email;
  const avatarPath = profile?.avatar_path ?? null;

  const viewer = {
    name: fullName || localPart,
    email,
    initials:
      (fullName && getInitials(fullName)) ||
      localPart.slice(0, 2).toUpperCase(),
    avatarUrl: avatarPath
      ? supabase.storage.from(USER_AVATARS_BUCKET).getPublicUrl(avatarPath).data
          .publicUrl
      : null,
  };

  return (
    <div className="min-h-screen bg-[var(--surface-page)]">
      <AdminHeader requestsCount={requestsCount} viewer={viewer} />
      <main className="mx-auto w-full max-w-[1200px] px-6 py-10">
        {children}
      </main>
    </div>
  );
}
