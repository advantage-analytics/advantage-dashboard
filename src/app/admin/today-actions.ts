"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/services/programs/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Resolve, or reopen, a Today row that has no natural close — a failed or
 * stuck analysis, a flagged label, Ask feedback. Shared across admins: one
 * admin resolving a row clears it for everyone (`admin_resolutions`).
 *
 * The key is the row's own Today key, so its prefix IS its kind, and only the
 * three resolvable kinds are accepted: a claim or a request is resolved by
 * deciding it in Requests, never from here.
 */

const RESOLVABLE_KEY = /^(job|label|ask):[0-9a-f-]{36}$/;
const NOT_AUTHORIZED = "Not authorized.";

export type ResolveResult = { ok: true } | { ok: false; error: string };

export async function resolveTodayItem(
  key: string,
  note: string | null,
): Promise<ResolveResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: NOT_AUTHORIZED };
  const match = typeof key === "string" ? RESOLVABLE_KEY.exec(key) : null;
  if (!match) return { ok: false, error: "This item can’t be resolved here." };
  const trimmed = typeof note === "string" ? note.trim().slice(0, 500) : "";

  const { error } = await createAdminClient()
    .from("admin_resolutions")
    .upsert(
      {
        item_key: key,
        kind: match[1],
        resolved_by: admin.id,
        resolved_at: new Date().toISOString(),
        note: trimmed || null,
      },
      { onConflict: "item_key" },
    );
  if (error) return { ok: false, error: "Couldn’t resolve it. Try again." };

  revalidatePath("/admin");
  return { ok: true };
}

/** Undo a resolution: the row goes back to waiting. */
export async function reopenTodayItem(key: string): Promise<ResolveResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: NOT_AUTHORIZED };
  if (typeof key !== "string" || !RESOLVABLE_KEY.test(key)) {
    return { ok: false, error: "This item can’t be reopened here." };
  }

  const { error } = await createAdminClient()
    .from("admin_resolutions")
    .delete()
    .eq("item_key", key);
  if (error) return { ok: false, error: "Couldn’t reopen it. Try again." };

  revalidatePath("/admin");
  return { ok: true };
}
