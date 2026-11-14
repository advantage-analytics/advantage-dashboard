"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AdminLaneRow,
  FlagLegend,
  LABEL_COLUMNS,
  LABEL_GRID,
  LabelJobListRow,
  type AdminLane,
} from "@/components/admin/labels-board/label-job-row";
import { labelJobSeenKey } from "@/components/admin/labels-board/seen-key";
import {
  Lane,
  LaneEmpty,
  TODO_VISIBLE,
  laneCount,
} from "@/components/label/label-board";
import { markAdminRowSeen } from "@/app/admin/seen-actions";
import type { LabelJobOwner } from "@/lib/data/label-overview-server";
import type {
  AdminLabelBoard,
  AdminLabelBoardRow,
} from "@/lib/data/label-queue-server";
import type { LabelJobRow } from "@/lib/data/labels-server";
import type { Labeller } from "@/lib/services/labels/assign-session";
import { jobState, type FlagCounts } from "@/lib/services/labels/job-groups";
import { LABEL_QUEUE_FROM } from "@/lib/services/labels/queue";
import { cn } from "@/lib/utils";

/**
 * Admin › Labels (AdminAudit artboard): the labeller queue in lanes — To do,
 * In progress, Published, to check, and Submitted only while it has rows (the
 * sessions handed in before submit published) — each a quiet well of white
 * rows with its "N matches · H.HH h" count. The lanes
 * are `loadAdminLabelBoard()`'s, so they hold only the queue: matches
 * analysed on or after `LABEL_QUEUE_FROM`. Older ones are labelled from
 * Admin › Matches, and the line under the lanes says so.
 *
 * Every row opens its match for the admin (`AdminLaneRow`); a row with a
 * session keeps the Assign menu. `RequestedReviews`, above the lanes on the
 * page, is the list of matches a player has reported, which are usually
 * published and so off the queue.
 *
 * The page owns the heading, the lede and the Pay report link
 * (`app/admin/labels/page.tsx`).
 */

/** "October 29, 2026" — the queue's first day, for the line under the lanes. */
const QUEUE_FROM_TEXT = new Date(LABEL_QUEUE_FROM).toLocaleDateString("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

const LANES: readonly {
  lane: AdminLane;
  id: string;
  title: string;
  empty: string;
  /** A line under the lane's rows. */
  foot?: string;
  /** Drawn only while it has rows. */
  onlyWithRows?: boolean;
}[] = [
  {
    lane: "todo",
    id: "admin-labels-todo",
    title: "To do",
    empty: "Nothing is waiting to be labelled.",
  },
  {
    lane: "inProgress",
    id: "admin-labels-in-progress",
    title: "In progress",
    empty: "Nobody is labelling a match.",
  },
  {
    lane: "toCheck",
    id: "admin-labels-to-check",
    title: "Published, to check",
    empty: "Nothing published is waiting for a check.",
    foot: "These are already live for the player. Matches you publish yourself skip this list.",
  },
  {
    // Sessions handed in before submit published; it empties out.
    lane: "submitted",
    id: "admin-labels-submitted",
    title: "Submitted",
    empty: "Nothing has been submitted.",
    onlyWithRows: true,
  },
];

/** Clears the job's New mark for this admin; never blocks the open. */
function markOpened(jobId: string) {
  void markAdminRowSeen("labels", labelJobSeenKey(jobId)).catch(() => {});
}

function LaneRows({
  lane,
  rows,
  now,
  labellers,
}: {
  lane: AdminLane;
  rows: readonly AdminLabelBoardRow[];
  now: number;
  labellers: readonly Labeller[];
}) {
  const [expanded, setExpanded] = useState(false);
  // Only To do runs long; the other lanes are as long as the team.
  const visible =
    lane === "todo" && !expanded ? rows.slice(0, TODO_VISIBLE) : rows;
  const hidden = rows.length - visible.length;
  return (
    <>
      <div className="flex flex-col gap-1">
        {visible.map((row) => (
          <AdminLaneRow
            key={row.jobId}
            row={row}
            lane={lane}
            now={now}
            labellers={labellers}
            onOpen={() => markOpened(row.jobId)}
          />
        ))}
      </div>
      {hidden > 0 ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="self-start rounded-[var(--radius-element)] px-3 pt-1 pb-2 text-[12px] font-medium text-[var(--ink-700)] outline-none hover:text-[var(--ink-900)] focus-visible:shadow-[var(--focus-ring)]"
        >
          Show {hidden} more
        </button>
      ) : null}
    </>
  );
}

