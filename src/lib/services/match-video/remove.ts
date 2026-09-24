/**
 * Removing a PUBLISHED match video (SwingVision Add video T5).
 *
 *   DELETE /api/matches/[matchId]/video      body: { "attachmentId": "<uuid>" }
 *
 * ORDER, and why each step sits where it does:
 *
 *   1. same-origin   stateless; a cross-site request touches nothing
 *   2. sign-in       an anonymous caller never reaches the database
 *   3. body          bounded JSON, EXACTLY `{ attachmentId }` — pure, so a
 *                    malformed request costs no read
 *   4. visibility    the match through the caller's own client (RLS), so a
 *                    stranger or a coach of another program gets a 404
 *   5. removal       the caller uploaded this attachment, or is an owner or
 *                    coach of the match's program (`authorizeMatchVideoRemoval`)
 *   6. retire        `match_video_remove_attachment`, which rechecks 5 under
 *                    the row locks and retires the row with
 *                    `retired_reason = 'removed'`, due for cleanup now
 *   7. cleanup       {@link requestBestEffortCleanup}, scheduled for after the
 *                    response — the same worker the cron runs, so the bytes
 *                    go now if they can and on the next sweep if they cannot
 *
 * 4 and 5 are {@link authorizeMatchVideoRemoval}; neither is
 * `authorizeMatchVideoMutation`, which is creator-only and would refuse the
 * coach this endpoint exists for.
 *
 * NO BLOB IS DELETED HERE. The route retires the record; the worker, which
 * already knows how to abort an in-flight copy and to keep the keys on a
 * failed delete, takes the objects. A removal whose cleanup never runs (the
 * process dies after the response) is collected by the daily sweep, because
 * the row is retired and due.
 *
 * Idempotent: a second DELETE for the same attachment answers 200 with the
 * row as it stands. The match, its points, shots and stats are never written.
 *
 * Injected (`RemoveAttachmentDeps`) so the handler spec can prove a refused
 * request never reached the RPC or the worker.
 */

import type { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  matchVideoError,
  ok,
  type MatchVideoError,
} from "@/lib/match-video/types";

import {
  authorizeMatchVideoRemoval,
  type MatchVideoRemovalAccess,
  type MatchVideoRemovalAccessDeps,
} from "./access";
import {
  requestBestEffortCleanup,
  type CleanupDeps,
  type CleanupRunSummary,
} from "./cleanup";
import {
  checkSameOrigin,
  errorResponse,
  invalidRequest,
  isPlainObject,
  jsonResponse,
  readBoundedJson,
  transportError,
  type HttpResult,
  type MatchVideoHttpError,
} from "./http";
import { matchVideoRpcError } from "./rpc-errors";

const LOG = "[match-video-remove]";

/* -------------------------------------------------------------------------
 * Contract
 * ---------------------------------------------------------------------- */

export interface RemoveAttachmentRequest {
  attachmentId: string;
}

/** Why a row is retired, when it is not a replacement or a cancellation. */
export type RetiredReason = "removed" | "expired";

export interface RemoveAttachmentResult {
  attachmentId: string;
  state: "retired";
  /**
   * `removed` for this removal (and a repeat of it). A row that was already
   * retired some other way keeps what it had — null for a replacement.
   */
  retiredReason: RetiredReason | null;
}

/**
 * The refusal copy for this endpoint. `forbidden`'s default sentence ("Only
 * the person who added this match…") is the rule for every OTHER video write
 * and is wrong here, where a coach may remove a player's upload.
 */
const REMOVAL_FORBIDDEN_MESSAGE =
  "Only the person who uploaded this video, or a team owner or coach, can remove it.";

function removalError<E extends MatchVideoError | MatchVideoHttpError>(
  error: E,
): E {
  return error.code === "forbidden"
    ? { ...error, message: REMOVAL_FORBIDDEN_MESSAGE }
    : error;
}

/**
 * Exactly `{ attachmentId }`. Any other key is refused by name, like every
 * other attachment body, so a client that starts sending `matchId` or
 * `userId` learns on its first request that the server owns those.
 */
export function parseRemoveAttachmentBody(
  value: unknown,
): HttpResult<RemoveAttachmentRequest> {
  if (!isPlainObject(value)) return invalidRequest("body_not_object");
  for (const key of Object.keys(value)) {
    if (key !== "attachmentId")
      return invalidRequest(`unexpected_field:${key}`);
  }
  if (typeof value.attachmentId !== "string") {
    return invalidRequest("attachment_id_type");
  }
  return ok({ attachmentId: value.attachmentId });
}

/* -------------------------------------------------------------------------
 * Deps
 * ---------------------------------------------------------------------- */

export interface RemovedAttachment {
  id: string;
  state: string;
  retired_reason: string | null;
}

export interface RemoveAttachmentDeps extends MatchVideoRemovalAccessDeps {
  allowedOrigins?: readonly string[];
  /** `match_video_remove_attachment`. The only privileged write on this path. */
  remove(
    access: MatchVideoRemovalAccess,
  ): Promise<HttpResult<RemovedAttachment>>;
  /** The cleanup worker's seams — the same ones the cron uses. */
  readonly cleanup: CleanupDeps;
  /**
   * Runs `task` after the response (production: `after()` from
   * `next/server`). Resolves once scheduled, not once run.
   */
  schedule(task: () => Promise<void>): Promise<void>;
}

