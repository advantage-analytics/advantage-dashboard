"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Activity } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { AnalysisProgressTrack } from "@/components/dashboard/matches/analysis-progress-track";
import { useWorkspace } from "@/components/dashboard/workspace-provider";
import {
  useLiveMatchAnalysis,
  withLiveAnalysis,
} from "@/hooks/use-live-match-analysis";
import {
  ANALYSIS_LABEL,
  formatEta,
  isAnalysisFailed,
  isInFlight,
  isLiveUpdating,
  isWorking,
  uploadEtaSeconds,
} from "@/lib/data/match-analysis";
import { formatDisplayDate } from "@/lib/data/match-utils";
import type { ActivityFeed, ActivityItem } from "@/lib/data/activity-server";
import { cn } from "@/lib/utils";

/** ETA refresh. The underlying percentage moves in 2-point steps, so anything
 *  faster re-renders without new information. */
const ETA_TICK_MS = 15_000;

/** The row chrome both kinds share. Only the body differs. */
function ActivityRow({
  matchId,
  marked,
  className,
  children,
}: {
  matchId: string;
  /** Unread dot. Settled rows keep the indent without the mark. */
  marked: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={`/dashboard/matches/${matchId}`}
      className={cn(
        "flex gap-2.5 rounded-[8px] px-2.5 transition-colors duration-150 hover:bg-[var(--surface-subtle)] focus-visible:bg-[var(--surface-subtle)] focus-visible:outline-none",
        className
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "mt-[5px] size-1.5 shrink-0 rounded-full",
          marked && "bg-[var(--blue)]"
        )}
      />
      {children}
    </Link>
  );
}

function InFlightRow({ item, nowMs }: { item: ActivityItem; nowMs: number }) {
  const { analysis, title } = item;
  const eta = uploadEtaSeconds(analysis, nowMs);

  return (
    <ActivityRow matchId={item.matchId} marked className="py-2.5">
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="min-w-0 text-[12px] text-[var(--ink-900)] [text-wrap:pretty]">
          {ANALYSIS_LABEL[analysis.status]} <b className="font-medium">{title}</b>
        </span>

        {analysis.progressPercent !== undefined && (
          <AnalysisProgressTrack
            percent={analysis.progressPercent}
            live={isWorking(analysis.status)}
            label={`${ANALYSIS_LABEL[analysis.status]} ${title}`}
          />
        )}

        {/* Only the upload has a measured remaining time. The vendor sends its
            transitions without a percentage, so anything shown for queued or
            processing would be invented — the status word stands alone. */}
        {eta !== undefined && (
          <span className="text-[11px] text-[var(--ink-500)]">
            {formatEta(eta)}
          </span>
        )}
      </span>
    </ActivityRow>
  );
}

function SettledRow({ item }: { item: ActivityItem }) {
  const failed = isAnalysisFailed(item.analysis.status);

  return (
    <ActivityRow matchId={item.matchId} marked={false} className="py-2">
      <span className="flex min-w-0 flex-1 items-baseline gap-2">
        <span className="min-w-0 truncate text-[12px] text-[var(--ink-700)]">
          {failed ? "Analysis failed" : "Report ready"} —{" "}
          <b className="font-medium text-[var(--ink-900)]">{item.title}</b>
        </span>
        <span className="ml-auto shrink-0 text-[10px] text-[var(--ink-400)]">
          {formatDisplayDate(item.at)}
        </span>
      </span>
    </ActivityRow>
  );
}

