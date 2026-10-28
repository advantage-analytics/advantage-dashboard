"use client";

import Link from "next/link";
import {
  AdminMatchCell,
  RowChevron,
  TwoLineDate,
  WorkspaceCell,
} from "@/components/admin/admin-cells";
import { useStartLabelling } from "@/components/admin/labels/start-labelling-button";
import { StatePill } from "@/components/ui/state-pill";
import type { LabelJobOwner } from "@/lib/data/label-overview-server";
import type { LabelJobRow } from "@/lib/data/labels-server";
import { jobState, type FlagCounts } from "@/lib/services/labels/job-groups";
import { cn } from "@/lib/utils";

/**
 * One row of the Labels list (LabelsFlat, "Labels B"): Match · Workspace ·
 * Analyzed · Points · Flags · Status · chevron. A match is a record row, so
 * the whole row is the way in and carries the chevron the table laws give a
 * row that navigates; a match nobody has started seeds its session on the
 * click.
 */

/** The grid the header and every row share. */
export const LABEL_GRID =
  "grid grid-cols-[minmax(260px,1fr)_170px_96px_56px_88px_170px_13px] items-center gap-x-4";

export const LABEL_COLUMNS = [
  "Match",
  "Workspace",
  "Analyzed",
  "Points",
  "Flags",
  "Status",
] as const;

export function LabelJobListRow({
  job,
  owner,
  openFlags,
  fresh,
  onOpen,
}: {
  job: LabelJobRow;
  owner: LabelJobOwner | undefined;
  /** The open amber and grey flags (see `openOf` in labels-board). */
  openFlags: FlagCounts;
  fresh: boolean;
  /** Ran on the click, before navigating: clears the New dot. */
  onOpen: () => void;
}) {
  const state = jobState(job);
  const player = owner?.playerName ?? job.player1Name;
  const opponent = owner?.opponentName ?? job.player2Name;
  const label = `${state === "todo" ? "Start labelling" : state === "doing" ? "Continue labelling" : "View"} ${player} vs ${opponent}`;

  const cells = (
    <>
      <AdminMatchCell
        player={player}
        opponent={opponent}
        photoUrl={owner?.playerPhotoUrl ?? null}
        won={owner?.won ?? null}
        sets={owner?.sets ?? []}
        fresh={fresh}
      />
      <WorkspaceCell
        workspace={
          owner?.programId
            ? {
                kind: "team",
                name: owner.programName ?? "Unnamed program",
                crestUrl: owner.programCrestUrl,
              }
            : { kind: "personal" }
        }
      />
      <TwoLineDate at={job.completedAt} fresh={fresh} />
      <span className="tabular text-[13px] text-[var(--ink-700)]">
        {job.pointCount}
      </span>
      <FlagChips counts={openFlags} />
      <span className="flex min-w-0 items-center">
        <StatePill className="max-w-full truncate">
          {state === "todo"
            ? "Needs labelling"
            : state === "doing"
              ? `In progress · ${job.session?.checked ?? 0} of ${job.session?.total ?? 0}`
              : "Labelled"}
        </StatePill>
      </span>
      <RowChevron />
    </>
  );

  const rowClass = cn(
    LABEL_GRID,
    "-mx-4 h-[60px] w-[calc(100%+32px)] cursor-pointer rounded-[var(--radius-element)] px-4 text-left transition-colors duration-100 hover:bg-[var(--surface-muted)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
  );

  return job.session ? (
    <Link
      href={`/admin/labels/${job.session.id}`}
      aria-label={label}
      data-labels-job={job.jobId}
      data-labels-state={state}
      onClick={onOpen}
      className={rowClass}
    >
      {cells}
    </Link>
  ) : (
    <StartRow job={job} label={label} className={rowClass} onOpen={onOpen}>
      {cells}
    </StartRow>
  );
}

/** A match nobody has started: the click seeds its session, then opens it. */
function StartRow({
  job,
  label,
  className,
  onOpen,
  children,
}: {
  job: LabelJobRow;
  label: string;
  className: string;
  onOpen: () => void;
  children: React.ReactNode;
}) {
  const { start, isPending, error } = useStartLabelling(job.jobId);
  return (
    <>
      <button
        type="button"
        aria-label={label}
        aria-busy={isPending}
        disabled={isPending}
        data-labels-job={job.jobId}
        data-labels-state="todo"
        onClick={() => {
          onOpen();
          start();
        }}
        className={cn(className, "disabled:cursor-progress")}
      >
        {children}
      </button>
      {error ? (
        <p role="alert" className="pb-2 text-[11px] text-[var(--danger)]">
          {error}
        </p>
      ) : null}
    </>
  );
}

/**
 * Amber (can change the score) and grey (wrong data) as two small count
 * chips; a zero draws nothing, and a match with neither reads as the
 * unmeasured-or-none dash.
 */
export function FlagChips({ counts }: { counts: FlagCounts }) {
  if (!counts.amber && !counts.grey) {
    return (
      <span
        aria-label="No open flags"
        className="text-[12px] text-[var(--ink-400)]"
      >
        —
      </span>
    );
  }
  const chip = (n: number, tone: "amber" | "grey") => (
    <span
      role="img"
      aria-label={
        tone === "amber"
          ? `${n} open that can change the score`
          : `${n} open about the data`
      }
      className={cn(
        "tabular inline-flex h-5 min-w-[22px] items-center justify-center rounded-[4px] px-1.5 text-[11px] font-medium",
        tone === "amber"
          ? "bg-[var(--warning-border)] text-[var(--warning-text)]"
          : "bg-[var(--ink-100)] text-[var(--ink-700)]",
      )}
    >
      {n}
    </span>
  );
  return (
    <span data-labels-flag-counts="" className="inline-flex gap-1.5">
      {counts.amber ? chip(counts.amber, "amber") : null}
      {counts.grey ? chip(counts.grey, "grey") : null}
    </span>
  );
}

/** The legend the filter row ends with: what amber and grey mean. */
export function FlagLegend() {
  return (
    <span className="inline-flex items-center gap-3.5 text-[12px] text-[var(--ink-600)]">
      <span className="inline-flex items-center gap-1.5">
        <i
          aria-hidden="true"
          className="block size-2 rounded-[2px] bg-[var(--warning-border)]"
        />
        Can change the score
      </span>
      <span className="inline-flex items-center gap-1.5">
        <i
          aria-hidden="true"
          className="block size-2 rounded-[2px] bg-[var(--ink-300)]"
        />
        Wrong data
      </span>
    </span>
  );
}