export function LabelsBoard({
  board,
  now,
  labellers = [],
}: {
  board: AdminLabelBoard;
  /** Epoch ms, read once on the server, for every due text. */
  now: number;
  /** Who the Assign menu offers (`listLabellers`). */
  labellers?: readonly Labeller[];
}) {
  return (
    <div data-labels-board="" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start gap-4">
        {LANES.map(({ lane, id, title, empty, foot, onlyWithRows }) => {
          const rows = board[lane];
          if (onlyWithRows && rows.length === 0) return null;
          return (
            <Lane key={id} id={id} title={title} count={laneCount(rows)}>
              {rows.length === 0 ? (
                <LaneEmpty>{empty}</LaneEmpty>
              ) : (
                <LaneRows
                  lane={lane}
                  rows={rows}
                  now={now}
                  labellers={labellers}
                />
              )}
              {foot ? (
                <p className="px-3 pb-2 text-[12px] leading-[1.5] text-[var(--ink-500)]">
                  {foot}
                </p>
              ) : null}
            </Lane>
          );
        })}
      </div>
      <p className="text-[12px] text-[var(--ink-500)]">
        The board shows matches analysed from {QUEUE_FROM_TEXT}. Label older
        ones from{" "}
        <Link
          href="/admin/matches"
          className="font-medium text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)]"
        >
          Matches
        </Link>
        .
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Requested reviews
 * ---------------------------------------------------------------------- */

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

/**
 * "Requested reviews": the jobs of a match a player has reported through
 * "Something still wrong? Tell us" (an open `match_issue` request). They
 * leave the section when the report is resolved or dismissed on the Requests
 * page — not when the job is labelled, because a report almost always lands
 * on a match that was already labelled, which is why these are not lane rows.
 * Draws nothing when no report is open.
 */
export function RequestedReviews({
  rows,
  owners,
  flagCounts = {},
  freshJobIds = [],
  labellers = [],
}: {
  /** The reported matches' jobs (`listLabelJobs`), newest first. */
  rows: readonly LabelJobRow[];
  /** Each match's owner, by match id (`getLabelJobOwners`). */
  owners: Readonly<Record<string, LabelJobOwner | undefined>>;
  /** Each match's flagCounts, by match id (`getLabelJobFlagCounts`). */
  flagCounts?: Readonly<Record<string, FlagCounts | undefined>>;
  /** Jobs that are New since this admin last looked (`lookAtSurface`). */
  freshJobIds?: readonly string[];
  /** Who a session can be assigned to (`listLabellers`). */
  labellers?: readonly Labeller[];
}) {
  const [opened, setOpened] = useState<ReadonlySet<string>>(() => new Set());
  if (rows.length === 0) return null;

  const fresh = new Set(freshJobIds.filter((id) => !opened.has(id)));
  const open = (jobId: string) => {
    setOpened((prev) => (prev.has(jobId) ? prev : new Set(prev).add(jobId)));
    markOpened(jobId);
  };

  return (
    <section aria-labelledby="labels-reviews" className="flex flex-col">
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <h2
          id="labels-reviews"
          className="m-0 text-[13px] font-semibold text-[var(--ink-900)]"
        >
          Requested reviews
        </h2>
        <span className="text-[12px] text-[var(--ink-600)]">
          A player is waiting on these
        </span>
        <span className="flex-1" />
        <FlagLegend />
      </div>
      <div className="mt-2.5 overflow-x-auto rounded-[var(--radius-card)] border border-[var(--border-card)] bg-[var(--surface-card)] shadow-[var(--shadow-card)]">
        <div className="min-w-[1120px] px-6 pt-0.5 pb-1.5">
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
          {rows.map((job) => (
            <LabelJobListRow
              key={job.jobId}
              job={job}
              owner={owners[job.matchId]}
              openFlags={openOf(job, flagCounts)}
              fresh={fresh.has(job.jobId)}
              onOpen={() => open(job.jobId)}
              labellers={labellers}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
