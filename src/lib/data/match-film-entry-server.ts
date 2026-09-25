/**
 * The Video view's capability, resolved on the server (plan step 14,
 * Film-entry half).
 *
 * `match-video-attachment-server.ts` answers "may this person open the wizard".
 * This file answers the question one step earlier: "what should the match page
 * DRAW" — which entries, and whether the view it drew is an offer or an error.
 * Both ask the same ladder, in the same order, from the same helper, because
 * the alternative is a page that offers a button its own route then refuses.
 *
 * ── Two questions, two audiences ────────────────────────────────────────────
 *
 * `authorizeMatchVideoMutation` (T8) decides the ACTIONS: sign-in, RLS
 * visibility, creator, SwingVision provenance, exact active workspace. A
 * teammate who can watch the match fails it and gets an empty list, which
 * draws nothing — not a disabled control, not a tooltip explaining what they
 * cannot do.
 *
 * The attachment STATE is read for anyone who passed visibility, the way
 * `playback.ts` reads it, because whether a video exists is not privileged and
 * the Video view has to tell a teammate the truth about it too.
 *
 * ── Why a failure is never an absence ───────────────────────────────────────
 *
 * Every path that could not establish the state returns `attachment: null` and
 * no `add`. A page that turned a failed read into "no video for this match"
 * would hand the creator an Add button over a row that is still active, and
 * the next thing in the container would be a duplicate of a file that is
 * already there. `playback.ts` refuses the same fold for the same reason; see
 * `lib/match-video/film-entry.ts` for the rule as a pure function.
 *
 * Dependency-injected ({@link FilmEntryDeps}) so the ladder runs in a spec with
 * no session, no database and no Azure.
 */

import { cache } from "react";

import {
  NO_FILM_ENTRY,
  type FilmEntryAction,
  type FilmEntryQuota,
  type MatchFilmEntry,
} from "@/lib/match-video/film-entry";
import type { MatchVideoResult } from "@/lib/match-video/types";
import {
  authorizeMatchVideoMutation,
  matchVideoAccessDeps,
  type MatchVideoAccessDeps,
} from "@/lib/services/match-video/access";
import type { HttpResult } from "@/lib/services/match-video/http";
import type { PlaybackAttachmentRow } from "@/lib/services/match-video/playback";
import { lazyAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import type { Workspace } from "@/lib/workspace/types";

import {
  getMatchVideoUsage,
  type MatchVideoUsage,
} from "./match-video-usage-server";
import { activeAttachment, finalObjectExists } from "./match-video-seams";

const LOG = "[match-film-entry]";

/**
 * {@link FilmEntryDeps.loadExpiredAt} over the real table. Service role —
 * `match_video_attachments` has no client-role policy — and reached only
 * below the visibility check in {@link resolveMatchFilmEntry}.
 *
 * The LATEST retired row decides, not the latest expired one: a video that
 * expired, was added again and then removed by hand was removed, not expired,
 * and "Nobody watched it for a year" would be false. Before
 * `20260925023035_match_video_remove_attachment` is applied the select names
 * a column that does not exist; PostgREST refuses it and this answers null.
 */
async function latestExpiredAt(matchId: string): Promise<string | null> {
  const { data, error } = await lazyAdminClient()
    .from("match_video_attachments")
    .select("retired_reason, retired_at")
    .eq("match_id", matchId)
    .eq("state", "retired")
    .order("retired_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error(`${LOG} could not read the latest retired attachment`, {
      matchId,
      sqlstate: error.code,
      message: error.message,
    });
    return null;
  }
  const row = data as {
    retired_reason: string | null;
    retired_at: string | null;
  } | null;
  return row?.retired_reason === "expired" ? row.retired_at : null;
}

/* -------------------------------------------------------------------------
 * Seams
 * ---------------------------------------------------------------------- */

