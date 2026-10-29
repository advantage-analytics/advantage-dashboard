"use server";

import { revalidatePath } from "next/cache";
import {
  ALLOWANCE_COLUMNS,
  avatarUrlFor,
  countPersonalMatches,
  displayName,
  personalAllowance,
} from "@/lib/data/admin-pilots-server";
import {
  MAX_VIDEO_HOURS,
  PILOT_DEFAULT_HOURS,
  type AccountPreviewResult,
} from "@/lib/data/admin-pilots-view";
import { PILOT_INDIVIDUAL_MAX_PLAYERS } from "@/lib/services/splitstep/config";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "./admin-guard";

/**
 * The Admin › Pilots writes: put a player on the individual pilot, take them
 * off, and give any account a monthly video allowance of its own.
 *
 * `users.individual_pilot` is operator-owned — `users_individual_pilot_guard`
 * (20260925024406_individual_pool_quota.sql) refuses any write from an
 * `authenticated` or `anon` JWT and holds the limit of 20 under an advisory
 * lock — so that write goes through the SERVICE ROLE, after `requireAdmin()`.
 * The layout guard protects the page, not the write.
 *
 * `users.video_hours_override` is written only by `admin_set_video_hours`
 * (20261028213238_video_hours_override.sql), which re-checks `is_admin()`
 * against `auth.uid()` and writes the audit row naming the admin — so it runs
 * on the SESSION client. Through the service role `auth.uid()` is null and the
 * function would refuse.
 */

const PAGE = "/admin/pilots";
const NOT_AUTHORIZED = "Not authorized.";
/** `raise exception … using errcode = '54000'` — the guard's "pilot is full". */
const PILOT_FULL_SQLSTATE = "54000";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type PilotActionResult = { ok: true } | { ok: false; error: string };

function normaliseEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  return EMAIL.test(email) ? email : null;
}

/** `ilike` with the wildcards escaped: an exact, case-insensitive match. */
function exactEmail(email: string): string {
  return email.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * The email field's live preview: who that address belongs to and what they
 * get now. Any account, not only pilots — Set hours works on everyone.
 */
export async function previewAccount(
  rawEmail: string,
): Promise<AccountPreviewResult> {
  if (!(await requireAdmin())) {
    return { status: "error", message: NOT_AUTHORIZED };
  }
  const email = normaliseEmail(rawEmail);
  if (!email) return { status: "none" };

  const db = createAdminClient();
  const { data: user, error } = await db
    .from("users")
    .select(
      `id, email, first_name, last_name, avatar_path, created_at, ${ALLOWANCE_COLUMNS}`,
    )
    .ilike("email", exactEmail(email))
    .maybeSingle();
  if (error) {
    return { status: "error", message: "Could not look that email up." };
  }
  if (!user) return { status: "none" };

  let matchCount = 0;
  try {
    matchCount = (await countPersonalMatches(db, [user.id])).get(user.id) ?? 0;
  } catch {
    return { status: "error", message: "Could not look that email up." };
  }

  const address = user.email ?? email;
  return {
    status: "found",
    account: {
      id: user.id,
      name: displayName(user.first_name, user.last_name, address),
      email: address,
      avatarUrl: avatarUrlFor(db, user.avatar_path),
      isPilot: user.individual_pilot === true,
      isAdmin: user.is_admin === true,
      matchCount,
      joinedAt: user.created_at ?? null,
      ...personalAllowance(user),
    },
  };
}

function hoursProblem(hours: number | null): string | null {
  if (hours === null) return null;
  if (!Number.isFinite(hours) || hours < 0) {
    return "Enter hours as a number, like 14 or 2.5.";
  }
  if (hours > MAX_VIDEO_HOURS) {
    return `That is more than the ${MAX_VIDEO_HOURS.toLocaleString("en-US")} hours an account can hold.`;
  }
  return null;
}

/** `admin_set_video_hours` on the session client; null clears the override. */
async function writeVideoHours(
  userId: string,
  hours: number | null,
): Promise<string | null> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_video_hours", {
    p_user_id: userId,
    p_hours: hours,
  });
  if (!error) return null;
  if (error.code === "42501") return NOT_AUTHORIZED;
  if (error.code === "P0002") return "That account no longer exists.";
  if (error.code === "22023") return error.message;
  return "Could not save the hours.";
}

/**
 * Give one account a monthly video allowance of its own, in hours (decimals
 * and 0 allowed), or `null` to clear it back to the account's normal cap.
 */
export async function setVideoHours(
  userId: string,
  hours: number | null,
): Promise<PilotActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: NOT_AUTHORIZED };
  if (typeof userId !== "string" || userId === "") {
    return { ok: false, error: "Choose an account first." };
  }
  const problem = hoursProblem(hours);
  if (problem) return { ok: false, error: problem };

  const error = await writeVideoHours(userId, hours);
  if (error) return { ok: false, error };

  revalidatePath(PAGE);
  return { ok: true };
}

/**
 * Put an account on the pilot. `hours` is the allowance the dialog asked for:
 * the pilot's own figure (10) leaves no override, so the person follows the
 * pilot figure if it ever changes; anything else is written as an override.
 */
export async function addIndividualPilot(
  rawEmail: string,
  hours: number = PILOT_DEFAULT_HOURS,
): Promise<PilotActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: NOT_AUTHORIZED };

  const email = normaliseEmail(rawEmail);
  if (!email) return { ok: false, error: "Enter an email address." };
  const problem = hoursProblem(hours);
  if (problem) return { ok: false, error: problem };

  const db = createAdminClient();
  const { data: user, error: findError } = await db
    .from("users")
    .select("id, individual_pilot, video_hours_override")
    .ilike("email", exactEmail(email))
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

  // The pilot figure needs no override; a stale one from before is cleared so
  // the account gets the 10 the dialog showed.
  const wanted = hours === PILOT_DEFAULT_HOURS ? null : hours;
  const current =
    user.video_hours_override == null
      ? null
      : Number(user.video_hours_override);
  if (wanted !== current) {
    const hoursError = await writeVideoHours(user.id, wanted);
    if (hoursError) {
      revalidatePath(PAGE);
      return {
        ok: false,
        error: `Added to the pilot, but their hours were not set: ${hoursError} Use Set hours to try again.`,
      };
    }
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
