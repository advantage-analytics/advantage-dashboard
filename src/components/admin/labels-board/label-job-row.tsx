"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { assignLabelSessionAction } from "@/app/admin/labels/actions";
import {
  AdminMatchCell,
  RowChevron,
  TwoLineDate,
  WorkspaceCell,
} from "@/components/admin/admin-cells";
import { useStartLabelling } from "@/components/admin/labels/start-labelling-button";
import { FloatMenu, FloatMenuItem } from "@/components/ui/float-menu";
import { StatePill } from "@/components/ui/state-pill";
import type { LabelJobOwner } from "@/lib/data/label-overview-server";
import type { LabelJobRow } from "@/lib/data/labels-server";
import type { Labeller } from "@/lib/services/labels/assign-session";
import {
  jobState,
  jobStatusText,
  type FlagCounts,
} from "@/lib/services/labels/job-groups";
import { actionRejected } from "@/lib/ui/action-rejected";
import { cn } from "@/lib/utils";

/**
 * One row of the Labels list (LabelsFlat, "Labels B"): Match · Workspace ·
 * Analyzed · Points · Flags · Status · Assigned · chevron. A match is a
 * record row, so the whole row is the way in and carries the chevron the
 * table laws give a row that navigates; a match nobody has started seeds its
 * session on the click.
 *
 * A row with a session carries the Assign menu in its Assigned column. The
 * menu is NOT inside the row's `Link`: it sits in a second grid laid over the
 * row on the same template, so a click on it — or on the menu, which Radix
 * portals but React still bubbles up its own tree — never reaches the link.
 */

/** The grid the header and every row share. */
export const LABEL_GRID =
  "grid grid-cols-[minmax(260px,1fr)_170px_96px_56px_88px_170px_150px_13px] items-center gap-x-4";

export const LABEL_COLUMNS = [
  "Match",
  "Workspace",
  "Analyzed",
  "Points",
  "Flags",
  "Status",
  "Assigned",
] as const;

export function LabelJobListRow({
  job,
  owner,
  openFlags,
  fresh,
  onOpen,
  labellers = [],
}: {
  job: LabelJobRow;
  owner: LabelJobOwner | undefined;
  /** The open amber and grey flags (see `openOf` in labels-board). */
  openFlags: FlagCounts;
  fresh: boolean;
  /** Ran on the click, before navigating: clears the New dot. */
  onOpen: () => void;
  /** Who the Assign menu offers (`listLabellers`). */
  labellers?: readonly Labeller[];
}) {
  const state = jobState(job);
  const player = owner?.playerName ?? job.player1Name;
  const opponent = owner?.opponentName ?? job.player2Name;
  const verb =
    state === "todo"
      ? "Start labelling"
      : job.session?.status === "submitted"
        ? "Review"
        : state === "doing"
          ? "Continue labelling"
          : "View";
  const label = `${verb} ${player} vs ${opponent}`;

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
          {jobStatusText(job)}
        </StatePill>
      </span>
      {/* Assigned: the Assign menu is laid over this cell (see the overlay
          below), outside the link. */}
      <span aria-hidden="true" />
      <RowChevron />
    </>
  );

  const rowClass = cn(
    LABEL_GRID,
    "-mx-4 h-[60px] w-[calc(100%+32px)] cursor-pointer rounded-[var(--radius-element)] px-4 text-left transition-colors duration-100 hover:bg-[var(--surface-muted)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
  );

  return job.session ? (
    <div className="group relative">
      <Link
        href={`/admin/labels/${job.session.id}`}
        aria-label={label}
        data-labels-job={job.jobId}
        data-labels-state={state}
        onClick={onOpen}
        className={cn(rowClass, "group-hover:bg-[var(--surface-muted)]")}
      >
        {cells}
      </Link>
      {/* Same template as the row, empty but for the Assigned cell; it lets
          pointer events through everywhere else, so the link stays the row. */}
      <div
        className={cn(
          LABEL_GRID,
          "pointer-events-none absolute inset-y-0 -left-4 w-[calc(100%+32px)] px-4",
        )}
      >
        <span className="col-start-7 flex min-w-0 flex-col items-start justify-center">
          <AssignMenu
            key={job.session.id}
            sessionId={job.session.id}
            frozen={job.session.status === "complete"}
            initial={job.session.assignedTo}
            labellers={labellers}
          />
        </span>
      </div>
    </div>
  ) : (
    <StartRow job={job} label={label} className={rowClass} onOpen={onOpen}>
      {cells}
    </StartRow>
  );
}