/**
 * Both seams are borrowed from playback rather than restated, so "is there a
 * video" cannot be answered one way by the player and another by the actions
 * beside it. Neither can write: `loadActiveAttachment` selects, and
 * `finalObjectExists` is one `Get Blob Properties` that reads no bytes.
 */
export interface FilmEntryDeps extends MatchVideoAccessDeps {
  loadActiveAttachment(
    matchId: string,
  ): Promise<HttpResult<PlaybackAttachmentRow | null>>;
  finalObjectExists(
    row: PlaybackAttachmentRow,
  ): Promise<MatchVideoResult<boolean>>;
  /**
   * T4's `getMatchVideoUsage` — the same count the upload routes enforce.
   * Asked only for a viewer who may `add`, in the workspace the access
   * ladder validated.
   */
  loadUsage(
    workspace: Pick<Workspace, "id" | "kind">,
  ): Promise<MatchVideoUsage>;
  /**
   * When the match's video expired (T10), or null: the `retired_at` of its
   * latest retired row when that row's `retired_reason` is `'expired'`.
   * Asked only once the attachment read has said there is no active video.
   * Must not throw for a missing column — `retired_reason` arrives with a
   * migration that may not be applied yet — and a failure is null, never an
   * error: the plain empty state is the truthful fallback. Optional so a
   * harness that does not care about expiry need not supply it.
   */
  loadExpiredAt?(matchId: string): Promise<string | null>;
}

/** Storage could not be asked. Never `absent`, and never an `add`. */
const UNREADABLE: MatchFilmEntry = {
  attachment: null,
  actions: [],
  problem: "storage_unavailable",
  quota: null,
  expiredAt: null,
};

/**
 * The allowance the empty state prints, or null when it could not be read —
 * a missing count keeps the plain copy, and never blocks the page.
 *
 * `getMatchVideoUsage` already folds a failed read into "0 of cap"; the catch
 * here is for a seam that throws anyway. The holder is named only for a
 * personal workspace, whose one video is on exactly one other match; a team
 * is sent to Settings › Usage to choose.
 */
async function readQuota(
  workspace: Pick<Workspace, "id" | "kind">,
  deps: FilmEntryDeps,
): Promise<FilmEntryQuota | null> {
  let usage: MatchVideoUsage;
  try {
    usage = await deps.loadUsage(workspace);
  } catch (cause) {
    console.error(`${LOG} could not read match-video usage`, {
      workspaceKind: workspace.kind,
      cause,
    });
    return null;
  }
  const first = usage.rows[0];
  const holder =
    workspace.kind === "personal" && first
      ? {
          matchId: first.matchId,
          playerName: first.player1Name,
          opponentName: first.player2Name,
          date: first.matchDate,
        }
      : null;
  return { used: usage.used, cap: usage.cap, holder };
}

/**
 * {@link FilmEntryDeps.loadExpiredAt}, guarded: a throw or a missing seam is
 * null, so the expiry read can never take the Video view down with it.
 */
async function readExpiredAt(
  matchId: string,
  deps: FilmEntryDeps,
): Promise<string | null> {
  if (!deps.loadExpiredAt) return null;
  try {
    return await deps.loadExpiredAt(matchId);
  } catch (cause) {
    console.error(`${LOG} could not read the expired attachment`, {
      matchId,
      cause,
    });
    return null;
  }
}

/* -------------------------------------------------------------------------
 * The ladder
 * ---------------------------------------------------------------------- */

/**
 * Resolve one match's Film-entry capability.
 *
 * The refusal codes are read rather than collapsed, because they mean
 * different things to this page:
 *
 *   unauthenticated / match_not_found  nothing to say about a match the caller
 *                                      cannot see — and the detail page has
 *                                      already 404'd by the time this matters
 *   storage_unavailable                the `matches` read itself failed; the
 *                                      state is unknown, so it is an error
 *   forbidden / workspace_mismatch     visible, not theirs to change: read the
 *                                      state, offer nothing
 */
