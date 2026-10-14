"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, ClipboardList, Flag } from "lucide-react";
import { useStartLabelling } from "@/components/admin/labels/start-labelling-button";
import { ProgramCrest } from "@/components/dashboard/settings/teams/program-crest";
import { TableEmptyBody } from "@/components/dashboard/shared/table-empty-body";
import { PersonAvatar } from "@/components/ui/person-avatar";
import { StatePill } from "@/components/ui/state-pill";
import { getInitials } from "@/lib/data/match-utils";
import type { LabelJobOwner } from "@/lib/data/label-overview-server";
import type { LabelJobRow } from "@/lib/data/labels-server";
import {
  countsSentence,
  groupLabelJobs,
  jobState,
  type FlagCounts,
  type LabelJobState,
  type PlayerGroup,
  type ProgramGroup,
} from "@/lib/services/labels/job-groups";
import { cn } from "@/lib/utils";

/**
 * Admin › Labels: every completed Advantage Intelligence job, in a dropdown
 * for each program and, inside it, one for each person (layout A, chosen
 * 2026-10-13 from three).
 *
 * - A program's dropdown leads with its crest; a person's with their mark.
 *   Each says what it holds in words ("2 need labelling · 1 in progress")
 *   beside its flag totals, and the ones with something still to label start
 *   open.
 * - A match is a record row, so the whole row is the way in, with the
 *   trailing chevron the table laws give a row that navigates — there is no
 *   button on it. A match nobody has started seeds its session on the click.
 * - The flag counts are the analysis's own, amber for what can move the score and
 *   grey for wrong data (`getLabelJobFlagCounts`); the status is a grey pill,
 *   and "In progress" carries its checked count.
 * - A dropdown that expands in place carries `chevron-down`, rotating 180°.
 * - The view switch is a fixed set of four, not a filter that accumulates.
 */

const VIEWS: readonly { id: LabelJobState | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "todo", label: "Needs labelling" },
  { id: "doing", label: "In progress" },
  { id: "done", label: "Labelled" },
];

/** Match · analysed · points · flagCounts · status · the row's chevron. */
const GRID =
  "grid grid-cols-[minmax(0,1fr)_170px_52px_104px_176px_13px] items-center gap-x-4";

const NO_FLAGS: FlagCounts = { amber: 0, grey: 0 };

const shortDay = (iso: string | null) => {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
};

/** "Oct 3, 2026, 2:14 PM UTC": UTC named, so server and browser agree. */
const instant = (iso: string | null) => {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return `${new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(date)} UTC`;
};

