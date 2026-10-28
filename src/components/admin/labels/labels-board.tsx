"use client";

import { useMemo, useState } from "react";
import { ClipboardList } from "lucide-react";
import {
  CountPills,
  FilterDivider,
  FilterMenuPill,
  WorkspaceMark,
  type FilterMenuOption,
} from "@/components/admin/admin-cells";
import {
  FlagLegend,
  LABEL_COLUMNS,
  LABEL_GRID,
  LabelJobListRow,
} from "@/components/admin/labels/board/label-job-row";
import { labelJobSeenKey } from "@/components/admin/labels/board/seen-key";
import { markAdminRowSeen } from "@/app/admin/seen-actions";
import { TableEmptyBody } from "@/components/dashboard/shared/table-empty-body";
import type {
  LabelJobOwner,
  LabelReviewRequest,
} from "@/lib/data/label-overview-server";
import type { LabelJobRow } from "@/lib/data/labels-server";
import {
  jobState,
  PERSONAL_KEY,
  PERSONAL_NAME,
  type FlagCounts,
  type LabelJobState,
} from "@/lib/services/labels/job-groups";
import { cn } from "@/lib/utils";

/**
 * Admin › Labels, "Labels B" (LabelsFlat): every completed Advantage
 * Intelligence job in one table, newest first.
 *
 * - "Requested reviews" sits on top: the jobs of a match a player has
 *   reported through "Something still wrong? Tell us" (an open `match_issue`
 *   request). They leave the section when the report is resolved or
 *   dismissed on the Requests page — not when the job is labelled, because
 *   a report almost always lands on a match that was already labelled.
 * - View pills with counts, then a Program menu; both narrow both tables.
 * - A row navigates to the label console, so it carries the chevron; a row
 *   new since the admin last looked carries the New dot until it is opened.
 *
 * The page owns the heading and lede (`app/admin/labels/page.tsx`); this
 * component starts at the filter row.
 */

type View = LabelJobState | "all";

const VIEWS: readonly { value: View; label: string }[] = [
  { value: "all", label: "All" },
  { value: "todo", label: "Needs labelling" },
  { value: "doing", label: "In progress" },
  { value: "done", label: "Labelled" },
];

const NO_FLAGS: FlagCounts = { amber: 0, grey: 0 };

/**
 * A job's open amber and grey: none once labelled; what the console last
 * counted on its session when it has been opened; before that, what the
 * analysis flagged at upload.
 */
function openOf(
  job: LabelJobRow,
  flagCounts: Readonly<Record<string, FlagCounts | undefined>>,
): FlagCounts {
  if (jobState(job) === "done") return NO_FLAGS;
  return job.session?.openCounts ?? flagCounts[job.matchId] ?? NO_FLAGS;
}

