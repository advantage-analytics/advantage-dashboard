"use client";

import { useSearchParams } from "next/navigation";
import { parseReportView } from "@/components/dashboard/matches/match-detail/report-view";
import { MatchReportPending } from "./match-report-pending";

/**
 * `(detail)/loading.tsx`'s body. The view is in the URL before the match is
 * loaded, so the skeleton can promise the right pane: a stats table under a
 * "Video" title would be a promise the page then breaks. `?cut=` likewise
 * picks the focused court over the wall.
 *
 * Separate from `match-report-pending.tsx` so that module stays free of
 * `next/navigation` and renders anywhere (the offline spec, a harness).
 */
export function MatchReportSkeleton() {
  const params = useSearchParams();
  const view = parseReportView(params.get("tab"));
  return <MatchReportPending view={view} focused={params.has("cut")} />;
}
