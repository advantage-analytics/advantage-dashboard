"use client";

import { useSearchParams } from "next/navigation";
import { parseReportView } from "@/components/dashboard/matches/match-detail/report-view";
import { MatchReportPending } from "./match-report-pending";

/**
 * The report's route skeleton: `[matchId]/layout.tsx`'s `<Suspense>` fallback
 * while the match loads, when its status hint says the page will draw the
 * report (an analysing match gets `AnalysisStepsPending` instead; the group
 * `(detail)/loading.tsx` stays neutral). The view is in the URL before the
 * match is loaded, so the skeleton can promise the right pane: a stats table
 * under a "Video" title would be a promise the page then breaks. `?cut=`
 * likewise picks the focused court over the wall.
 *
 * Separate from `match-report-pending.tsx` so that module stays free of
 * `next/navigation` and renders anywhere (the offline spec, a harness).
 */
export function MatchReportSkeleton() {
  const params = useSearchParams();
  const view = parseReportView(params.get("tab"));
  return <MatchReportPending view={view} focused={params.has("cut")} />;
}
