import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { crestUrl } from "@/lib/data/teams-server";
import { resolveJoinState, type JoinState } from "./invite-acceptance";
import { hasProfileName } from "./join-name";
import { joinTokenFromPath } from "./join-links";
import { hashToken } from "./tokens";

/**
 * `resolveJoinState`, once per request.
 *
 * `/join/[token]` reads the state twice — `generateMetadata` for the tab title
 * and link preview, then the page — and React `cache()` makes those one read.
 * Here rather than in `invite-acceptance.ts` so that module stays free of a
 * React import its offline specs would have to load.
 */
export const resolveJoinStateOnce = cache((token: string): Promise<JoinState> =>
  resolveJoinState(token),
);

/**
 * The team a sign-in is for, when `next` is a join link — otherwise null.
 *
 * `/login` and `/sign-up` receive only a path. When that path is
 * `/join/<token>` the header can say "Sign in to join <team>" instead of the
 * generic welcome, which is the difference between a detour that explains
 * itself and one that looks like the link broke.
 *
 * Only the states that still lead to a Join button name the team. A spent,
 * expired or unknown token answers null, so these pages never confirm more
 * about a token than the join page itself would on the way back.
 */
export async function joinProgramNameForNext(
  next: string,
): Promise<string | null> {
  const token = joinTokenFromPath(next);
  if (!token) return null;

  const state = await resolveJoinStateOnce(token);
  switch (state.kind) {
    case "ready":
    case "sign_up":
    case "link_ready":
    case "link_sign_up":
      return state.programName;
    default:
      return null;
  }
}

/**
 * Whether the signed-in account still needs a name before it joins.
 *
 * Joining writes the roster row from the profile and marks the account
 * onboarded, so onboarding's name step never runs afterwards: an account that
 * joins nameless stays nameless, and its roster row is named after its
 * address. The join page asks this before it shows a Join button and sends a
 * nameless account through the name step first.
 *
 * Fails toward "has a name". A read that errors must not trap someone in a
 * redirect; the worst case is the address-named row this exists to prevent.
 */
export async function sessionNeedsName(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data, error } = await supabase
    .from("users")
    .select("first_name")
    .eq("id", user.id)
    .maybeSingle();
  if (error || !data) return false;
  return !hasProfileName(data.first_name as string | null);
}

/**
 * The crest of the program a join token leads to, or null.
 *
 * The join screens draw the team mark above their heading, and a program that
 * uploaded a crest should see it there, not the initial that stands in for
 * one. Neither `JoinState` nor the link preview carries the crest, so this is
 * its own read: the token to its program — an invitation by the token's hash,
 * else a live join link by the token — then that program's `crest_path`.
 *
 * Service role, keyed on a token the caller already holds, and called only for
 * the states that already name the program on screen. A crest is a public
 * bucket object; nothing here reveals more than the heading beside it does.
 * Null on any miss: the initial is a complete mark on its own.
 */
export async function joinProgramCrestUrl(
  token: string,
): Promise<string | null> {
  const trimmed = token.trim();
  if (!trimmed) return null;

  const admin = createAdminClient();
  const [{ data: invite }, { data: link }] = await Promise.all([
    admin
      .from("program_invites")
      .select("program_id")
      .eq("token_hash", hashToken(trimmed))
      .maybeSingle(),
    admin
      .from("program_join_links")
      .select("program_id")
      .eq("token", trimmed)
      .is("revoked_at", null)
      .maybeSingle(),
  ]);

  // Invitation first, as `resolveJoinState` resolves them.
  const programId = (invite?.program_id ?? link?.program_id) as
    string | undefined;
  if (!programId) return null;

  const { data: program } = await admin
    .from("programs")
    .select("crest_path")
    .eq("id", programId)
    .maybeSingle();

  return crestUrl((program?.crest_path as string | null) ?? null);
}
