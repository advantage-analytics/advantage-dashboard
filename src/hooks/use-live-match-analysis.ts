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
  STATUS_MAP,
  type MatchAnalysis,
  pipelinePercent,
} from "@/lib/data/match-analysis";

/** The columns a live update can change. Everything else comes from the server render. */
interface LiveJobRow {
  match_id: string;
  status: string;
  upload_progress_percent: number | null;
  error_message: string | null;
  external_job_id: string | null;
  created_at: string;
}

export type LiveAnalysisPatch = Pick<
  MatchAnalysis,
  | "status"
  | "progressPercent"
  | "uploadPercent"
  | "failNote"
  | "jobReference"
  | "startedAt"
>;

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
  | { by: "match"; matchId: string };

export function useLiveMatchAnalysis(
  filter: LiveAnalysisFilter
): Map<string, LiveAnalysisPatch> {
  const [patches, setPatches] = useState<Map<string, LiveAnalysisPatch>>(
    () => new Map()
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
            filter: by === "user" ? `created_by=eq.${key}` : `match_id=eq.${key}`,
          },
          (payload) => {
            const row = payload.new as Partial<LiveJobRow> | null;
            if (!row?.match_id || !row.status) return;

            const status = STATUS_MAP[row.status];
            if (!status) {
              console.warn("[live-analysis] unmapped processing_jobs.status", {
                status: row.status,
              });
              return;
            }

            const uploadPercent =
              status === "uploading" && row.upload_progress_percent != null
                ? row.upload_progress_percent
                : undefined;

            setPatches((prev) => {
              const next = new Map(prev);
              next.set(row.match_id!, {
                status,
                progressPercent: pipelinePercent(status, uploadPercent),
                uploadPercent,
                // Without this the patch would blank the ETA's only input the
                // moment the first live event landed.
                startedAt: row.created_at,
                failNote: row.error_message ?? undefined,
                jobReference: row.external_job_id ?? undefined,
              });
              return next;
            });
          }
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
                `live until this page is reloaded`
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

/** Merge a live patch over the server-rendered analysis, if one has arrived. */
export function withLiveAnalysis(
  analysis: MatchAnalysis,
  patch: LiveAnalysisPatch | undefined
): MatchAnalysis {
  return patch ? { ...analysis, ...patch } : analysis;
}
