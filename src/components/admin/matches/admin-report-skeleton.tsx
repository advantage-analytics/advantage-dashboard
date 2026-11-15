"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { MatchReportPendingFrame } from "@/components/dashboard/loading/match-report-pending";
import {
  PendingBar,
  PendingRegion,
} from "@/components/dashboard/loading/pending";
import { parseReportView } from "@/components/dashboard/matches/match-detail/report-view";

/**
 * `/admin/matches/[matchId]` while it loads (`[matchId]/loading.tsx`): the
 * page's bounded box, `AdminReportStrip`'s line with the "‹ Matches" way
 * back as real chrome (it works already), bars for the players and for the
 * actions ("Open in Labels", the "⋯" menu), then the player's report pending, as the dashboard
 * report's own skeleton draws it (`MatchReportPendingFrame`) with the admin's
 * read-only rail foot.
 *
 * Beside the strip rather than in it: the strip is the loaded page's, and the
 * skeleton reads the URL (the match id for the way back, `?tab=` for the
 * pane), which the strip has no need to.
 *
 * It draws the report. A match still analysing lands on its analysis steps
 * instead, which nothing in the URL can predict.
 */
export function AdminMatchReportPageSkeleton() {
  const params = useParams<{ matchId?: string }>();
  const search = useSearchParams();
  const view = parseReportView(search.get("tab"));
  const matchId = params?.matchId;
  const backHref = matchId
    ? `/admin/matches?id=${encodeURIComponent(matchId)}`
    : "/admin/matches";

  return (
    <div className="flex h-[calc(100dvh-var(--header-h))] w-full flex-col overflow-hidden bg-[var(--surface-card)]">
      <div className="flex shrink-0 items-center gap-4 border-b border-[var(--border-hairline)] px-6 py-1.5">
        <nav
          aria-label="Breadcrumb"
          className="flex min-w-0 flex-1 items-center gap-2 text-[13px]"
        >
          <Link
            href={backHref}
            className="inline-flex shrink-0 items-center gap-1 text-[var(--ink-600)] transition-colors duration-200 hover:text-[var(--ink-900)]"
          >
            <ChevronLeft className="size-3.5" strokeWidth={1.8} aria-hidden />
            Matches
          </Link>
          <span aria-hidden="true" className="text-[var(--ink-400)]">
            /
          </span>
          <PendingRegion label="the match" className="min-w-0">
            <PendingBar className="h-3 w-56" />
          </PendingRegion>
        </nav>

        <PendingRegion
          label="the match's actions"
          innerClassName="flex h-8 items-center gap-2"
        >
          <PendingBar className="h-8 w-28 rounded-[var(--radius-element)]" />
          <PendingBar className="size-8 rounded-[var(--radius-element)]" />
        </PendingRegion>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <MatchReportPendingFrame
          view={view}
          readOnlyFooter={
            <p className="m-0 border-t border-[var(--border-hairline)] px-5 py-4 text-[12px] text-[var(--ink-600)]">
              Share and Ask are hidden while viewing as admin.
            </p>
          }
        />
      </div>
    </div>
  );
}
