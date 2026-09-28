"use client";

/**
 * Follow the caller's own processing jobs live.
 *
 * The matches list and match detail page render server-side with no
 * revalidation, so their progress bars were snapshots from page load. A 39-minute
 * upload showed nothing at all unless the user refreshed by hand.
 *
 * This returns overrides keyed by match id, to be merged over the server-rendered
 * analysis. It never fetches an initial state — the server already did that, and
 * refetching would trade a fast first paint for a duplicate query.
 *
 * One channel covers the whole lifecycle. The browser writes upload progress to
 * `processing_jobs`, and so do the submit route and the results webhook, so the
 * same subscription carries uploading → uploaded → queued → processing →
 * completed without a second connection.
 */

import { useEffect, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/client";
import {
  type MatchAnalysis,
  type RecoveryFacts,
  isInputRejected,
  jobRecoveryFacts,
  pipelinePercent,
  recoveryFields,
  resolveAnalysisStatus,
} from "@/lib/data/match-analysis";

/** The columns a live update can change. Everything else comes from the server render. */
export interface LiveJobRow {
  /** `processing_jobs.id` — tells a resubmission apart from the server-rendered job. */
  id: string;
  match_id: string;
  status: string;
  upload_progress_percent: number | null;
  error_message: string | null;
  /**
   * The vendor's failure class. On the wire for the same reason as
   * `derivation_version` below; `invalid_input` means the video was refused.
   */
  error_category: string | null;
  external_job_id: string | null;
  created_at: string;
  /**
   * Already on the wire without asking: under default replica identity the
   * UPDATE payload carries the whole NEW row, so this needs declaring rather
   * than fetching.
   */
  derivation_version: string | null;
  /** When the row last moved — the stall clock for `isSubmitStalled`. */
  updated_at: string | null;
  error_code: string | null;
  error_step: string | null;
  /**
   * On the wire because the payload is the whole row. Read only to become the
   * `hasVideo` / `hasResults` recovery inputs; never stored on a patch.
   */
  video_object_key: string | null;
  results_object_key: string | null;
  /** Set on a resubmission — the one chain fact a realtime row carries. */
  resubmitted_from_job_id: string | null;
}

/**
 * What `withLiveAnalysis` needs to re-decide `recovery` against the base
 * analysis's chain count. Booleans and codes only — no storage key.
 */
export interface LiveRecoveryBasis {
  /** The live row's job id, compared with the base analysis's `jobId`. */
  jobId: string | undefined;
  /** The live row is a resubmission (`resubmitted_from_job_id` set). */
  resubmitted: boolean;
  facts: RecoveryFacts;
  errorMessage: string | null;
}

export type LiveAnalysisPatch = Pick<
  MatchAnalysis,
  | "status"
  | "progressPercent"
  | "uploadPercent"
  | "failNote"
  | "inputRejected"
  | "recovery"
  | "note"
  | "errorCode"
  | "jobReference"
  | "startedAt"
> & {
  /**
   * Consumed by `withLiveAnalysis` and never merged onto the analysis. Absent
   * on a projection that is not a live patch (the activity tray's server item).
   */
  recoveryBasis?: LiveRecoveryBasis;
};

/**
 * Project one realtime `processing_jobs` row onto the fields a live update may
 * override. Pure, and exported so it can be tested without a socket.
 *
 * Returns undefined for a status the UI has no word for; the caller warns and
 * skips. `inputRejected` is set on EVERY patch, not only failed ones, so a
 * later non-failed row (a resubmission) resets it to false rather than leaving
 * the previous refusal merged over the server render.
 */
export function liveAnalysisPatch(
  row: Pick<LiveJobRow, "status"> & Partial<LiveJobRow>,
  attemptsUsed: number = 1,
  nowMs: number = Date.now(),
): LiveAnalysisPatch | undefined {
  const status = resolveAnalysisStatus(row.status, row.derivation_version);
  if (!status) return undefined;

  const uploadPercent =
    status === "uploading" && row.upload_progress_percent != null
      ? row.upload_progress_percent
      : undefined;

  // The same projection the server loader uses. The keys become booleans here
  // and are not stored.
  const facts = jobRecoveryFacts(
    {
      ...row,
      hasVideo: row.video_object_key != null,
      hasResults: row.results_object_key != null,
    },
    nowMs,
  );
  const errorMessage = row.error_message ?? null;

  return {
    status,
    progressPercent: pipelinePercent(status, uploadPercent),
    uploadPercent,
    // Without this the patch would blank the ETA's only input the moment the
    // first live event landed.
    startedAt: row.created_at,
    failNote: row.error_message ?? undefined,
    inputRejected: isInputRejected(row.status, row.error_category),
    // Decided with `attemptsUsed` (default 1) so the patch reads correctly on
    // its own; `withLiveAnalysis` re-decides it against the base chain count.
    ...recoveryFields(facts, attemptsUsed, errorMessage),
    jobReference: row.external_job_id ?? undefined,
    recoveryBasis: {
      jobId: row.id,
      resubmitted: row.resubmitted_from_job_id != null,
      facts,
      errorMessage,
    },
  };
}

/**
 * What to follow.
 *
 * Both are narrowed server-side so the socket does not carry rows the client
 * would only discard. RLS scopes either one to the caller's own jobs regardless,
 * so `match` is not a weaker guarantee than `user` — just a narrower one, which
 * is what a single match's page wants.
 */
export type LiveAnalysisFilter =
  | { by: "user"; userId: string | undefined }
  // Undefined for the same reason `userId` is: it is how a caller says "there is
  // nothing worth following here", and the effect below skips the channel
  // entirely rather than joining one no event will ever arrive on.
  | { by: "match"; matchId: string | undefined };

export function useLiveMatchAnalysis(
  filter: LiveAnalysisFilter,
): Map<string, LiveAnalysisPatch> {
  const [patches, setPatches] = useState<Map<string, LiveAnalysisPatch>>(
    () => new Map(),
  );

  // Primitives, so the effect keys off the value rather than the object
  // identity of a filter literal rebuilt on every render.
  const by = filter.by;
  const key = filter.by === "user" ? filter.userId : filter.matchId;

  useEffect(() => {
    if (!key) return;

    const supabase = createClient();
    let channel: RealtimeChannel | undefined;
    let cancelled = false;

    (async () => {
      // Authenticate the socket BEFORE subscribing. supabase-js stores the token
      // but does not proactively push it to the socket, so a channel can join as
      // anon — RLS then delivers zero postgres_changes and the subscription
      // "succeeds" while no event ever arrives. This is the failure mode
      // recent-activity.tsx documents; it costs an hour to diagnose.
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.access_token) {
        await supabase.realtime.setAuth(session.access_token);
      }
      if (cancelled) return;

      channel = supabase
        .channel(`processing-jobs:${by}:${key}`)
        .on(
          "postgres_changes",
          {
            // UPDATE only, not "*".
            //
            // Every transition this renders is an UPDATE — the row is inserted
            // by the wizard before any of it happens, and the page that shows it
            // was server-rendered after that. DELETE would be actively wrong to
            // subscribe to: Supabase only delivers filtered DELETE events when
            // the table's replica identity is FULL, and this table's is default,
            // so those events would arrive unfiltered and be discarded here.
            event: "UPDATE",
            schema: "public",
            table: "processing_jobs",
            // Filtered on a NEW-record column, for the same reason: under
            // default replica identity `old` carries only the primary key, so a
            // filter evaluated against it would match nothing.
            filter:
              by === "user" ? `created_by=eq.${key}` : `match_id=eq.${key}`,
          },
          (payload) => {
            const row = payload.new as Partial<LiveJobRow> | null;
            if (!row?.match_id || !row.status) return;

            const patch = liveAnalysisPatch({ ...row, status: row.status });
            if (!patch) {
              console.warn("[live-analysis] unmapped processing_jobs.status", {
                status: row.status,
              });
              return;
            }

            setPatches((prev) => {
              const next = new Map(prev);
              next.set(row.match_id!, patch);
              return next;
            });
          },
        )
        .subscribe((status) => {
          // A channel that fails to join is silent by default: no error, no
          // events, a progress bar that simply never moves. Both ways that
          // happens here are invisible — a missing setAuth joins as anon and RLS
          // delivers nothing, and a table absent from the supabase_realtime
          // publication produces a subscription that succeeds and carries no
          // rows. Say so rather than degrading quietly.
          if (status === "SUBSCRIBED") {
            console.log("[live-analysis] following processing_jobs");
            return;
          }
          if (
            status === "CHANNEL_ERROR" ||
            status === "TIMED_OUT" ||
            status === "CLOSED"
          ) {
            console.warn(
              `[live-analysis] subscription ${status} — progress will not update ` +
                `live until this page is reloaded`,
            );
          }
        });
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [by, key]);

  return patches;
}

/**
 * Merge a live patch over the server-rendered analysis, if one has arrived.
 *
 * Generic over anything carrying at least the patchable fields, so a caller
 * that serializes a narrower projection than the full `MatchAnalysis` — the
 * header activity tray reads four of its fields, not eleven — can still use
 * this rather than hand-rolling the same spread.
 *
 * A realtime row carries no chain, so `recovery` is re-decided here from the
 * base analysis's `attemptsUsed` — plus one when the live row is a different
 * job that was resubmitted from another (a retry the server render predates).
 */
export function withLiveAnalysis<
  T extends Omit<LiveAnalysisPatch, "recoveryBasis"> &
    Pick<MatchAnalysis, "jobId" | "attemptsUsed">,
>(analysis: T, patch: LiveAnalysisPatch | undefined): T {
  if (!patch) return analysis;
  const { recoveryBasis, ...fields } = patch;
  if (!recoveryBasis) return { ...analysis, ...fields };

  const base = analysis.attemptsUsed ?? 1;
  const attemptsUsed =
    recoveryBasis.resubmitted && recoveryBasis.jobId !== analysis.jobId
      ? base + 1
      : base;

  return {
    ...analysis,
    ...fields,
    attemptsUsed,
    ...recoveryFields(
      recoveryBasis.facts,
      attemptsUsed,
      recoveryBasis.errorMessage,
    ),
  };
}
