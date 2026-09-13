import { createAdminClient } from "@/lib/supabase/admin";
import { displayName } from "./invite-acceptance";

/**
 * Who owns a program — the one person a notice about it should reach.
 *
 * Membership lives in `program_members`, never on `users.role`, and the
 * one-owner partial unique index means a program has at most one row with
 * `role = 'owner'`. So this is a lookup, not a search: either one owner comes
 * back, or the program is still unclaimed (or mid-claim) and there is nobody
 * to tell.
 *
 * Server-only by construction: it goes through the admin client because the
 * caller is often an anonymous action (`requestInvite()`) with no session that
 * RLS could scope, and the owner's address must never be readable from the
 * browser anyway. Do not import this from anything a client component reaches.
 *
 * `name` is "Elena Vasquez", "Elena", or null — the same shape every other
 * greeting in the email module already handles without a dangling dash.
 */
export interface ProgramOwner {
  userId: string;
  email: string;
  name: string | null;
}

export async function getProgramOwner(
  programId: string,
): Promise<ProgramOwner | null> {
  const db = createAdminClient();

  const { data: member, error: memberError } = await db
    .from("program_members")
    .select("user_id")
    .eq("program_id", programId)
    .eq("role", "owner")
    .maybeSingle();

  if (memberError) {
    console.error("[programs] could not resolve the program owner", {
      programId,
      error: memberError.message,
    });
    return null;
  }
  if (!member?.user_id) return null;

  const userId = member.user_id as string;

  const { data: user, error: userError } = await db
    .from("users")
    .select("email, first_name, last_name")
    .eq("id", userId)
    .maybeSingle();

  if (userError) {
    console.error("[programs] could not read the program owner's account", {
      programId,
      error: userError.message,
    });
    return null;
  }

  const email = (user?.email as string | null)?.trim();
  // A member row without a mailable account is not an owner anyone can reach;
  // callers treat null as "nobody to notify", which is the honest answer.
  if (!email) return null;

  return {
    userId,
    email,
    name: displayName(
      (user?.first_name as string | null) ?? null,
      (user?.last_name as string | null) ?? null,
    ),
  };
}
