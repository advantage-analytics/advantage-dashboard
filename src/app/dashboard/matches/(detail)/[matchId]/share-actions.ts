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
 * stays dead once it has been turned off.
 */

import { revalidatePath } from "next/cache";
import { requireWorkspaceContext } from "@/lib/data/action-context";
import { matchShareUrl } from "@/lib/data/match-share-server";
import { generateToken } from "@/lib/services/programs/tokens";

export type ShareActionResult =
  | { ok: true; url: string | null }
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
    .insert({ match_id: matchId, token, created_by: viewerId });

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      // Already on — two tabs, or a double click. Hand back the link that
      // exists rather than failing the toggle.
      const { data } = await supabase
        .from("match_share_links")
        .select("token")
        .eq("match_id", matchId)
        .maybeSingle();
      if (data?.token) {
        return { ok: true, url: matchShareUrl(data.token as string) };
      }
    }
    return { ok: false, error: "forbidden" };
  }

  revalidatePath(MATCH_REPORT_PATH_PATTERN, "page");
  return { ok: true, url: matchShareUrl(token) };
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
  return { ok: true, url: null };
}
