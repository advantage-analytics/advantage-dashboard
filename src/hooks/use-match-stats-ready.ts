"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/** How long before a still-running import is called slow. Not a failure. */
const SLOW_AFTER_MS = 60_000;
/** A dropped socket must not strand the screen: re-check this often. */
const RECHECK_EVERY_MS = 10_000;
/** Once the stats exist, how often to look for the review. */
const REVIEW_POLL_MS = 3_000;
/**
 * How long past the stats to wait for the review. It takes 15–25s and
 * `process-match` swallows its failure, so nothing ever says it is not coming:
 * past this, the match is ready without it.
 */
const REVIEW_CAP_MS = 35_000;

export type MatchStatsState = "waiting" | "slow" | "ready";

/**
 * Whether an imported match is ready: its statistics AND its Advantage
 * Intelligence review have landed.
 *
 * Stats first. `process-match` runs `calculate_match_stats`, which writes the
 * match's `match_stats` rows. Nothing else records it — the edge function
 * writes no status column and no job — so the rows appearing IS the signal.
 * Same detection Home's recent-activity toast uses: a Realtime INSERT on
 * `match_stats`, plus an existence check once subscribed (processing can finish
 * before the channel opens) and on an interval (a dropped socket delivers
 * nothing and says nothing).
 *
 * Then the review, which `process-match` requests after the stats. Calling the
 * match ready on the stats alone sent people to a report whose review was still
 * being written; the page never re-reads it, so it was missing until a reload.
 * Polled rather than subscribed — `matches.insights` is one column read — and
 * capped at REVIEW_CAP_MS, since a failed review leaves no trace to wait on.
 *
 * It never reports failure, because there is no record of one to read. After a
 * minute it reports `slow`, and keeps listening.
 */
export function useMatchStatsReady(matchId: string | null): MatchStatsState {
  const [state, setState] = useState<{
    matchId: string | null;
    value: MatchStatsState;
  }>({ matchId, value: "waiting" });

  useEffect(() => {
    if (!matchId) return;
    const supabase = createClient();
    let settled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let interval: ReturnType<typeof setInterval> | undefined;
    let slow: ReturnType<typeof setTimeout> | undefined;
    let review: ReturnType<typeof setInterval> | undefined;
    let reviewCap: ReturnType<typeof setTimeout> | undefined;
    let statsLanded = false;

    // Stops the socket and both timers: once ready there is nothing left to
    // learn, and the success screen can sit open for a long time.
    const stop = () => {
      settled = true;
      clearInterval(interval);
      clearTimeout(slow);
      clearInterval(review);
      clearTimeout(reviewCap);
      if (channel) void supabase.removeChannel(channel);
      channel = null;
    };

    const finish = () => {
      if (settled) return;
      stop();
      setState({ matchId, value: "ready" });
    };

    const reviewExists = async () => {
      const { data } = await supabase
        .from("matches")
        .select("insights")
        .eq("id", matchId)
        .maybeSingle();
      return data?.insights != null;
    };

    const checkReview = async () => {
      if (!settled && (await reviewExists())) finish();
    };

    // The stats are in: stop watching for them and start on the review.
    const onStats = () => {
      if (settled || statsLanded) return;
      statsLanded = true;
      clearInterval(interval);
      if (channel) void supabase.removeChannel(channel);
      channel = null;
      void checkReview();
      review = setInterval(checkReview, REVIEW_POLL_MS);
      reviewCap = setTimeout(finish, REVIEW_CAP_MS);
    };

    const statsExist = async () => {
      const { data } = await supabase
        .from("match_stats")
        .select("id")
        .eq("match_id", matchId)
        .limit(1);
      return Boolean(data && data.length > 0);
    };

    const check = async () => {
      if (!settled && !statsLanded && (await statsExist())) onStats();
    };

    (async () => {
      // `match_stats` is RLS-protected and supabase-js does not push the
      // session token to the socket on its own; without this the channel joins
      // as anon and silently receives nothing.
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.access_token) {
        await supabase.realtime.setAuth(session.access_token);
      }
      if (settled || statsLanded) return;

      channel = supabase
        .channel(`match-stats-ready:${matchId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "match_stats",
            filter: `match_id=eq.${matchId}`,
          },
          onStats,
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED") void check();
        });
    })();

    interval = setInterval(check, RECHECK_EVERY_MS);
    slow = setTimeout(() => {
      if (!settled) setState({ matchId, value: "slow" });
    }, SLOW_AFTER_MS);

    return stop;
  }, [matchId]);

  // A different match starts over at "waiting" without an effect-time reset.
  return state.matchId === matchId ? state.value : "waiting";
}
