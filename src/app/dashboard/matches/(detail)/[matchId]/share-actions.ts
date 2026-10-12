"use server";

/**
 * Turning a match's public link on and off, from the Share popover.
 *
 * Same shape as `saved-views-actions.ts`: the caller's session comes from
 * `requireWorkspaceContext()`, never from the client, and every write goes
 * through the cookie-authenticated client so `public.match_share_links` RLS
 * (`can_share_match`: uploader, either seated player, program staff) is the
 * authorization boundary. A refused insert or delete is reported as
 * `forbidden` rather than re-deriving the policy here.
 *
 * Off then on mints a NEW token: `disableMatchShare` deletes the row and
 * `enableMatchShare` inserts a fresh one, so a link that was once handed out
 * stays dead once it has been turned off. What the link carries is the one
 * thing edited in place (`setMatchShareVisualizations`), for the same reason:
 * the link is already in someone's inbox.
 */

import { revalidatePath } from "next/cache";
import { requireWorkspaceContext } from "@/lib/data/action-context";
import { matchShareUrl } from "@/lib/data/match-share-server";
import { generateToken } from "@/lib/services/programs/tokens";

export type ShareActionResult =
  | { ok: true; url: string | null; includesVisualizations: boolean }
  | { ok: false; error: "forbidden" | "failed" };

// The route group stays in the pattern — see `saved-views-actions.ts`.
const MATCH_REPORT_PATH_PATTERN = "/dashboard/matches/(detail)/[matchId]";

const UNIQUE_VIOLATION = "23505";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function enableMatchShare(
  matchId: string,
): Promise<ShareActionResult> {
  if (!UUID.test(matchId)) return { ok: false, error: "forbidden" };
  const ctx = await requireWorkspaceContext();
  if (!ctx) return { ok: false, error: "forbidden" };
  const { supabase, viewerId } = ctx;

  const token = generateToken();
  const { error } = await supabase
    .from("match_share_links")
    // A new link carries the Visualizations view unless its maker turns that
    // off; the column's own default (false) is for the links that predate it.
    .insert({
      match_id: matchId,
      token,
      created_by: viewerId,
      include_visualizations: true,
    });

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      // Already on — two tabs, or a double click. Hand back the link that
      // exists rather than failing the toggle.
      const { data } = await supabase
        .from("match_share_links")
        .select("token, include_visualizations")
        .eq("match_id", matchId)
        .maybeSingle();
      if (data?.token) {
        return {
          ok: true,
          url: matchShareUrl(data.token as string),
          includesVisualizations: data.include_visualizations === true,
        };
      }
    }
    return { ok: false, error: "forbidden" };
  }

  revalidatePath(MATCH_REPORT_PATH_PATTERN, "page");
  return { ok: true, url: matchShareUrl(token), includesVisualizations: true };
}

/**
 * Put the Visualizations view on the match's public link, or take it off.
 * The token does not change. `authenticated` may update this one column and
 * nothing else on the row; a viewer who may not share updates no row, which
 * reads back as `forbidden` — as does a match with no link to change.
 */
export async function setMatchShareVisualizations(
  matchId: string,
  include: boolean,
): Promise<ShareActionResult> {
  if (!UUID.test(matchId)) return { ok: false, error: "forbidden" };
  const ctx = await requireWorkspaceContext();
  if (!ctx) return { ok: false, error: "forbidden" };
  const { supabase } = ctx;

  const { data, error } = await supabase
    .from("match_share_links")
    .update({ include_visualizations: include === true })
    .eq("match_id", matchId)
    .select("token, include_visualizations")
    .maybeSingle();
  if (error) return { ok: false, error: "failed" };
  if (!data?.token) return { ok: false, error: "forbidden" };

  revalidatePath(MATCH_REPORT_PATH_PATTERN, "page");
  return {
    ok: true,
    url: matchShareUrl(data.token as string),
    includesVisualizations: data.include_visualizations === true,
  };
}

export async function disableMatchShare(
  matchId: string,
): Promise<ShareActionResult> {
  if (!UUID.test(matchId)) return { ok: false, error: "forbidden" };
  const ctx = await requireWorkspaceContext();
  if (!ctx) return { ok: false, error: "forbidden" };
  const { supabase } = ctx;

  const { error } = await supabase
    .from("match_share_links")
    .delete()
    .eq("match_id", matchId);
  if (error) return { ok: false, error: "forbidden" };

  revalidatePath(MATCH_REPORT_PATH_PATTERN, "page");
  return { ok: true, url: null, includesVisualizations: false };
}
