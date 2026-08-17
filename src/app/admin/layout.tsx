import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * The admin area, gated once for everything beneath it.
 *
 * `notFound()` rather than a redirect for a signed-in non-admin: a 403 confirms
 * the route exists and is worth probing, where a 404 says nothing. Someone who
 * is not signed in goes to login instead, since for them it is genuinely a
 * session problem rather than a permissions one.
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

  return (
    <div className="min-h-screen bg-[var(--surface-page)]">
      <header className="flex items-center gap-4 border-b border-[var(--border-hairline)] bg-[var(--surface-card)] px-6 py-3">
        <Link
          href="/admin/claims"
          className="text-[13px] font-medium text-[var(--ink-900)]"
        >
          Review queue
        </Link>
        <span className="text-[11px] text-[var(--ink-400)]">Admin</span>
        <div className="flex-1" />
        <Link href="/dashboard" className="text-[12px] text-[var(--ink-500)] hover:text-[var(--ink-900)]">
          Back to the dashboard
        </Link>
      </header>
      <main className="mx-auto w-full max-w-[900px] px-6 py-10">{children}</main>
    </div>
  );
}