export function LabelsBoard({
  rows,
  owners,
  flagCounts = {},
}: {
  rows: readonly LabelJobRow[];
  /** Each match's owner, by match id (`getLabelJobOwners`). */
  owners: Readonly<Record<string, LabelJobOwner | undefined>>;
  /** Each match's flagCounts, by match id (`getLabelJobFlagCounts`). */
  flagCounts?: Readonly<Record<string, FlagCounts | undefined>>;
}) {
  const [view, setView] = useState<LabelJobState | "all">("all");
  const groups = useMemo(
    () => groupLabelJobs(rows, owners, view === "all" ? null : view),
    [rows, owners, view],
  );
  const total = useMemo(() => {
    const counts = { todo: 0, doing: 0, done: 0 };
    for (const row of rows) counts[jobState(row)] += 1;
    return counts;
  }, [rows]);
  const flagsOf = (jobs: readonly LabelJobRow[]): FlagCounts =>
    jobs.reduce(
      (sum, job) => {
        const counts = flagCounts[job.matchId] ?? NO_FLAGS;
        return {
          amber: sum.amber + counts.amber,
          grey: sum.grey + counts.grey,
        };
      },
      { amber: 0, grey: 0 },
    );

  if (rows.length === 0) {
    return (
      <div className="rounded-[var(--radius-card)] border border-[var(--border-card)] bg-[var(--surface-card)] px-6 shadow-[var(--shadow-card)]">
        <TableEmptyBody
          icon={ClipboardList}
          title="No completed Advantage Intelligence jobs yet"
        />
      </div>
    );
  }

  return (
    <div data-labels-board="" className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <div role="radiogroup" aria-label="Show" className="flex gap-1.5">
          {VIEWS.map((option) => {
            const active = view === option.id;
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={active}
                data-labels-view={option.id}
                onClick={() => setView(option.id)}
                className={cn(
                  "flex h-[26px] cursor-pointer items-center rounded-full px-[11px] text-[12px] transition-colors duration-200 focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
                  active ? "" : "hover:bg-[var(--surface-subtle)]",
                )}
                // As the Matches page's status pills (lifecycle-chips.tsx):
                // only the active one pins a background, so the rest wash on
                // hover.
                style={{
                  border: `1px solid var(${active ? "--border-medium" : "--border-hairline"})`,
                  background: active ? "var(--surface-subtle)" : undefined,
                  color: active ? "var(--ink-900)" : "var(--ink-600)",
                  fontWeight: active ? 500 : 400,
                }}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        <p
          data-labels-total=""
          className="tabular text-[12px] text-[var(--ink-600)]"
        >
          {countsSentence(total)}
        </p>
      </div>

      {groups.length === 0 ? (
        <p className="text-[13px] text-[var(--ink-500)]">
          No matches in this view.
        </p>
      ) : (
        groups.map((group) => (
          <ProgramDropdown
            // A new view draws each dropdown fresh, open by its own work.
            key={`${view}:${group.key}`}
            group={group}
            owners={owners}
            flagCounts={flagCounts}
            flagsOf={flagsOf}
          />
        ))
      )}
    </div>
  );
}

function ProgramDropdown({
  group,
  owners,
  flagCounts,
  flagsOf,
}: {
  group: ProgramGroup<LabelJobRow>;
  owners: Readonly<Record<string, LabelJobOwner | undefined>>;
  flagCounts: Readonly<Record<string, FlagCounts | undefined>>;
  flagsOf: (jobs: readonly LabelJobRow[]) => FlagCounts;
}) {
  const jobs = group.players.flatMap((player) => player.jobs);
  const crestUrl = owners[jobs[0]?.matchId ?? ""]?.programCrestUrl ?? null;
  return (
    <details
      data-labels-program={group.key}
      open={group.counts.todo > 0}
      className="group/program overflow-hidden rounded-[var(--radius-card)] border border-[var(--border-card)] bg-[var(--surface-card)] shadow-[var(--shadow-card)]"
    >
      <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-3.5 transition-colors duration-100 hover:bg-[var(--surface-muted)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none [&::-webkit-details-marker]:hidden">
        {group.personal ? null : (
          <ProgramCrest name={group.name} crestUrl={crestUrl} size={26} />
        )}
        <h2 className="min-w-0 flex-1 truncate text-[16px] text-[var(--ink-900)]">
          {group.name}
        </h2>
        <FlagPair counts={flagsOf(jobs)} />
        <span className="tabular shrink-0 text-[12px] text-[var(--ink-600)]">
          {countsSentence(group.counts)}
        </span>
        <ChevronDown
          className="size-[13px] shrink-0 text-[var(--ink-400)] transition-transform duration-200 group-open/program:rotate-180"
          strokeWidth={1.5}
          aria-hidden="true"
        />
      </summary>
      <div className="overflow-x-auto px-5 pb-3">
        <div className="min-w-[820px]">
          <div
            className={cn(
              GRID,
              "border-b border-[var(--border-hairline)] pt-1 pb-2 pl-[34px]",
            )}
          >
            <span className="eyebrow-sm">Match</span>
            <span className="eyebrow-sm">Analysed</span>
            <span className="eyebrow-sm">Points</span>
            <span className="eyebrow-sm">Flagged</span>
            <span className="eyebrow-sm">Status</span>
            <span aria-hidden="true" />
          </div>
          {group.players.map((player) => (
            <PersonDropdown
              key={player.key}
              player={player}
              owners={owners}
              flagCounts={flagCounts}
              flagsOf={flagsOf}
            />
          ))}
        </div>
      </div>
    </details>
  );
}

function PersonDropdown({
  player,
  owners,
  flagCounts,
  flagsOf,
}: {
  player: PlayerGroup<LabelJobRow>;
  owners: Readonly<Record<string, LabelJobOwner | undefined>>;
  flagCounts: Readonly<Record<string, FlagCounts | undefined>>;
  flagsOf: (jobs: readonly LabelJobRow[]) => FlagCounts;
}) {
  return (
    <details
      data-labels-player={player.key}
      open={player.counts.todo > 0}
      className="group/person"
    >
      <summary className="-mx-2 mt-1 flex cursor-pointer list-none items-center gap-3 rounded-[var(--radius-element)] px-2 py-2 transition-colors duration-100 hover:bg-[var(--surface-muted)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none [&::-webkit-details-marker]:hidden">
        <PersonAvatar
          initials={getInitials(player.name)}
          className="size-[26px] text-[9px]"
        />
        <h3 className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--ink-900)]">
          {player.name}
        </h3>
        <FlagPair counts={flagsOf(player.jobs)} />
        <span className="tabular shrink-0 text-[12px] text-[var(--ink-600)]">
          {countsSentence(player.counts)}
        </span>
        <ChevronDown
          className="size-[13px] shrink-0 text-[var(--ink-400)] transition-transform duration-200 group-open/person:rotate-180"
          strokeWidth={1.5}
          aria-hidden="true"
        />
      </summary>
      <div className="pl-[34px]">
        {player.jobs.map((job) => (
          <JobRow
            key={job.jobId}
            job={job}
            owner={owners[job.matchId]}
            flagCounts={flagCounts[job.matchId] ?? NO_FLAGS}
          />
        ))}
      </div>
    </details>
  );
}

/** Amber and grey flag counts, each its glyph and number; a zero is quiet. */
function FlagPair({ counts }: { counts: FlagCounts }) {
  const one = (n: number, tone: "amber" | "grey") => (
    <span
      role="img"
      aria-label={
        tone === "amber"
          ? `${n} that can move the score`
          : `${n} about the data`
      }
      className="tabular inline-flex items-center gap-1 text-[12px]"
      style={{
        color:
          n === 0
            ? "var(--ink-300)"
            : tone === "amber"
              ? "var(--warning-text)"
              : "var(--ink-600)",
      }}
    >
      <Flag className="size-[11px]" strokeWidth={1.5} aria-hidden="true" />
      {n}
    </span>
  );
  return (
    <span data-labels-flag-counts="" className="inline-flex shrink-0 gap-2.5">
      {one(counts.amber, "amber")}
      {one(counts.grey, "grey")}
    </span>
  );
}

function JobRow({
  job,
  owner,
  flagCounts,
}: {
  job: LabelJobRow;
  owner: LabelJobOwner | undefined;
  flagCounts: FlagCounts;
}) {
  const state = jobState(job);
  const opponent = owner?.opponentName ?? job.player2Name;
  const context = [owner?.event, shortDay(owner?.playedAt ?? null)]
    .filter(Boolean)
    .join(" · ");
  const analysed = instant(job.completedAt);
  const label = `${state === "todo" ? "Start labelling" : state === "doing" ? "Continue labelling" : "View"} ${owner?.playerName ?? job.player1Name} vs ${opponent}`;
  const cells = (
    <>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-[13px] font-medium text-[var(--ink-900)]">
          vs {opponent}
        </span>
        {context ? (
          <span className="truncate text-[11px] text-[var(--ink-500)]">
            {context}
          </span>
        ) : null}
      </span>
      {/* Two jobs can cover one match: the time and the job's short id are
          what tell their rows apart. */}
      <span className="flex min-w-0 flex-col">
        <span className="tabular truncate text-[12px] text-[var(--ink-700)]">
          {analysed ?? "No time"}
        </span>
        <span className="font-mono text-[11px] text-[var(--ink-500)]">
          {job.jobId.slice(0, 8)}
        </span>
      </span>
      <span className="tabular text-[13px] text-[var(--ink-900)]">
        {job.pointCount}
      </span>
      <FlagPair counts={state === "done" ? NO_FLAGS : flagCounts} />
      <span className="flex min-w-0 items-center gap-2">
        {state === "todo" ? (
          <StatePill>Needs labelling</StatePill>
        ) : state === "doing" ? (
          <>
            <StatePill outline>In progress</StatePill>
            <span className="tabular truncate text-[12px] text-[var(--ink-600)]">
              {job.session?.checked} of {job.session?.total}
            </span>
          </>
        ) : (
          <span className="text-[12px] text-[var(--ink-500)]">Labelled</span>
        )}
      </span>
      <ChevronRight
        className="size-[13px] text-[var(--ink-300)] transition-colors duration-200 group-hover/row:text-[var(--ink-900)]"
        strokeWidth={1.5}
        aria-hidden="true"
      />
    </>
  );
  const rowClass = cn(
    GRID,
    "group/row -mx-2 h-[52px] w-[calc(100%+16px)] cursor-pointer rounded-[var(--radius-element)] px-2 text-left transition-colors duration-100 hover:bg-[var(--surface-muted)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
  );
  return job.session ? (
    <Link
      href={`/admin/labels/${job.session.id}`}
      aria-label={label}
      data-labels-job={job.jobId}
      data-labels-state={state}
      className={rowClass}
    >
      {cells}
    </Link>
  ) : (
    <StartRow job={job} label={label} className={rowClass}>
      {cells}
    </StartRow>
  );
}

/** A match nobody has started: the click seeds its session, then opens it. */
function StartRow({
  job,
  label,
  className,
  children,
}: {
  job: LabelJobRow;
  label: string;
  className: string;
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
        onClick={start}
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
