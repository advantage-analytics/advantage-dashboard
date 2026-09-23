"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  Calendar,
  Clock,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  MapPin,
  Trophy,
  X,
} from "lucide-react";
import { providers } from "@/lib/providers";
import type { DisplayMatch } from "@/lib/data/matches-list-types";
import { isAnalysisFailed, isInFlight } from "@/lib/data/match-analysis";
import { createClient } from "@/lib/supabase/client";
import { ChromeTooltip } from "@/components/dashboard/shared/chrome-tooltip";
import { MatchActionsMenu } from "@/components/dashboard/matches/match-actions/match-actions-menu";
import {
  AnalysisNotice,
  DrawerFact,
  DrawerHeading,
  SnapshotSection,
  drawerSideName,
  forgetMatchSnapshot,
  useMatchSnapshot,
} from "./drawer-sections";
import { formatShortDate } from "@/lib/ui/date-format";
import { advButton } from "@/lib/ui/adv-button";
import { capitalize, cn } from "@/lib/utils";

/** The drawer's `role="dialog"` carries this so the window key handler can tell it from a modal. */
export const DRAWER_ATTR = "data-match-drawer";

/** The header's 28px square control — the roster's and the schedule's, verbatim. */
export const ICON_BUTTON =
  "inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-element)] text-[var(--ink-500)] transition-colors duration-[var(--duration-hover)] hover:bg-[var(--surface-subtle)] hover:text-[var(--ink-700)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40";

/** The scheduled line a match was recorded against, when it has one. */
interface ScheduleLink {
  site: string | null;
  eventId: string;
  name: string;
  slot: string | null;
}

/**
 * The scheduled line of a team match, fetched on first open and kept for the
 * page's life, so stepping back with ↑ is a state change, not a round trip.
 * The snapshot figures keep their own cache in `drawer-sections.tsx`.
 */
const scheduleCache = new Map<string, ScheduleLink | null>();
/** Open drawers, told when their match's details were dropped so they refetch. */
const forgetListeners = new Set<(matchId: string) => void>();

/**
 * Drop one match's cached details. Called after an edit changes what the drawer
 * shows — attaching a match to a scheduled line gives it a Schedule row — so
 * the next open reads the row again instead of the pre-edit answer.
 */
export function forgetMatchDetails(matchId: string): void {
  scheduleCache.delete(matchId);
  forgetMatchSnapshot(matchId);
  for (const listener of forgetListeners) listener(matchId);
}

