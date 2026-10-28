import { AdminHeader } from "@/components/admin/admin-header";
import { loadAdminNav } from "@/lib/data/admin-nav-server";
import { getInitials } from "@/lib/data/match-utils";
import { requireAdminOrNotFound } from "@/lib/services/programs/admin-guard";
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

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await requireAdminOrNotFound();

  const supabase = await createClient();
  const [
    {
      data: { user },
    },
    nav,
  ] = await Promise.all([supabase.auth.getUser(), loadAdminNav(admin.id)]);

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
    // One white surface, per the Admin Console canvas — `--surface-page` is
    // for inset wells, not the page.
    <div className="flex min-h-screen flex-col bg-[var(--surface-card)]">
      <AdminHeader nav={nav} viewer={viewer} />
      {/* No padding or max-width here: each page renders its own `AdminPage`
          column, so the Requests page can seat its peek drawer beside that
          column, flush to the viewport's right edge — see admin-page.tsx. */}
      <div className="flex flex-1 items-stretch">{children}</div>
    </div>
  );
}
