"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  Calendar,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  MapPin,
  TriangleAlert,
  X,
} from "lucide-react";
import type { DisplayMatch } from "@/lib/data/matches-list-types";
import {
  ANALYSIS_LABEL,
  isAnalysisFailed,
  isInFlight,
} from "@/lib/data/match-analysis";
import { createClient } from "@/lib/supabase/client";
import { ChromeTooltip } from "@/components/dashboard/shared/chrome-tooltip";
import { ResultMark } from "@/components/dashboard/result-mark";
import { ScoreLine } from "@/components/dashboard/score-line";
import { MatchActionsMenu } from "@/components/dashboard/matches/match-actions/match-actions-menu";
import { formatShortDate } from "@/lib/ui/date-format";
import { advButton } from "@/lib/ui/adv-button";
import { capitalize, cn } from "@/lib/utils";

/** The drawer's `role="dialog"` carries this so the window key handler can tell it from a modal. */
export const DRAWER_ATTR = "data-match-drawer";

/** The header's 28px square control — the roster's and the schedule's, verbatim. */
export const ICON_BUTTON =
  "inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-element)] text-[var(--ink-500)] transition-colors duration-[var(--duration-hover)] hover:bg-[var(--surface-subtle)] hover:text-[var(--ink-700)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40";

/** Four figures a player reads first — serve, then pressure — or null when none exist. */
interface Snapshot {
  firstServeIn: string | null;
  firstServeWon: string | null;
  breakPoints: string | null;
  doubleFaults: string | null;
}

/** The scheduled line a match was recorded against, when it has one. */
interface ScheduleLink {
  eventId: string;
  name: string;
  slot: string | null;
}

interface Details {
  snapshot: Snapshot | null;
  schedule: ScheduleLink | null;
}

/**
 * Details fetched on first open and kept for the page's life, so stepping back
 * with ↑ is a state change, not a round trip. Keyed by match id; a match is
 * immutable for this purpose except while it analyses, and an in-flight match
 * has no snapshot to cache yet.
 */
const detailsCache = new Map<string, Details>();
/** Open drawers, told when their match's details were dropped so they refetch. */
const forgetListeners = new Set<(matchId: string) => void>();

/**
 * Drop one match's cached details. Called after an edit changes what the drawer
 * shows — attaching a match to a scheduled line gives it a Schedule row — so
 * the next open reads the row again instead of the pre-edit answer.
 */
export function forgetMatchDetails(matchId: string): void {
  detailsCache.delete(matchId);
  for (const listener of forgetListeners) listener(matchId);
}

/**
 * `Pb3` — the selected match, as a dismissable right rail.
 *
 * The shell is `PeekDrawerFrame`, shared with a draft's drawer; the header's
 * ⋯ is the uploader's Edit · Delete — the only place a match row's actions live.
 *
 * Body, top to bottom: the match's name as the link to its report (it wraps,
 * never truncates) over its event and round; the outcome glyph and score with
 * one nowrap row of date, duration and surface; the analysis state when there
 * is one; four snapshot figures once numbers exist — absent, not empty, before
 * that; and on a team match, the scheduled line it counts toward.
 *
 * ── The footer ─────────────────────────────────────────────────────────────
 * A ghost "Open match" for everyone, always — so a player, or a coach whose
 * events policy grants no schedule rights, is never left with an empty footer,
 * and the footer does not change shape from one viewer to the next. The one
 * primary sits under it only when there is something to do here: "Try again"
 * on a failed analysis, for the person who uploaded it (the resubmit route
 * refuses anyone else).
 *
 * ── Row-click law ──────────────────────────────────────────────────────────
 * On the Matches page a match row peeks instead of travelling — the ruling is
 * in `tables.md`. ⌘-click on the row and this drawer's title still open the
 * report, and everywhere else a match row keeps its chevron and navigates.
 */
