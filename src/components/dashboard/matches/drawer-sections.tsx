"use client";

import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { TriangleAlert } from "lucide-react";
import { shortName } from "@/lib/data/match-utils";
import { providers } from "@/lib/providers";
import {
  ANALYSIS_LABEL,
  isAnalysisFailed,
  isInFlight,
  type AnalysisStatus,
  type MatchAnalysis,
  type RecoveryClass,
} from "@/lib/data/match-analysis";
import { addVideoHref } from "@/lib/matches/add-video-href";
import { advButton } from "@/lib/ui/adv-button";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import type { ScoreLineSet } from "@/lib/ui/score-format";
import { ResultMark } from "@/components/dashboard/result-mark";
import { ScoreLine } from "@/components/dashboard/score-line";
import {
  DRAWER_NO_ACTION_BODY,
  WAIT_OR_ASK_VARIANTS,
  byClass,
  waitOrAskVariant,
} from "@/components/dashboard/matches/analysis-failure-copy";
import {
  LABEL_INK,
  StepMark,
} from "@/components/dashboard/shared/vertical-steps";
import {
  drawerAnalysisStepsView,
  type DrawerAnalysisStepBody,
  type DrawerAnalysisStepView,
} from "@/components/dashboard/matches/match-detail/analysis-steps";

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
 * The recovery class a failed drawer row reads, when there is one.
 *
 * Every failed row the loader or the live patch projects carries a class
 * (`recoveryFields()`); the fallback only covers a projection that predates
 * it — the same fallback the match page's progress card uses. Null for a row
 * whose status has not failed — a stalled `uploaded` row included. A stalled
 * hand-off is not in flight to the drawers any more: `DrawerAnalysisSteps`
 * draws it as the stopped step (from `drawerAnalysisStepsView()`, which reads
 * the clock this function has no access to), and the footer's action is
 * `DrawerRecoveryAction` with `stalled` and that view's `failure.recovery`.
 */
export function drawerRecovery(
  status: AnalysisStatus | null | undefined,
  recovery: RecoveryClass | null | undefined,
): RecoveryClass | null {
  if (!status || !isAnalysisFailed(status)) return null;
  return (
    recovery ?? (status === "derivation_failed" ? "stats_unavailable" : "retry")
  );
}

/** A recovery class's title and drawer body, with `wait_or_ask`'s variant. */
function drawerCopy(
  recovery: RecoveryClass,
  errorCode: string | null | undefined,
  attemptsUsed: number | null | undefined,
): { title: string; drawerBody: string } {
  // byClass.wait_or_ask is only the allowance default; the row's error code
  // picks the variant that actually applies.
  if (recovery === "wait_or_ask") {
    return WAIT_OR_ASK_VARIANTS[waitOrAskVariant(errorCode, attemptsUsed ?? 1)];
  }
  return byClass[recovery];
}

/**
 * The analysis state, when there is one: the in-flight label with a line on
 * when numbers arrive, or the failed block (`role="alert"`) that reads the
 * row's recovery class. Draws nothing for a settled match.
 *
 * A viewer who can act on the row reads headline `note ?? title`, then the
 * class's drawer body. Anyone else reads only the class title and "The match
 * page has the details." — no stored note, no promise about retrying, since
 * the footer offers them nothing. The action itself is the footer's
 * `DrawerRecoveryAction`, not this block's.
 */
export function AnalysisNotice({
  status,
  recovery,
  note,
  errorCode,
  attemptsUsed,
  canAct,
}: {
  status: AnalysisStatus | null | undefined;
  /** `drawerRecovery()`'s answer: set on a failed row, null otherwise. */
  recovery: RecoveryClass | null | undefined;
  /** The stored note `showsStoredNote()` let through — never the raw
   * `failNote`, which can be a writer string or the reconciler's reason. */
  note?: string | null;
  /** `wait_or_ask`'s variant inputs; unread by every other class. */
  errorCode?: string | null;
  attemptsUsed?: number | null;
  /** The viewer may act on this row — the drawer's own access clause. */
  canAct: boolean;
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

  if (isAnalysisFailed(status) && recovery) {
    const copy = drawerCopy(recovery, errorCode, attemptsUsed);
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
            {canAct ? (note ?? copy.title) : copy.title}
          </p>
          <p className="text-[12px] leading-[1.5] text-[var(--ink-700)]">
            {canAct ? copy.drawerBody : DRAWER_NO_ACTION_BODY}
          </p>
        </div>
      </div>
    );
  }

  return null;
}

