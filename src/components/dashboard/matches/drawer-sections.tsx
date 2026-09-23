"use client";

import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { shortName } from "@/lib/data/match-utils";
import { providers } from "@/lib/providers";
import {
  ANALYSIS_LABEL,
  isAnalysisFailed,
  isInFlight,
  type AnalysisStatus,
} from "@/lib/data/match-analysis";
import { createClient } from "@/lib/supabase/client";
import type { ScoreLineSet } from "@/lib/ui/score-format";
import { ResultMark } from "@/components/dashboard/result-mark";
import { ScoreLine } from "@/components/dashboard/score-line";

/**
 * The body sections of a match peek drawer, lifted out of `match-drawer.tsx`
 * so the schedule's event pages can draw the same pieces for the matches
 * filed against an event. Everything here takes plain props — nothing reads a
 * `DisplayMatch` — so a caller holding any match shape can feed it.
 */

/** Abbreviate each partner separately so doubles retain both surnames. */
export function drawerSideName(name: string): string {
  return name
    .split(/\s+[&/]\s+/)
    .map((partner) => shortName(partner, 0))
    .join(" & ");
}

/** One shared icon rail keeps every match fact aligned. */
export function DrawerFact({
  label,
  icon,
  children,
}: {
  label: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-5 min-w-0 items-center gap-2">
      <dt className="shrink-0">
        <span className="sr-only">{label}</span>
        <span
          aria-hidden="true"
          className="flex size-4 items-center justify-center text-[var(--ink-400)] [&>svg]:size-3.5 [&>svg]:stroke-[1.5]"
        >
          {icon}
        </span>
      </dt>
      <dd className="min-w-0 flex-1 truncate text-[11px] leading-4 text-[var(--ink-700)]">
        {children}
      </dd>
    </div>
  );
}

/**
 * The "Provider" fact — where a match's numbers came from, with that source's
 * mark. Shared so the Matches drawer and the schedule's line drawer draw the
 * same row. Null for an id `providers` does not hold (a hand score has none).
 */
export function ProviderFact({
  providerId,
}: {
  providerId: string | null | undefined;
}) {
  const provider = providers.find((p) => p.id === providerId);
  if (!provider) return null;
  return (
    <DrawerFact
      label="Provider"
      icon={
        provider.id === "splitstep" ? (
          <span className="flex size-4 items-center justify-center rounded-[3px] bg-[var(--ink-900)]">
            <Image
              src="/logos/logo3.svg"
              alt=""
              width={10}
              height={7}
              className="brightness-0 invert"
            />
          </span>
        ) : provider.id === "swing-vision" ? (
          // Unoptimized: the optimizer's 16/32px q75 rendition of
          // this 200px app icon reads blurry; let the browser
          // downsample the source at the screen's own density.
          <Image
            src="/providers/swingvision-icon.png"
            alt=""
            width={16}
            height={16}
            unoptimized
            className="size-4 rounded-[3px] object-cover"
          />
        ) : (
          <Image
            src={provider.logo}
            alt=""
            width={16}
            height={16}
            className="size-4 object-contain"
          />
        )
      }
    >
      {provider.name}
    </DrawerFact>
  );
}

/**
 * The drawer's title — the abbreviated match name, linking to its report —
 * and, under it, the outcome and score. Pass no `sets` (an empty list) while
 * the match has no numbers to show; the score row is then absent.
 */
export function DrawerHeading({
  href,
  label,
  title,
  won,
  sets,
}: {
  href: string;
  /** The link's accessible name — the full, unabbreviated match name. */
  label: string;
  /** The abbreviated name drawn on screen. */
  title: string;
  won: boolean | null;
  sets: ScoreLineSet[];
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      <h2 className="text-title-lg">
        <Link
          href={href}
          aria-label={label}
          className="block truncate rounded-[var(--radius-cell)] text-[var(--ink-900)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
        >
          {title}
        </Link>
      </h2>
      {sets.length > 0 && (
        <div className="flex h-5 items-center gap-2">
          <ResultMark won={won} />
          <ScoreLine
            sets={sets}
            className="block text-[16px] leading-5 text-[var(--ink-900)] [&>span[aria-hidden=true]]:leading-[0]"
          />
        </div>
      )}
    </div>
  );
}

/**
 * The analysis state, when there is one: the in-flight label with a line on
 * when numbers arrive, or the failed block (`role="alert"`) with its note and
 * what to do next. Draws nothing for a settled match.
 */
export function AnalysisNotice({
  status,
  failNote,
  canRetry,
}: {
  status: AnalysisStatus | null | undefined;
  failNote?: string | null;
  /** The viewer can resubmit — the copy then says the video is reused. */
  canRetry: boolean;
}) {
  if (!status) return null;

  if (isInFlight(status)) {
    return (
      <div className="flex flex-col gap-2 border-t border-[var(--border-hairline)] pt-4">
        <span className="text-[11px] leading-none text-[var(--blue)]">
          {ANALYSIS_LABEL[status]}
        </span>
        <p className="text-[12px] leading-[1.6] text-[var(--ink-500)]">
          Serve and pressure numbers appear here once analysis finishes.
        </p>
      </div>
    );
  }

  if (isAnalysisFailed(status)) {
    return (
      <div
        role="alert"
        className="flex items-start gap-2.5 rounded-[10px] border border-[rgba(229,24,55,0.2)] bg-[rgba(229,24,55,0.04)] px-3.5 py-3"
      >
        <TriangleAlert
          className="mt-0.5 size-[15px] shrink-0 text-[var(--danger)]"
          strokeWidth={1.5}
          aria-hidden
        />
        <div className="flex flex-col gap-1">
          <p className="text-[13px] font-medium text-[var(--ink-900)]">
            {failNote ?? "Analysis stopped"}
          </p>
          <p className="text-[12px] leading-[1.5] text-[var(--ink-700)]">
            {canRetry
              ? "Retrying uses the video you already uploaded. Nothing needs uploading again."
              : "The match page has the details."}
          </p>
        </div>
      </div>
    );
  }

  return null;
}