/**
 * `Pb3` — the selected match, as a dismissable right rail.
 *
 * The shell is `PeekDrawerFrame`, shared with a draft's drawer; the header's
 * ⋯ is the uploader's Edit · Delete — the only place a match row's actions live.
 *
 * Body, top to bottom: the abbreviated match name links to its report, followed
 * by the outcome and score; compact icon-and-value metadata rows; the analysis
 * state when there is one; four snapshot figures once numbers exist — absent,
 * not empty, before that; and on a team match, its scheduled line.
 *
 * ── The footer ─────────────────────────────────────────────────────────────
 * A blue "View match" for everyone, always — so a player, or a coach whose
 * events policy grants no schedule rights, is never left with an empty footer,
 * and the footer does not change shape from one viewer to the next. An outlined
 * "Retry" sits under it on a failed analysis for the person who uploaded it
 * (the resubmit route refuses anyone else).
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
  const status = match.analysis?.status;
  const inFlight = status ? isInFlight(status) : false;
  const failed = status ? isAnalysisFailed(status) : false;
  const snapshot = useMatchSnapshot(match.id, inFlight);
  const schedule = useScheduleLink(match.id, scope);
  const href = `/dashboard/matches/${match.id}`;
  const isTeam = scope === "team";
  const title = `${drawerSideName(match.player1.name)} vs ${drawerSideName(match.player2.name)}`;
  const provider = providers.find((p) => p.id === match.sourceProvider);
  const canRetry =
    status === "failed" &&
    Boolean(match.analysis?.jobId) &&
    match.canManage !== false;
  // No numbers while a match is still being worked on or has failed: the
  // score and snapshot would draw zeroes that read as "no serves".
  const settled = !inFlight && !failed;

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
          <Link
            href={href}
            className={cn(advButton("primary", "md"), "w-full")}
          >
            View match
          </Link>
          {canRetry && match.analysis?.jobId && (
            <RetryButton jobId={match.analysis.jobId} />
          )}
        </>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-[22px] pt-5 pb-[22px]">
        <DrawerHeading
          href={href}
          label={`${match.player1.name} vs ${match.player2.name}`}
          title={title}
          won={match.score.winner === "player1"}
          sets={settled ? match.score.sets : []}
        />

        <div className="flex min-w-0 flex-col gap-2">
          <dl className="flex min-w-0 flex-col gap-0.5 text-left">
            <DrawerFact label="Date" icon={<Calendar />}>
              <span className="tabular">{formatShortDate(match.date)}</span>
            </DrawerFact>
            <DrawerFact
              label="Court"
              icon={
                <Image
                  src="/icons/tennis-court-icon.svg"
                  alt=""
                  width={16}
                  height={16}
                />
              }
            >
              {match.courtType ? capitalize(match.courtType) : "Not specified"}
            </DrawerFact>
            <DrawerFact label="Home/Away" icon={<MapPin />}>
              {schedule?.site ? capitalize(schedule.site) : "Not specified"}
            </DrawerFact>
            <DrawerFact label="Event" icon={<Trophy />}>
              {match.tournamentName || schedule?.name || "Not specified"}
              {match.round && (
                <span className="ml-1 text-[11px] text-[var(--ink-500)]">
                  {match.round}
                </span>
              )}
            </DrawerFact>
            {match.duration && (
              <DrawerFact label="Duration" icon={<Clock />}>
                <span className="tabular">{match.duration}</span>
              </DrawerFact>
            )}
            {provider && (
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
            )}
          </dl>
        </div>

        <AnalysisNotice
          status={status}
          failNote={match.analysis?.failNote}
          canRetry={canRetry}
        />

        {settled && snapshot && <SnapshotSection snapshot={snapshot} />}

        {isTeam && schedule && (
          <div className="flex flex-col gap-0.5">
            <span className="eyebrow-sm pb-2">Schedule</span>
            <Link
              href={`/dashboard/team/schedule/${schedule.eventId}`}
              className="-mx-2 grid h-10 grid-cols-[minmax(0,1fr)_max-content_12px] items-center gap-2.5 rounded-[var(--radius-element)] px-2 transition-colors duration-[var(--duration-hover)] hover:bg-[var(--surface-muted)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
            >
              <span className="truncate text-[12px] text-[var(--ink-900)]">
                {schedule.name}
              </span>
              <span className="mono text-[10px] text-[var(--ink-400)]">
                {schedule.slot}
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
        className={cn(advButton("outline", "md"), "w-full")}
      >
        {pending ? "Retrying…" : "Retry"}
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
 * The scheduled line a team match was recorded against, read once per match
 * through the browser client — RLS decides what comes back, exactly as it does
 * for the list. A personal match has none, and is never asked.
 */
function useScheduleLink(
  matchId: string,
  scope: "personal" | "team",
): ScheduleLink | null | undefined {
  const [loaded, setLoaded] = useState<{
    id: string;
    schedule: ScheduleLink | null;
  } | null>(null);
  // Bumped when an edit drops this match's details while the drawer is open —
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
    if (scope !== "team" || scheduleCache.has(matchId)) return;
    let cancelled = false;

    createClient()
      .from("matches")
      .select(
        "entry:program_event_entries(slot, event:program_events(id, name, site))",
      )
      .eq("id", matchId)
      .maybeSingle()
      .then(({ data }) => {
        const schedule = toSchedule(data);
        scheduleCache.set(matchId, schedule);
        if (!cancelled) setLoaded({ id: matchId, schedule });
      });

    return () => {
      cancelled = true;
    };
  }, [matchId, scope, revision]);

  if (scope !== "team") return null;
  if (scheduleCache.has(matchId)) return scheduleCache.get(matchId);
  return loaded?.id === matchId ? loaded.schedule : undefined;
}

function toSchedule(row: unknown): ScheduleLink | null {
  const entry = (row as { entry?: unknown } | null)?.entry as
    | {
        slot: string | null;
        event: { id: string; name: string; site: string | null } | null;
      }
    | null
    | undefined;
  if (!entry?.event) return null;
  return {
    eventId: entry.event.id,
    name: entry.event.name,
    site: entry.event.site,
    slot: entry.slot,
  };
}