/**
 * The drawers' analysis section (`Drawer-*` frames): an "Analysis" eyebrow
 * over the match page's four steps, drawn compact — 16px marks, 12px labels,
 * tighter rhythm — from `drawerAnalysisStepsView()`. Only the running or
 * stopped step carries text; the stopped one sits in a single `role="alert"`,
 * or `role="status"` for a stalled hand-off, where nothing has failed yet.
 * The recovery action is the footer's `DrawerRecoveryAction`, not this.
 *
 * Draws nothing for a settled match (the view is null).
 */
export function DrawerAnalysisSteps({
  analysis,
  now,
  canAct,
}: {
  analysis: MatchAnalysis | null | undefined;
  /** The stall clock — `null` until the caller's first tick. */
  now: number | null;
  /** The viewer may act on this row — the drawer's own access clause. */
  canAct: boolean;
}) {
  const view = analysis ? drawerAnalysisStepsView(analysis, now, canAct) : null;
  if (!view) return null;

  return (
    <div className="flex flex-col gap-3">
      <span className="text-[10px] leading-none font-medium tracking-[1.6px] text-[var(--ink-400)] uppercase">
        Analysis
      </span>
      <ol className="flex flex-col" aria-label="Progress">
        {view.steps.map((step, index) => (
          <DrawerStep
            key={step.key}
            step={step}
            last={index === view.steps.length - 1}
          />
        ))}
      </ol>
    </div>
  );
}

const DRAWER_STEP_LINE = "text-[12px] leading-[18px]";

/**
 * One compact row. Built here rather than as a `VerticalStep` size variant so
 * the page column and the wizard keep their exact markup; the mark is the
 * shared `StepMark`, and the label ink the shared `LABEL_INK`.
 */
function DrawerStep({
  step,
  last,
}: {
  step: DrawerAnalysisStepView;
  last: boolean;
}) {
  return (
    <li
      className="flex gap-3"
      aria-current={step.state === "now" ? "step" : undefined}
    >
      <div className="flex w-4 shrink-0 flex-col items-center pt-px">
        <StepMark state={step.state} />
        {!last && (
          <div
            aria-hidden="true"
            className={cn(
              "my-1 w-px flex-1",
              step.state === "done"
                ? "bg-[var(--ink-200)]"
                : "bg-[var(--border-hairline)]",
            )}
          />
        )}
      </div>
      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col gap-1",
          last ? "" : step.body ? "pb-4" : "pb-3",
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <span
            className={DRAWER_STEP_LINE}
            style={{ color: LABEL_INK[step.state] }}
          >
            {step.label}
          </span>
          {step.value && (
            <span
              className={cn(
                DRAWER_STEP_LINE,
                "text-[var(--ink-700)] tabular-nums",
              )}
            >
              {step.value}
            </span>
          )}
        </div>
        {step.body && <DrawerStepBody body={step.body} />}
      </div>
    </li>
  );
}

function DrawerStepBody({ body }: { body: DrawerAnalysisStepBody }) {
  if (body.kind === "note") {
    return (
      <p className={cn(DRAWER_STEP_LINE, "text-[var(--ink-600)]")}>
        {body.text}
      </p>
    );
  }
  return (
    <div
      role={body.stalled ? "status" : "alert"}
      className="flex flex-col gap-0.5"
    >
      <p className={cn(DRAWER_STEP_LINE, "font-medium text-[var(--ink-900)]")}>
        {body.headline}
      </p>
      <p className={cn(DRAWER_STEP_LINE, "text-[var(--ink-600)]")}>
        {body.body}
      </p>
    </div>
  );
}

