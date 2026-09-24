import { MATCH_VIDEO_ACTIVE_LIMIT } from "@/lib/match-video/limits";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Workspace } from "@/lib/workspace/types";

/**
 * How many match videos a workspace holds against its cap, and which ones —
 * what Settings › Usage lists for SwingVision video attachments.
 *
 * "Used" is defined in exactly one place: the row set
 * `match_video_workspace_active_attachments` returns in SQL
 * (`supabase/migrations/20260924120000_match_video_attachment_cap.sql`), which
 * is also what `match_video_reserve_upload` and
 * `match_video_activate_attachment` count before refusing an add with
 * `attachment_limit_reached`. This reads it through
 * `match_video_workspace_usage`, a service-role-only function that refuses a
 * caller who is not a member of the workspace — so `used` here is the same
 * number the upload routes enforce, and `cap` is the same constant they send.
 */

export interface MatchVideoUsageRow {
  attachmentId: string;
  matchId: string;
  /** Null once the uploader's account is deleted; the video stays. */
  uploadedBy: string | null;
  verifiedSizeBytes: number | null;
  /** ISO 8601. */
  activatedAt: string | null;
  /**
   * ISO 8601, or null when nobody has played it since view tracking began.
   * The retention clock is `lastViewedAt ?? activatedAt` — see
   * `lib/match-video/expiry.ts`.
   */
  lastViewedAt: string | null;
  player1Name: string | null;
  player2Name: string | null;
  /** ISO 8601 — `matches.date`. */
  matchDate: string | null;
}

export interface MatchVideoUsage {
  used: number;
  cap: number;
  /** Newest activation first. */
  rows: MatchVideoUsageRow[];
}

interface UsageRpcRow {
  attachment_id: string;
  match_id: string;
  uploaded_by: string | null;
  verified_size_bytes: number | string | null;
  activated_at: string | null;
  /** Absent until `20260924140000_match_video_last_viewed` is applied. */
  last_viewed_at?: string | null;
  player1_name: string | null;
  player2_name: string | null;
  match_date: string | null;
}

/**
 * The workspace's active match videos and its cap.
 *
 * The actor is the signed-in session, never a parameter: the SQL function
 * checks that THIS person belongs to the workspace, and taking the id from a
 * caller would let one page ask on another person's behalf. A signed-out
 * caller, or a failed read, gets an empty list with the real cap rather than
 * a thrown error — the page still renders, and says nothing false about
 * what the upload routes will allow.
 */
export async function getMatchVideoUsage(
  workspace: Pick<Workspace, "id" | "kind">,
): Promise<MatchVideoUsage> {
  const cap = MATCH_VIDEO_ACTIVE_LIMIT[workspace.kind];
  const empty: MatchVideoUsage = { used: 0, cap, rows: [] };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return empty;

  const { data, error } = await createAdminClient().rpc(
    "match_video_workspace_usage",
    {
      p_actor_id: user.id,
      p_workspace_kind: workspace.kind,
      p_workspace_id: workspace.id,
    },
  );
  if (error) {
    console.error("[match-video-usage] could not read workspace usage", {
      workspaceKind: workspace.kind,
      workspaceId: workspace.id,
      sqlstate: error.code,
      message: error.message,
      detail: error.details,
    });
    return empty;
  }

  const rows = ((data ?? []) as UsageRpcRow[]).map(
    (row): MatchVideoUsageRow => ({
      attachmentId: row.attachment_id,
      matchId: row.match_id,
      uploadedBy: row.uploaded_by,
      // bigint may arrive as a string past 2^53; a video never gets near it.
      verifiedSizeBytes:
        row.verified_size_bytes == null
          ? null
          : Number(row.verified_size_bytes),
      activatedAt: row.activated_at,
      lastViewedAt: row.last_viewed_at ?? null,
      player1Name: row.player1_name,
      player2Name: row.player2_name,
      matchDate: row.match_date,
    }),
  );

  return { used: rows.length, cap, rows };
}

/**
 * Display names for the uploaders `getMatchVideoUsage` returned — what
 * Settings › Usage's match-videos card labels each person's row with.
 *
 * `match_video_workspace_usage` returns ids, not names, so this is a second
 * batched read. Service role because `users` RLS does not let a coach read a
 * teammate's row; that is safe only because the ids come from the usage
 * function, which has already checked the caller belongs to the workspace —
 * never pass ids from anywhere else. A person with no name on file, or a
 * failed read, is simply absent from the map; the card has its own fallback.
 */
export async function getMatchVideoUploaderNames(
  userIds: readonly string[],
): Promise<Record<string, string>> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return {};

  const { data, error } = await createAdminClient()
    .from("users")
    .select("id, first_name, last_name")
    .in("id", ids);
  if (error) {
    console.error("[match-video-usage] could not read uploader names", {
      message: error.message,
    });
    return {};
  }

  const names: Record<string, string> = {};
  for (const row of (data ?? []) as {
    id: string;
    first_name: string | null;
    last_name: string | null;
  }[]) {
    const name = [row.first_name, row.last_name]
      .map((part) => part?.trim() ?? "")
      .filter(Boolean)
      .join(" ");
    if (name) names[row.id] = name;
  }
  return names;
}
