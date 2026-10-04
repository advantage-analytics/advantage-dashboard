"use server";

import { revalidatePath } from "next/cache";
import { PILOT_INDIVIDUAL_MAX_PLAYERS } from "@/lib/services/splitstep/config";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "./admin-guard";

/**
 * The Admin › Pilots writes: put a player on the individual pilot, or take
 * them off.
 *
 * `users.individual_pilot` is operator-owned — `users_individual_pilot_guard`
 * (20260925024406_individual_pool_quota.sql) refuses any write from an
 * `authenticated` or `anon` JWT and holds the limit of 20 under an advisory
 * lock — so the write goes through the SERVICE ROLE, after `requireAdmin()`.
 * The layout guard protects the page, not the write.
 *
 * Ticking someone moves this month's personal ledger rows into the pilot band
 * with them (the band reads the uploader's CURRENT flag), and their personal
 * cap becomes 10h from the next read — `monthlyCapSecondsFor()`.
 */

const PAGE = "/admin/pilots";
const NOT_AUTHORIZED = "Not authorized.";
/** `raise exception … using errcode = '54000'` — the guard's "pilot is full". */
const PILOT_FULL_SQLSTATE = "54000";

export type PilotActionResult = { ok: true } | { ok: false; error: string };

export async function addIndividualPilot(
  rawEmail: string,
): Promise<PilotActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: NOT_AUTHORIZED };

  const email = rawEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Enter an email address." };
  }

  const db = createAdminClient();
  // `ilike` with the wildcards escaped: an exact, case-insensitive match.
  const { data: user, error: findError } = await db
    .from("users")
    .select("id, individual_pilot")
    .ilike(
      "email",
      email.replace(/[\\%_]/g, (c) => `\\${c}`),
    )
    .maybeSingle();
  if (findError) return { ok: false, error: "Could not look that email up." };
  if (!user) {
    return {
      ok: false,
      error:
        "No Advantage account uses that email. They need to sign up first.",
    };
  }
  if (user.individual_pilot) {
    return { ok: false, error: "That player is already a pilot." };
  }

  const { error } = await db
    .from("users")
    .update({ individual_pilot: true })
    .eq("id", user.id);
  if (error) {
    return {
      ok: false,
      error:
        error.code === PILOT_FULL_SQLSTATE
          ? `The pilot is full: ${PILOT_INDIVIDUAL_MAX_PLAYERS} of ${PILOT_INDIVIDUAL_MAX_PLAYERS} players. Remove one first.`
          : "Could not add that player.",
    };
  }

  revalidatePath(PAGE);
  return { ok: true };
}

export async function removeIndividualPilot(
  userId: string,
): Promise<PilotActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: NOT_AUTHORIZED };

  const { error } = await createAdminClient()
    .from("users")
    .update({ individual_pilot: false })
    .eq("id", userId);
  if (error) return { ok: false, error: "Could not remove that player." };

  revalidatePath(PAGE);
  return { ok: true };
}