export function ActivityTray({ feed }: { feed: ActivityFeed }) {
  const { viewer } = useWorkspace();
  const [isOpen, setIsOpen] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  /**
   * Subscribe only when an update is actually coming.
   *
   * `isLiveUpdating`, deliberately, and not `isInFlight` — the two differ on
   * `processed`, which is in flight but waits on a deploy rather than a running
   * process. Watching it is what once held a WebSocket and a 25-second
   * heartbeat open indefinitely, per user, against a per-project connection
   * cap. This tray renders on EVERY dashboard page, so it is the worst possible
   * place to get that predicate wrong.
   */
  /**
   * Gated on the SERVER feed, not the merged list, and that is a deliberate
   * limit rather than an oversight. Deriving it from `merged` is circular —
   * merged needs `patches`, which needs the subscription, which needs this.
   * Breaking the cycle costs an extra state plus an effect to latch "the last
   * job settled", for a socket that closes on the next navigation anyway.
   *
   * So: if nothing was live at render, no socket opens at all. If something
   * was, it stays open until you navigate. That is the tradeoff.
   */
  const hasLiveWork = feed.items.some((item) =>
    isLiveUpdating(item.analysis.status)
  );
  const patches = useLiveMatchAnalysis({
    by: "user",
    userId: hasLiveWork ? viewer.id : undefined,
  });

  // Partition AFTER merging: a live event is exactly the thing that moves a job
  // out of flight, so any split made before the merge is already stale.
  const { inFlight, settled } = useMemo(() => {
    const merged = feed.items.map((item) => ({
      ...item,
      analysis: withLiveAnalysis(item.analysis, patches.get(item.matchId)),
    }));

    return {
      inFlight: merged.filter((item) => isInFlight(item.analysis.status)),
      settled: merged.filter((item) => !isInFlight(item.analysis.status)),
    };
    // `feed.items`, not `feed`: the wrapper object is a fresh identity on every
    // RSC payload.
  }, [feed.items, patches]);

  const unread = inFlight.length;

  // Only tick while something can actually produce a new estimate.
  const hasUploading = inFlight.some(
    (item) => item.analysis.status === "uploading"
  );
  useEffect(() => {
    if (!isOpen || !hasUploading) return;
    const id = setInterval(() => setNowMs(Date.now()), ETA_TICK_MS);
    return () => clearInterval(id);
  }, [isOpen, hasUploading]);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={
                unread > 0 ? `Activity, ${unread} in progress` : "Activity"
              }
              className={cn(
                "relative flex size-7 items-center justify-center rounded-[8px] transition-colors duration-150 hover:bg-[var(--surface-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--blue-ring-40)] cursor-pointer",
                isOpen && "bg-[var(--surface-subtle)]"
              )}
            >
              <Activity
                className={cn(
                  "size-[15px]",
                  isOpen ? "text-[var(--ink-900)]" : "text-[var(--ink-700)]"
                )}
                strokeWidth={1.5}
                aria-hidden="true"
              />
              {unread > 0 && (
                <span
                  aria-hidden="true"
                  className="absolute right-0 top-0 min-w-[13px] rounded-full bg-[var(--blue)] px-[3px] text-center text-[8px] font-medium leading-[13px] text-white"
                >
                  {unread}
                </span>
              )}
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={4}>
          Activity
        </TooltipContent>
      </Tooltip>

      <PopoverContent
        align="end"
        sideOffset={6}
        className="w-[326px] overflow-hidden rounded-[12px] border-[var(--border-medium)] p-0"
      >
        <div className="border-b border-[var(--border-hairline)] px-3.5 py-2.5">
          <p className="text-[13px] font-medium text-[var(--ink-900)]">
            Notifications
          </p>
        </div>

        {feed.items.length === 0 ? (
          <p className="px-3.5 py-6 text-center text-[12px] text-[var(--ink-500)]">
            Nothing in flight.
          </p>
        ) : (
          <div className="flex max-h-[380px] flex-col overflow-y-auto p-1.5">
            {inFlight.map((item) => (
              <InFlightRow key={item.matchId} item={item} nowMs={nowMs} />
            ))}
            {settled.map((item) => (
              <SettledRow key={item.matchId} item={item} />
            ))}
          </div>
        )}

        {/* No "Mark all read": nothing here has a read state to persist. The
            badge counts work still moving, so it clears itself when that
            resolves. A control that only hides a self-clearing badge teaches
            people to ignore the badge. */}
      </PopoverContent>
    </Popover>
  );
}