export async function resolveMatchFilmEntry(
  matchId: string,
  deps: FilmEntryDeps,
): Promise<MatchFilmEntry> {
  const access = await authorizeMatchVideoMutation(matchId, deps);
  if (!access.ok) {
    const { code } = access.error;
    if (code === "unauthenticated" || code === "match_not_found") {
      return NO_FILM_ENTRY;
    }
    if (code === "storage_unavailable") return UNREADABLE;
  }
  // `authorizeMatchVisibility` ran inside the call above and validated the id
  // before any read, so a refusal that got this far is about the PERSON.
  const mayMutate = access.ok;
  const id = access.ok ? access.value.match.id : matchId;

  let loaded: HttpResult<PlaybackAttachmentRow | null>;
  try {
    loaded = await deps.loadActiveAttachment(id);
  } catch (cause) {
    console.error(`${LOG} unhandled attachment read failure`, {
      matchId: id,
      cause,
    });
    return UNREADABLE;
  }
  if (!loaded.ok) {
    console.error(`${LOG} could not read the active attachment`, {
      matchId: id,
      detail: loaded.error.detail,
    });
    return UNREADABLE;
  }

  const row = loaded.value;
  if (!row) {
    // The one branch that may offer an add, and it is reached only by having
    // actually read the state and been told there is nothing attached.
    // Whether the last video expired is not privileged either: a teammate
    // is told the truth about it too, without the offer.
    if (!access.ok) {
      const expiredAt = await readExpiredAt(id, deps);
      return {
        attachment: "absent",
        actions: [],
        problem: null,
        quota: null,
        expiredAt,
      };
    }
    const actions: FilmEntryAction[] = ["add"];
    const [quota, expiredAt] = await Promise.all([
      readQuota(access.value.workspace, deps),
      readExpiredAt(id, deps),
    ]);
    return { attachment: "absent", actions, problem: null, quota, expiredAt };
  }

  // Replace and adjust are the repairs for everything below, so they survive a
  // storage problem: neither can create a second attachment — each sends the
  // row it expects and T3's unique index arbitrates it.
  const actions: FilmEntryAction[] = mayMutate ? ["replace", "align"] : [];
  const present = (problem: MatchFilmEntry["problem"]): MatchFilmEntry => ({
    attachment: "present",
    actions,
    problem,
    quota: null,
    expiredAt: null,
  });

  let exists: MatchVideoResult<boolean>;
  try {
    exists = await deps.finalObjectExists(row);
  } catch (cause) {
    console.error(`${LOG} unhandled storage probe failure`, {
      matchId: id,
      attachmentId: row.id,
      cause,
    });
    return present("storage_unavailable");
  }
  if (!exists.ok) {
    console.error(`${LOG} storage unreachable — ${exists.error.detail}`, {
      matchId: id,
      attachmentId: row.id,
    });
    return present("storage_unavailable");
  }
  if (!exists.value) {
    console.error(`${LOG} active attachment has no final object`, {
      matchId: id,
      attachmentId: row.id,
    });
    return present("stale_attachment");
  }

  return present(null);
}

/* -------------------------------------------------------------------------
 * Production wiring
 * ---------------------------------------------------------------------- */

/**
 * The real seams. `cache()`d for the same reason `getMatchDetailData` is: the
 * layout and the page are one request, and a capability asked twice is two
 * round trips for one answer.
 *
 * The admin client is built lazily, so a visit refused above
 * the attachment read — every access check runs first — never constructs a
 * service-role client at all.
 */
export const getMatchFilmEntry = cache(async function getMatchFilmEntry(
  matchId: string,
): Promise<MatchFilmEntry> {
  const supabase = await createClient();

  return resolveMatchFilmEntry(matchId, {
    ...matchVideoAccessDeps({
      supabase,
      workspaceContext: getWorkspaceContext,
    }),
    loadActiveAttachment: activeAttachment,
    finalObjectExists,
    loadUsage: getMatchVideoUsage,
    loadExpiredAt: latestExpiredAt,
  });
});
