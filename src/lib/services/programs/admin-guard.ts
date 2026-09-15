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
 */
export async function requireAdmin(): Promise<{ id: string } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("users")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();

  return data?.is_admin ? { id: user.id } : null;
}

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
 */
export async function requireAdminOrNotFound(): Promise<{ id: string }> {
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
}