export function LabelsBoard({
  rows,
  owners,
  flagCounts = {},
  reviews = {},
  freshJobIds = [],
}: {
  /** Newest first, as `listLabelJobs` orders them. */
  rows: readonly LabelJobRow[];
  /** Each match's owner, by match id (`getLabelJobOwners`). */
  owners: Readonly<Record<string, LabelJobOwner | undefined>>;
  /** Each match's flagCounts, by match id (`getLabelJobFlagCounts`). */
  flagCounts?: Readonly<Record<string, FlagCounts | undefined>>;
  /** Open match reports, by match id (`getLabelReviewRequests`). */
  reviews?: Readonly<Record<string, LabelReviewRequest | undefined>>;
  /** Jobs that are New since this admin last looked (`lookAtSurface`). */
  freshJobIds?: readonly string[];
}) {
  const [view, setView] = useState<View>("all");
  const [program, setProgram] = useState<string>("all");
  const [opened, setOpened] = useState<ReadonlySet<string>>(() => new Set());

  const programOf = (job: LabelJobRow) =>
    owners[job.matchId]?.programId ?? PERSONAL_KEY;

  const programOptions = useMemo(() => {
    const byKey = new Map<string, FilterMenuOption<string>>();
    for (const job of rows) {
      const owner = owners[job.matchId];
      const key = owner?.programId ?? PERSONAL_KEY;
      const existing = byKey.get(key);
      if (existing) {
        existing.count = (existing.count ?? 0) + 1;
        continue;
      }
      byKey.set(key, {
        value: key,
        label:
          key === PERSONAL_KEY
            ? PERSONAL_NAME
            : (owner?.programName ?? "Unnamed program"),
        count: 1,
        mark: (
          <WorkspaceMark
            workspace={
              key === PERSONAL_KEY
                ? { kind: "personal" }
                : {
                    kind: "team",
                    name: owner?.programName ?? "Unnamed program",
                    crestUrl: owner?.programCrestUrl ?? null,
                  }
            }
          />
        ),
      });
    }
    // Programs by name, personal matches last.
    const list = [...byKey.values()].sort(
      (a, b) =>
        Number(a.value === PERSONAL_KEY) - Number(b.value === PERSONAL_KEY) ||
        a.label.localeCompare(b.label),
    );
    return [
      { value: "all", label: "All programs", count: rows.length },
      ...list,
    ] satisfies FilterMenuOption<string>[];
  }, [rows, owners]);

  const inProgram = rows.filter(
    (job) => program === "all" || programOf(job) === program,
  );
  const counts = { all: inProgram.length, todo: 0, doing: 0, done: 0 };
  for (const job of inProgram) counts[jobState(job)] += 1;

  const visible = inProgram.filter(
    (job) => view === "all" || jobState(job) === view,
  );
  const reviewRows = visible.filter((job) => reviews[job.matchId]);
  const listRows = visible.filter((job) => !reviews[job.matchId]);

  const fresh = new Set(freshJobIds.filter((id) => !opened.has(id)));
  const open = (jobId: string) => {
    setOpened((prev) => (prev.has(jobId) ? prev : new Set(prev).add(jobId)));
    void markAdminRowSeen("labels", labelJobSeenKey(jobId)).catch(() => {});
  };

  const table = (jobs: readonly LabelJobRow[], emptyText: string) => (
    <div className="overflow-x-auto rounded-[var(--radius-card)] border border-[var(--border-card)] bg-[var(--surface-card)] shadow-[var(--shadow-card)]">
      <div className="min-w-[960px] px-6 pt-0.5 pb-1.5">
        <div
          className={cn(
            LABEL_GRID,
            "border-b border-[var(--border-hairline)] pt-3.5 pb-2.5",
          )}
        >
          {LABEL_COLUMNS.map((column) => (
            <span key={column} className="eyebrow-sm">
              {column}
            </span>
          ))}
          <span aria-hidden="true" />
        </div>
        {jobs.length === 0 ? (
          <p className="py-6 text-[13px] text-[var(--ink-500)]">{emptyText}</p>
        ) : (
          jobs.map((job) => (
            <LabelJobListRow
              key={job.jobId}
              job={job}
              owner={owners[job.matchId]}
              flags={openOf(job, flagCounts)}
              fresh={fresh.has(job.jobId)}
              onOpen={() => open(job.jobId)}
            />
          ))
        )}
      </div>
    </div>
  );

  return (
    <div data-labels-board="" className="flex flex-col">
      {rows.length === 0 ? (
        <div className="rounded-[var(--radius-card)] border border-[var(--border-card)] bg-[var(--surface-card)] px-6 shadow-[var(--shadow-card)]">
          <TableEmptyBody
            icon={ClipboardList}
            title="No completed Advantage Intelligence jobs yet"
          />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <CountPills
              options={VIEWS.map((option) => ({
                ...option,
                count: counts[option.value],
              }))}
              value={view}
              onChange={setView}
            />
            <FilterDivider />
            <FilterMenuPill
              label="Program"
              options={programOptions}
              value={program}
              onChange={setProgram}
              width={260}
            />
            <span className="flex-1" />
            <FlagLegend />
          </div>

          {reviewRows.length > 0 ? (
            <section aria-labelledby="labels-reviews" className="mt-6">
              <div className="flex items-baseline gap-2.5">
                <h2
                  id="labels-reviews"
                  className="m-0 text-[13px] font-medium text-[var(--ink-900)]"
                >
                  Requested reviews
                </h2>
                <span className="text-[12px] text-[var(--ink-600)]">
                  A player is waiting on these
                </span>
              </div>
              <div className="mt-2.5">
                {table(reviewRows, "No requested reviews in this view.")}
              </div>
            </section>
          ) : null}

          <section aria-labelledby="labels-all" className="mt-6">
            <div className="flex items-baseline gap-2.5">
              <h2
                id="labels-all"
                className="m-0 text-[13px] font-medium text-[var(--ink-900)]"
              >
                Newest first
              </h2>
              <span className="text-[12px] text-[var(--ink-600)]">
                {fresh.size > 0
                  ? "New ones are marked until you open them"
                  : "Nothing new since you last looked"}
              </span>
            </div>
            <div className="mt-2.5">
              {table(listRows, "No matches in this view.")}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
