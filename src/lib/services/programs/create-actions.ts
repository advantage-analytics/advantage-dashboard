"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { WORKSPACE_COOKIE } from "@/lib/workspace/active-workspace-server";

/**
 * Self-serve creation of a non-collegiate program — a club, a high school, an
 * academy, or something else with no ITA record behind it.
 *
 * The claim flow exists because a collegiate program is an external fact that
 * somebody could claim falsely; verification is what the whole pipeline buys.
 * A custom org has no external record to verify against, so the creator simply
 * owns it: no email confirmation, no pending claim, no admin review. The
 * `create_custom_program` RPC (introduced in migration 20260830000931,
 * hardened in 20260830050000) writes the program row (status `active`, roster
 * private) and the owner membership (`upload_enabled` true) in one atomic
 * step, deriving the owner from `auth.uid()` — the caller controls only the
 * new org's own name and type, and both are re-validated inside the function.
 * Two guards on the vendor budget ride with it: an account may own at most 2
 * custom orgs (the RPC's own count, surfaced as `limit-reached` below), and a
 * custom org draws the reduced processing tier, not the collegiate 75h — see
 * `quotaTierFor()` in `services/splitstep/quota.ts`.
 *
 * 'college' is deliberately not an accepted type here or in SQL: collegiate
 * programs enter through the seeded directory and the claim flow, never
 * through self-serve creation. Custom orgs carry no `program_key` (the schema
 * forbids it), which is what keeps them out of `/claim/[programKey]` and the
 * public program search for good.
 */

const CUSTOM_ORG_TYPES = ["club", "high_school", "academy", "other"] as const;

export type CustomOrgType = (typeof CUSTOM_ORG_TYPES)[number];

/** Mirrors the SQL bounds; the RPC is the enforcement, this is the fast no. */
const NAME_MIN = 2;
const NAME_MAX = 120;

export type CreateCustomProgramResult =
  | { ok: true; programId: string }
  | {
      ok: false;
      reason:
        | "no-session"
        | "invalid-name"
        | "invalid-org-type"
        /**
         * The per-account ownership cap: one account may own at most 2
         * custom orgs, enforced inside the RPC (migration 20260830050000)
         * under an advisory lock, where it cannot be raced or bypassed. Its
         * own reason because "you've hit the limit" has an explanation and
         * "something failed" only has a retry.
         */
        | "limit-reached"
        | "failed";
    };

/** SQLSTATE the RPC raises for the cap: 54000, `program_limit_exceeded`. */
const LIMIT_REACHED_SQLSTATE = "54000";

/**
 * Create the org and make it the active workspace.
 *
 * The cookie is written directly rather than through `setActiveWorkspace`,
 * for the reason `join-actions.ts` documents on its own `activate()`: that
 * action validates against a per-request memoised workspace list which was
 * built before this membership row existed, so the switch would be silently
 * dropped. The id being trusted here was just returned by a SECURITY DEFINER
 * function that created the membership for this very caller.
 *
 * Navigation is left to the caller — the screens that collect the name (T3)
 * own what happens after the workspace exists. The cookie plus the layout
 * revalidation mean the next dashboard render opens inside the new workspace.
 */
export async function createCustomProgram(input: {
  name: string;
  orgType: CustomOrgType;
}): Promise<CreateCustomProgramResult> {
  const name = (input?.name ?? "").trim();
  const orgType = input?.orgType;

  // Client-side friendliness only — the RPC re-checks both under its own
  // rules, because a server action's arguments are still client input.
  if (!CUSTOM_ORG_TYPES.includes(orgType)) {
    return { ok: false, reason: "invalid-org-type" };
  }
  if (name.length < NAME_MIN || name.length > NAME_MAX) {
    return { ok: false, reason: "invalid-name" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "no-session" };

  const { data, error } = await supabase.rpc("create_custom_program", {
    p_name: name,
    p_org_type: orgType,
  });

  if (error) {
    if (error.code === LIMIT_REACHED_SQLSTATE) {
      return { ok: false, reason: "limit-reached" };
    }
    console.error("[programs] custom org creation failed", {
      error: error.message,
    });
    return { ok: false, reason: "failed" };
  }

  const programId = (data as { program_id?: string } | null)?.program_id;
  if (!programId) return { ok: false, reason: "failed" };

  const cookieStore = await cookies();
  cookieStore.set(WORKSPACE_COOKIE, programId, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  revalidatePath("/dashboard", "layout");

  return { ok: true, programId };
}