/**
 * Does a failed row's recovery class have something to press in a drawer?
 * `byClass`'s `action: null` classes (`wait_or_ask`, `stats_unavailable`)
 * have nothing, and a retry or rebuild needs a job to act on — so a caller
 * never draws an empty footer slot, nor lets an absent action take the
 * footer's primary from "View match".
 */
export function recoveryHasAction(
  recovery: RecoveryClass | null | undefined,
  jobId: string | null | undefined,
): recovery is RecoveryClass {
  if (!recovery || byClass[recovery].action === null) return false;
  if (recovery === "retry" || recovery === "rederive") return Boolean(jobId);
  return true;
}

/**
 * A failed row's recovery action in a peek drawer's footer — the one
 * definition both drawers draw (`match-drawer.tsx`, `event-line-drawer.tsx`).
 * Each is a full-width `advButton(variant, "md")`, the styling the drawers'
 * "Retry" has always had; the caller picks `variant` from its footer rule so
 * a footer never holds two primaries.
 *
 * - `retry` — "Retry", POSTed to `/api/splitstep/jobs/<jobId>/resubmit`.
 * - `retry` on a stalled hand-off (`stalled`) — "Try again", the free
 *   re-submission: `{ jobId }` POSTed to `/api/splitstep/jobs`, exactly the
 *   request `RetrySubmission` makes on the match page. Nothing was sent, so
 *   there is no vendor job to resubmit.
 * - `rederive` — "Rebuild statistics", POSTed to `…/rederive`.
 * - `upload_again` / `fix_recording` — the wizard link `byClass` names.
 *
 * `wait_or_ask`, `stats_unavailable` or no class draw nothing. The routes
 * refuse anyone who may not act, so a caller gates only on what it knows.
 */
export function DrawerRecoveryAction({
  recovery,
  jobId,
  matchId,
  variant,
  stalled = false,
}: {
  recovery: RecoveryClass | null | undefined;
  jobId: string | null | undefined;
  matchId: string;
  variant: "primary" | "outline";
  /** A hand-off that never happened (`isSubmitStalled`), not a failed job. */
  stalled?: boolean;
}) {
  if (!recoveryHasAction(recovery, jobId)) return null;

  if (recovery === "retry" && jobId && stalled) {
    return (
      <DrawerRequestButton
        label="Try again"
        pendingLabel="Sending…"
        url="/api/splitstep/jobs"
        init={{
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // The whole payload: the route reads the rest back from the row.
          body: JSON.stringify({ jobId }),
        }}
        variant={variant}
      />
    );
  }

  if (recovery === "retry" && jobId) {
    return (
      <DrawerRequestButton
        label="Retry"
        pendingLabel="Retrying…"
        url={`/api/splitstep/jobs/${jobId}/resubmit`}
        variant={variant}
      />
    );
  }

  if (recovery === "rederive" && jobId) {
    return (
      <DrawerRequestButton
        label={byClass.rederive.action ?? "Rebuild statistics"}
        pendingLabel="Rebuilding…"
        url={`/api/splitstep/jobs/${jobId}/rederive`}
        variant={variant}
      />
    );
  }

  if (recovery === "upload_again" || recovery === "fix_recording") {
    return (
      <Link
        href={addVideoHref(matchId)}
        className={cn(advButton(variant, "md"), "w-full")}
      >
        {byClass[recovery].action}
      </Link>
    );
  }

  return null;
}

/**
 * The drawers' POST button: pending label while the request runs, the
 * route's refusal verbatim under it, and a refresh once it goes through.
 */
function DrawerRequestButton({
  label,
  pendingLabel,
  url,
  init = { method: "POST" },
  variant,
}: {
  label: string;
  pendingLabel: string;
  url: string;
  /** The request; a bare POST unless the route wants a body. */
  init?: RequestInit;
  variant: "primary" | "outline";
}) {
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
            const response = await fetch(url, init).catch(() => null);
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
        className={cn(advButton(variant, "md"), "w-full")}
      >
        {pending ? pendingLabel : label}
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