/** Four figures a player reads first — serve, then pressure — or null when none exist. */
export interface Snapshot {
  firstServeIn: string | null;
  firstServeWon: string | null;
  breakPoints: string | null;
  doubleFaults: string | null;
}

/** The "Snapshot" eyebrow and its four figures, `—` where one is missing. */
export function SnapshotSection({ snapshot }: { snapshot: Snapshot }) {
  return (
    <div className="flex flex-col gap-3">
      <span className="eyebrow-sm">Snapshot</span>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        {(
          [
            ["1st serve in", snapshot.firstServeIn],
            ["1st serve won", snapshot.firstServeWon],
            ["Break points won", snapshot.breakPoints],
            ["Double faults", snapshot.doubleFaults],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="flex flex-col-reverse gap-[3px]">
            <dt className="text-[11px] text-[var(--ink-600)]">{label}</dt>
            <dd className="tabular text-[16px] text-[var(--ink-900)]">
              {value ?? <span className="text-[var(--ink-400)]">—</span>}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** The `match_stats_with_percentages` columns the snapshot reads. */
export interface SnapshotRow {
  first_serve_pct: string | number | null;
  first_serve_won_pct: string | number | null;
  break_points_converted: number | null;
  break_point_opportunities: number | null;
  double_faults: number | null;
}

function percent(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? `${Math.round(n)}%` : null;
}

export function toSnapshot(row: SnapshotRow | null): Snapshot | null {
  if (!row) return null;
  const snapshot: Snapshot = {
    firstServeIn: percent(row.first_serve_pct),
    firstServeWon: percent(row.first_serve_won_pct),
    breakPoints:
      row.break_point_opportunities !== null &&
      row.break_points_converted !== null
        ? `${row.break_points_converted}/${row.break_point_opportunities}`
        : null,
    doubleFaults: row.double_faults !== null ? String(row.double_faults) : null,
  };
  // Gate on "is there a value", never on "is there a row": a stats row of
  // nulls is the same nothing to show.
  return Object.values(snapshot).some((value) => value !== null)
    ? snapshot
    : null;
}

/**
 * Snapshots fetched on first open and kept for the page's life, so stepping
 * back with ↑ is a state change, not a round trip. Keyed by match id; a match
 * is immutable for this purpose except while it analyses, and an in-flight
 * match has no snapshot to cache yet.
 */
const snapshotCache = new Map<string, Snapshot | null>();
/** Mounted hooks, told when their match's snapshot was dropped so they refetch. */
const forgetListeners = new Set<(matchId: string) => void>();

/**
 * Drop one match's cached snapshot, and have any open drawer showing it read
 * the row again. `forgetMatchDetails` in `match-drawer.tsx` calls this.
 */
export function forgetMatchSnapshot(matchId: string): void {
  snapshotCache.delete(matchId);
  for (const listener of forgetListeners) listener(matchId);
}

/**
 * A match's snapshot figures, read once per match through the browser client —
 * RLS decides what comes back, exactly as it does for the list.
 * `match_stats_with_percentages` is `security_invoker`, so the view is no wider
 * than the table under it.
 *
 * `undefined` while loading, `null` when there are no numbers. Pass `pending`
 * while the match is still analysing: a null answer is then not cached, since
 * the numbers arrive later, and flipping it to false reads the row again.
 */
export function useMatchSnapshot(
  matchId: string,
  pending = false,
): Snapshot | null | undefined {
  const [loaded, setLoaded] = useState<{
    id: string;
    snapshot: Snapshot | null;
  } | null>(null);
  // Bumped when an edit drops this match's snapshot while the drawer is open —
  // the other deps don't change for a hand-scored match, so without it the
  // open drawer kept its pre-edit answer until closed and reopened.
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const listener = (id: string) => {
      if (id === matchId) setRevision((r) => r + 1);
    };
    forgetListeners.add(listener);
    return () => {
      forgetListeners.delete(listener);
    };
  }, [matchId]);

  useEffect(() => {
    if (snapshotCache.has(matchId)) return;
    let cancelled = false;

    createClient()
      .from("match_stats_with_percentages")
      .select(
        "first_serve_pct, first_serve_won_pct, break_points_converted, break_point_opportunities, double_faults",
      )
      .eq("match_id", matchId)
      // player1 is always the list's own side — the uploader's player, or
      // the roster player on a team match — the seat the row's result reads.
      .eq("is_player1", true)
      .maybeSingle()
      .then(({ data }) => {
        const snapshot = toSnapshot(data as SnapshotRow | null);
        // An in-flight match gains numbers later; only a settled answer is kept.
        if (snapshot || !pending) snapshotCache.set(matchId, snapshot);
        if (!cancelled) setLoaded({ id: matchId, snapshot });
      });

    return () => {
      cancelled = true;
    };
  }, [matchId, pending, revision]);

  if (snapshotCache.has(matchId)) return snapshotCache.get(matchId);
  return loaded?.id === matchId ? loaded.snapshot : undefined;
}