/**
 * The Assigned cell's control: a pill trigger on the shared `FloatMenu` (the
 * `FilterMenuPill` shape) listing "Unassigned" and every labeller. It reads
 * "Assign" until someone is, then their name. A complete session is frozen
 * for assignment too, so it shows the name as text, or the dash.
 */
function AssignMenu({
  sessionId,
  frozen,
  initial,
  labellers,
}: {
  sessionId: string;
  frozen: boolean;
  initial: { id: string; name: string } | null;
  labellers: readonly Labeller[];
}) {
  const [assignee, setAssignee] = useState(initial);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (frozen) {
    return assignee ? (
      <span className="pointer-events-auto max-w-full truncate text-[13px] text-[var(--ink-700)]">
        <span className="sr-only">Assigned to </span>
        {assignee.name}
      </span>
    ) : (
      <span
        aria-label="Unassigned"
        className="pointer-events-auto text-[12px] text-[var(--ink-400)]"
      >
        —
      </span>
    );
  }

  // Someone assigned before their flag was taken away still shows as chosen.
  const people =
    assignee && !labellers.some((person) => person.id === assignee.id)
      ? [...labellers, { ...assignee, email: "" }]
      : labellers;

  const choose = (next: { id: string; name: string } | null) => {
    setOpen(false);
    if ((next?.id ?? null) === (assignee?.id ?? null)) return;
    const before = assignee;
    setAssignee(next);
    setError(null);
    startTransition(async () => {
      const result = await assignLabelSessionAction(
        sessionId,
        next?.id ?? null,
      ).catch(actionRejected);
      if ("error" in result) {
        setAssignee(before);
        setError(result.error);
        return;
      }
      setAssignee(result.assignedTo);
    });
  };

  return (
    <>
      <FloatMenu
        open={open}
        onOpenChange={setOpen}
        label="Assign to a labeller"
        align="start"
        width={240}
        className="max-h-[360px] overflow-y-auto"
        trigger={
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={open}
            aria-busy={isPending}
            data-labels-assign={sessionId}
            className={cn(
              "pointer-events-auto inline-flex h-7 max-w-full cursor-pointer items-center gap-1.5 rounded-full border pr-2.5 pl-3 text-[12px] whitespace-nowrap transition-colors duration-200 hover:bg-[var(--surface-subtle)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
              assignee || open
                ? "border-[var(--border-medium)]"
                : "border-[var(--border-hairline)]",
              assignee
                ? "bg-[var(--surface-subtle)]"
                : "bg-[var(--surface-card)]",
            )}
          >
            {assignee ? (
              <span className="truncate font-medium text-[var(--ink-900)]">
                <span className="sr-only">Assigned to </span>
                {assignee.name}
              </span>
            ) : (
              <span className="text-[var(--ink-600)]">Assign</span>
            )}
            <ChevronDown
              className={cn(
                "size-3 shrink-0 text-[var(--ink-500)] transition-transform duration-200",
                open && "rotate-180",
              )}
              strokeWidth={1.8}
              aria-hidden="true"
            />
          </button>
        }
      >
        <FloatMenuItem
          label="Unassigned"
          chosen={assignee === null}
          onSelect={() => choose(null)}
        />
        {people.map((person) => (
          <FloatMenuItem
            key={person.id}
            label={person.name}
            description={person.email || undefined}
            chosen={assignee?.id === person.id}
            onSelect={() => choose({ id: person.id, name: person.name })}
          />
        ))}
      </FloatMenu>
      {error ? (
        <p
          role="alert"
          className="pointer-events-auto mt-0.5 line-clamp-2 max-w-full text-[11px] leading-[1.3] text-[var(--danger)]"
        >
          {error}
        </p>
      ) : null}
    </>
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