export function MatchDrawer({
  match,
  scope,
  index,
  total,
  canPrev,
  canNext,
  closing,
  autoFocus,
  onPrev,
  onNext,
  onClose,
  onClosed,
}: {
  match: DisplayMatch;
  scope: "personal" | "team";
  /** Position within the filtered list — "3 / 24" counts what the filters left. */
  index: number;
  total: number;
  /** Stepping bounds — the list walks drafts and matches as one. */
  canPrev: boolean;
  canNext: boolean;
  /** Playing the slide-out; `onClosed` fires when it finishes. */
  closing: boolean;
  /** Opened from the keyboard — take focus so `Tab` continues inside. */
  autoFocus: boolean;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  onClosed: () => void;
}) {
  const details = useMatchDetails(match, scope);
  const href = `/dashboard/matches/${match.id}`;
  const isTeam = scope === "team";
  const title = isTeam
    ? `${match.player1.name} vs ${match.player2.name}`
    : `vs ${match.player2.name}`;
  const status = match.analysis?.status;
  const inFlight = status ? isInFlight(status) : false;
  const failed = status ? isAnalysisFailed(status) : false;
  const canRetry =
    status === "failed" &&
    Boolean(match.analysis?.jobId) &&
    match.canManage !== false;
  // No numbers while a match is still being worked on or has failed: the
  // score and snapshot would draw zeroes that read as "no serves".
  const settled = !inFlight && !failed;

  const facts = [
    { icon: Calendar, text: formatShortDate(match.date), mono: true },
    match.duration ? { icon: Clock, text: match.duration, mono: true } : null,
    match.courtType
      ? { icon: MapPin, text: capitalize(match.courtType), mono: false }
      : null,
  ].filter((fact) => fact !== null);

  return (
    <PeekDrawerFrame
      kind="Match"
      label={title}
      index={index}
      total={total}
      canPrev={canPrev}
      canNext={canNext}
      closing={closing}
      autoFocus={autoFocus}
      focusKey={match.id}
      onPrev={onPrev}
      onNext={onNext}
      onClose={onClose}
      onClosed={onClosed}
      actions={
        // Edit and Delete belong to whoever uploaded the match, whatever their
        // role. They live here only — a match row carries no ⋯ of its own.
        match.canManage !== false && (
          <MatchActionsMenu
            key={match.id}
            matchId={match.id}
            matchLabel={match.tournamentName}
          />
        )
      }
      footer={
        <>
          <Link href={href} className={cn(advButton("ghost", "md"), "w-full")}>
            Open match
          </Link>
          {canRetry && match.analysis?.jobId && (
            <RetryButton jobId={match.analysis.jobId} />
          )}
        </>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-[22px] pt-6 pb-[22px]">
        {/* Identity — the match's name is the bridge to its report. */}
        <div className="flex flex-col gap-1">
          <h2 className="text-title-lg">
            <Link
              href={href}
              className="rounded-[var(--radius-cell)] [text-wrap:balance] text-[var(--ink-900)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
            >
              {title}
            </Link>
          </h2>
          <p className="text-[12px] leading-[1.5] text-[var(--ink-600)]">
            {match.tournamentName}
            {match.round && ` · ${match.round}`}
          </p>
        </div>

        <div className="flex flex-col gap-2.5">
          {settled && match.score.sets.length > 0 && (
            // A fixed-height row with the score's line box pinned to it, so
            // the glyph centres on the digits — the tiebreak superscript
            // otherwise raises the line box and drops the score below it.
            <div className="flex h-5 items-center gap-2">
              <ResultMark won={match.score.winner === "player1"} />
              <ScoreLine
                sets={match.score.sets}
                className="block text-[16px] leading-5 text-[var(--ink-900)] [&>span[aria-hidden=true]]:leading-[0]"
              />
            </div>
          )}
          <div className="flex items-center gap-3.5 whitespace-nowrap">
            {facts.map(({ icon: Icon, text, mono }) => (
              <span key={text} className="flex items-center gap-[5px]">
                <Icon
                  className="size-[13px] text-[var(--ink-400)]"
                  strokeWidth={1.5}
                  aria-hidden
                />
                <span
                  className={cn(
                    "text-[var(--ink-600)]",
                    mono ? "mono tabular text-[11px]" : "text-[12px]",
                  )}
                >
                  {text}
                </span>
              </span>
            ))}
          </div>
        </div>

        {inFlight && status && (
          <div className="flex flex-col gap-2 border-t border-[var(--border-hairline)] pt-4">
            <span className="text-[11px] leading-none text-[var(--blue)]">
              {ANALYSIS_LABEL[status]}
            </span>
            <p className="text-[12px] leading-[1.6] text-[var(--ink-500)]">
              Serve and pressure numbers appear here once analysis finishes.
            </p>
          </div>
        )}

        {failed && (
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
                {match.analysis?.failNote ?? "Analysis stopped"}
              </p>
              <p className="text-[12px] leading-[1.5] text-[var(--ink-700)]">
                {canRetry
                  ? "Retrying uses the video you already uploaded. Nothing needs uploading again."
                  : "The match page has the details."}
              </p>
            </div>
          </div>
        )}

        {settled && details?.snapshot && (
          <div className="flex flex-col gap-3 border-t border-[var(--border-hairline)] pt-4">
            <span className="eyebrow-sm">Snapshot</span>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3.5">
              {(
                [
                  ["1st serve in", details.snapshot.firstServeIn],
                  ["1st serve won", details.snapshot.firstServeWon],
                  ["Break points won", details.snapshot.breakPoints],
                  ["Double faults", details.snapshot.doubleFaults],
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
        )}

        {isTeam && details?.schedule && (
          <div className="flex flex-col gap-0.5">
            <span className="eyebrow-sm pb-2">Schedule</span>
            <Link
              href={`/dashboard/team/schedule/${details.schedule.eventId}`}
              className="-mx-2 grid h-10 grid-cols-[minmax(0,1fr)_max-content_12px] items-center gap-2.5 rounded-[var(--radius-element)] px-2 transition-colors duration-[var(--duration-hover)] hover:bg-[var(--surface-muted)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
            >
              <span className="truncate text-[12px] text-[var(--ink-900)]">
                {details.schedule.name}
              </span>
              <span className="mono text-[10px] text-[var(--ink-400)]">
                {details.schedule.slot}
              </span>
              <ChevronRight
                className="size-3 text-[var(--ink-300)]"
                strokeWidth={1.5}
                aria-hidden
              />
            </Link>
          </div>
        )}
      </div>
    </PeekDrawerFrame>
  );
}

/**
 * The rail every Matches-page drawer shares — a match's and a draft's. The
 * Roster's and Schedule's shell: 340px, the float shadow, a 44px header with
 * ↑ ↓ stepping, "Match n / N", the record's ⋯, a divider and the close that
 * also answers Esc. It is the WIDTH that animates (`roster-drawer-in` /
 * `-out`), so the table reflows rather than being covered. The body scrolls;
 * the footer pins to the bottom.
 */
export function PeekDrawerFrame({
  kind,
  label,
  index,
  total,
  canPrev,
  canNext,
  closing,
  autoFocus,
  focusKey,
  actions,
  footer,
  children,
  onPrev,
  onNext,
  onClose,
  onClosed,
}: {
  /** The counter's noun, and the stepping buttons' — "Match", "Draft". */
  kind: string;
  /** The dialog's accessible name. */
  label: string;
  /** Position among records of this kind — "Draft 1 / 2", "Match 3 / 24". */
  index: number;
  total: number;
  canPrev: boolean;
  canNext: boolean;
  closing: boolean;
  autoFocus: boolean;
  /** Re-takes focus when the record changes under a keyboard user. */
  focusKey: string;
  actions?: React.ReactNode;
  footer: React.ReactNode;
  children: React.ReactNode;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  onClosed: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoFocus) panelRef.current?.focus({ preventScroll: true });
  }, [autoFocus, focusKey]);

  return (
    <aside
      {...{ [DRAWER_ATTR]: "" }}
      onAnimationEnd={(event) => {
        if (event.animationName === "roster-drawer-out") onClosed();
      }}
      className={cn(
        "sticky top-11 z-[2] hidden h-[calc(100vh-44px)] shrink-0 self-start overflow-hidden border-l border-[var(--border-hairline)] bg-[var(--surface-card)] shadow-[var(--shadow-dropdown)] motion-reduce:animate-none lg:block",
        closing
          ? "w-0 animate-[roster-drawer-out_200ms_var(--ease-primary)_both]"
          : "w-[340px] animate-[roster-drawer-in_200ms_var(--ease-primary)_both]",
      )}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-label={label}
        tabIndex={-1}
        className="flex h-full w-[340px] flex-col outline-none"
      >
        <div className="flex h-11 shrink-0 items-center gap-1.5 border-b border-[var(--border-hairline)] px-5">
          <ChromeTooltip label="Previous" shortcut="↑">
            <button
              type="button"
              aria-label="Previous"
              disabled={!canPrev}
              onClick={onPrev}
              className={ICON_BUTTON}
            >
              <ChevronUp className="size-3.5" strokeWidth={1.5} aria-hidden />
            </button>
          </ChromeTooltip>
          <ChromeTooltip label="Next" shortcut="↓">
            <button
              type="button"
              aria-label="Next"
              disabled={!canNext}
              onClick={onNext}
              className={ICON_BUTTON}
            >
              <ChevronDown className="size-3.5" strokeWidth={1.5} aria-hidden />
            </button>
          </ChromeTooltip>
          <span className="ml-1 inline-flex shrink-0 items-baseline gap-1.5 whitespace-nowrap">
            <span className="text-[12px] text-[var(--ink-600)]">{kind}</span>
            <span className="mono tabular text-[11px] text-[var(--ink-400)]">
              {index + 1} / {total}
            </span>
          </span>
          <div className="min-w-2 flex-1" />
          {actions}
          <span
            aria-hidden
            className="mx-0.5 h-3.5 w-px bg-[var(--border-medium)]"
          />
          <ChromeTooltip label="Close" shortcut="Esc">
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className={ICON_BUTTON}
            >
              <X className="size-3.5" strokeWidth={1.5} aria-hidden />
            </button>
          </ChromeTooltip>
        </div>

        {children}

        <div className="flex shrink-0 flex-col gap-3 px-[22px] py-4">
          {footer}
        </div>
      </div>
    </aside>
  );
}

/** "Try again" — the match page's resubmit, as the drawer's one primary. */
function RetryButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const response = await fetch(
              `/api/splitstep/jobs/${jobId}/resubmit`,
              { method: "POST" },
            ).catch(() => null);
            if (!response?.ok) {
              const payload = (await response?.json().catch(() => null)) as {
                error?: string;
              } | null;
              setError(payload?.error ?? "That didn't go through.");
              return;
            }
            router.refresh();
          })
        }
        className={cn(advButton("primary", "md"), "w-full")}
      >
        {pending ? "Trying again…" : "Try again"}
      </button>
      {error && (
        <p
          role="alert"
          className="text-[12px] leading-[18px] text-[var(--danger)]"
        >
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * The snapshot figures and the scheduled line, read once per match through the
 * browser client — RLS decides what comes back, exactly as it does for the list.
 * `match_stats_with_percentages` is `security_invoker`, so the view is no wider
 * than the table under it.
 */
function useMatchDetails(
  match: DisplayMatch,
  scope: "personal" | "team",
): Details | undefined {
  const [loaded, setLoaded] = useState<{ id: string; details: Details } | null>(
    null,
  );
  const cached = detailsCache.get(match.id);
  // Bumped when an edit drops this match's details while the drawer is open —
  // the other deps don't change for a hand-scored match, so without it the
  // open drawer kept its pre-edit answer until closed and reopened.
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const listener = (id: string) => {
      if (id === match.id) setRevision((r) => r + 1);
    };
    forgetListeners.add(listener);
    return () => {
      forgetListeners.delete(listener);
    };
  }, [match.id]);

  useEffect(() => {
    if (detailsCache.has(match.id)) return;
    let cancelled = false;
    const supabase = createClient();

    Promise.all([
      supabase
        .from("match_stats_with_percentages")
        .select(
          "first_serve_pct, first_serve_won_pct, break_points_converted, break_point_opportunities, double_faults",
        )
        .eq("match_id", match.id)
        // player1 is always the list's own side — the uploader's player, or
        // the roster player on a team match — the seat the row's result reads.
        .eq("is_player1", true)
        .maybeSingle(),
      scope === "team"
        ? supabase
            .from("matches")
            .select(
              "entry:program_event_entries(slot, event:program_events(id, name))",
            )
            .eq("id", match.id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]).then(([stats, link]) => {
      const details: Details = {
        snapshot: toSnapshot(stats.data),
        schedule: toSchedule(link.data),
      };
      // An in-flight match gains numbers later; only a settled answer is kept.
      if (
        details.snapshot ||
        !match.analysis ||
        !isInFlight(match.analysis.status)
      ) {
        detailsCache.set(match.id, details);
      }
      if (!cancelled) setLoaded({ id: match.id, details });
    });

    return () => {
      cancelled = true;
    };
  }, [match.id, match.analysis, scope, revision]);

  if (cached) return cached;
  return loaded?.id === match.id ? loaded.details : undefined;
}

function percent(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? `${Math.round(n)}%` : null;
}

function toSnapshot(
  row: {
    first_serve_pct: string | number | null;
    first_serve_won_pct: string | number | null;
    break_points_converted: number | null;
    break_point_opportunities: number | null;
    double_faults: number | null;
  } | null,
): Snapshot | null {
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

function toSchedule(row: unknown): ScheduleLink | null {
  const entry = (row as { entry?: unknown } | null)?.entry as
    | { slot: string | null; event: { id: string; name: string } | null }
    | null
    | undefined;
  if (!entry?.event) return null;
  return { eventId: entry.event.id, name: entry.event.name, slot: entry.slot };
}