/* -------------------------------------------------------------------------
 * Handler
 * ---------------------------------------------------------------------- */

export async function handleRemoveAttachment(
  request: Request,
  matchId: string,
  deps: RemoveAttachmentDeps,
): Promise<NextResponse> {
  const origin = checkSameOrigin(request, deps.allowedOrigins);
  if (origin) return errorResponse(origin);

  if (!(await deps.currentUserId())) {
    return errorResponse(matchVideoError("unauthenticated", "no_session"));
  }

  const raw = await readBoundedJson(request);
  if (!raw.ok) return errorResponse(raw.error);
  const body = parseRemoveAttachmentBody(raw.value);
  if (!body.ok) return errorResponse(body.error);

  const access = await authorizeMatchVideoRemoval(
    matchId,
    body.value.attachmentId,
    deps,
  );
  if (!access.ok) {
    console.log(`${LOG} removal refused — ${access.error.detail}`, {
      matchId,
    });
    return errorResponse(removalError(access.error));
  }

  const removed = await deps.remove(access.value);
  if (!removed.ok) {
    console.log(`${LOG} removal refused — ${removed.error.detail}`, {
      matchId,
      attachmentId: access.value.attachmentId,
    });
    return errorResponse(removalError(removed.error));
  }

  if (removed.value.state !== "retired") {
    console.error(`${LOG} removal returned an unexpected state`, {
      matchId,
      attachmentId: removed.value.id,
      state: removed.value.state,
    });
    return errorResponse(transportError("internal_error", "rpc_state"));
  }

  console.log(`${LOG} removed`, {
    matchId,
    attachmentId: removed.value.id,
    basis: access.value.basis,
    retiredReason: removed.value.retired_reason,
  });

  // Best effort, after the response. Also on a repeat: a retry is a free
  // second chance at a row whose first cleanup could not run.
  const attachmentId = removed.value.id;
  try {
    await deps.schedule(async () => {
      const summary = await requestBestEffortCleanup(deps.cleanup, {
        reason: `remove:${matchId}`,
      });
      console.log(`${LOG} post-removal cleanup`, {
        matchId,
        attachmentId,
        ...describeRemovalCleanup(attachmentId, summary),
      });
    });
  } catch (cause) {
    // The row is retired and due; the daily sweep takes it. Never fail the
    // removal for a cleanup that could not even be scheduled.
    console.error(`${LOG} could not schedule cleanup`, {
      matchId,
      attachmentId,
      message: cause instanceof Error ? cause.message : String(cause),
    });
  }

  const reason = removed.value.retired_reason;
  const result: RemoveAttachmentResult = {
    attachmentId,
    state: "retired",
    retiredReason: reason === "removed" || reason === "expired" ? reason : null,
  };
  return jsonResponse(result, 200);
}

function describeRemovalCleanup(
  attachmentId: string,
  summary: CleanupRunSummary,
): { outcome: string; claimError?: string } {
  const row = summary.rows.find((r) => r.attachmentId === attachmentId);
  return {
    outcome: row?.outcome ?? "deferred",
    ...(summary.claimError ? { claimError: summary.claimError.detail } : {}),
  };
}

/* -------------------------------------------------------------------------
 * Production wiring
 * ---------------------------------------------------------------------- */

interface RemoveRpcRow {
  attachment_id: string;
  state: string;
  retired_reason: string | null;
}

/** `remove` over the real RPC, through the service-role client. */
export function rpcRemoveAttachment(
  admin: SupabaseClient,
): RemoveAttachmentDeps["remove"] {
  return async (access) => {
    const { data, error } = await admin.rpc("match_video_remove_attachment", {
      p_actor_id: access.actor.id,
      p_match_id: access.match.id,
      p_attachment_id: access.attachmentId,
    });

    if (error) {
      const mapped = matchVideoRpcError(error);
      if (mapped) return { ok: false, error: mapped };
      console.error(`${LOG} removal RPC failed`, {
        matchId: access.match.id,
        attachmentId: access.attachmentId,
        sqlstate: error.code,
        message: error.message,
      });
      return {
        ok: false,
        error: transportError(
          "internal_error",
          `rpc_${error.code || "unknown"}`,
        ),
      };
    }

    const row = (Array.isArray(data) ? data[0] : data) as
      RemoveRpcRow | undefined;
    if (!row) {
      console.error(`${LOG} removal RPC returned no row`, {
        matchId: access.match.id,
        attachmentId: access.attachmentId,
      });
      return {
        ok: false,
        error: transportError("internal_error", "rpc_empty"),
      };
    }

    return ok<RemovedAttachment>({
      id: row.attachment_id,
      state: row.state,
      retired_reason: row.retired_reason,
    });
  };
}

/**
 * `after()` from `next/server`, so the worker runs once the response is sent.
 * Outside a request scope `after` throws and the task runs inline — the same
 * bounded worker, harmless either way.
 */
export async function scheduleAfterResponse(
  task: () => Promise<void>,
): Promise<void> {
  try {
    const { after } = await import("next/server");
    after(task);
  } catch (cause) {
    console.warn(`${LOG} no request scope — running cleanup inline`, {
      message: cause instanceof Error ? cause.message : String(cause),
    });
    await task();
  }
}
