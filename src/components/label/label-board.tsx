"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { claimLabelMatchAction } from "@/app/label/actions";
import { AdminAvatar } from "@/components/admin/admin-cells";
import { UrgencyMark } from "@/components/admin/labels/urgency-mark";
import { YouPill } from "@/components/ui/you-pill";
import type {
  BoardFlags,
  LabellerBoard,
  LabellerSessionRow,
  LabellerTodoRow,
} from "@/lib/data/label-queue-server";
import { agoText, isOverdue, labelDueText } from "@/lib/services/labels/queue";
import { advButton } from "@/lib/ui/adv-button";
import { cn } from "@/lib/utils";

/**
 * The labeller's board on `/label` (LabDue / AFree / LabSentBack artboards):
 * three lanes — To do, In progress, Published — each a quiet well of white
 * rows, plus a fourth, Submitted, only while sessions handed in before submit
 * published still sit in it. A match an admin sent back to the viewer leads
 * In progress as a card carrying the admin's note.
 *
 * Nothing here can name a match: the rows (`toLabellerBoard`) carry video
 * length, urgency, due time, flags and, on a held row, the labeller's first
 * name and photo. Another labeller's row has no id at all, so those rows are
 * keyed by index.
 *
 * `now` comes from the server render and is used for every due text, so the
 * server's HTML and the browser's first render agree; the board does not tick.
 *
 * The lane shell and the row parts are exported: the admin's board
 * (`components/admin/labels/labels-board.tsx`) draws the same lanes.
 */

/** The To do lane shows this many before "Show N more". */
export const TODO_VISIBLE = 8;

/** Video | Urgency | (due or labeller) | trailing slot. */
export const ROW_GRID =
  "grid grid-cols-[56px_96px_minmax(0,1fr)_auto] items-center gap-x-2";

export function hours(seconds: number): string {
  return (seconds / 3600).toFixed(2);
}

export function matchesWord(n: number): string {
  return n === 1 ? "1 match" : `${n} matches`;
}

export function laneCount(rows: readonly { videoSeconds: number }[]): string {
  const seconds = rows.reduce((sum, row) => sum + row.videoSeconds, 0);
  return `${matchesWord(rows.length)} · ${hours(seconds)} h`;
}

export function Hours({ seconds }: { seconds: number }) {
  return (
    <span className="text-[14px] font-medium whitespace-nowrap text-[var(--ink-900)] tabular-nums">
      {hours(seconds)}{" "}
      <span className="font-normal text-[var(--ink-500)]">h</span>
    </span>
  );
}

export function DueText({ dueAt, now }: { dueAt: string; now: number }) {
  const overdue = isOverdue(dueAt, now);
  return (
    <span
      data-label-overdue={overdue ? "true" : "false"}
      className={cn(
        "text-[12px] whitespace-nowrap tabular-nums",
        overdue
          ? "font-semibold text-[var(--ink-900)]"
          : "text-[var(--ink-500)]",
      )}
    >
      {labelDueText(dueAt, now)}
    </span>
  );
}

export function Lane({
  id,
  title,
  count,
  children,
}: {
  id: string;
  title: string;
  count: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      data-label-lane={id}
      className="flex min-w-0 flex-[1_1_300px] flex-col gap-3 rounded-[var(--radius-card)] bg-[var(--surface-subtle)] px-2 pt-4 pb-2"
    >
      <h2
        id={id}
        className="flex items-baseline justify-between gap-3 px-3 text-[13px] font-semibold text-[var(--ink-900)]"
      >
        <span>{title}</span>
        <span className="text-[12px] font-normal text-[var(--ink-500)] tabular-nums">
          {count}
        </span>
      </h2>
      {children}
    </section>
  );
}

export function LaneEmpty({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex min-h-[44px] items-center rounded-[var(--radius-element)] border border-dashed border-[var(--border-field)] px-3 text-[12px] text-[var(--ink-500)]">
      {children}
    </p>
  );
}

/* -------------------------------------------------------------------------
 * To do
 * ---------------------------------------------------------------------- */

function TodoLane({
  rows,
  now,
  canClaim,
}: {
  rows: readonly LabellerTodoRow[];
  now: number;
  /** False while holding a match, or for an admin who is not a labeller. */
  canClaim: boolean;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<{
    jobId: string;
    message: string;
  } | null>(null);
  const [pending, startTransition] = useTransition();

  const visible = expanded ? rows : rows.slice(0, TODO_VISIBLE);
  const hidden = rows.length - visible.length;

  function claim(jobId: string) {
    setRefusal(null);
    setClaiming(jobId);
    startTransition(async () => {
      const result = await claimLabelMatchAction(jobId);
      if ("sessionId" in result) {
        router.push(`/label/${result.sessionId}`);
        return;
      }
      setClaiming(null);
      setRefusal({ jobId, message: result.error });
      // The rows may have moved under the refusal (someone claimed first).
      router.refresh();
    });
  }

  return (
    <Lane id="label-board-todo" title="To do" count={laneCount(rows)}>
      {rows.length === 0 ? (
        <LaneEmpty>Nothing is waiting to be labelled.</LaneEmpty>
      ) : (
        <div className="flex flex-col gap-1">
          <div
            aria-hidden="true"
            className={cn(
              ROW_GRID,
              "px-3 pb-0.5 text-[11px] text-[var(--ink-500)]",
            )}
          >
            <span>Video</span>
            <span>Urgency</span>
            <span className="text-right">Due</span>
            <span />
          </div>
          {visible.map((row) => {
            const showClaim = canClaim && row.claimable;
            const busy = pending && claiming === row.jobId;
            const message =
              refusal?.jobId === row.jobId ? refusal.message : null;
            return (
              <div
                key={row.jobId}
                data-label-todo-row=""
                className="rounded-[var(--radius-element)] bg-[var(--surface-card)]"
              >
                <div className={cn(ROW_GRID, "h-[44px] px-3")}>
                  <Hours seconds={row.videoSeconds} />
                  <UrgencyMark level={row.urgency} />
                  <span className="min-w-0 text-right">
                    <DueText dueAt={row.dueAt} now={now} />
                  </span>
                  {showClaim ? (
                    <button
                      type="button"
                      data-label-claim=""
                      onClick={() => claim(row.jobId)}
                      disabled={pending}
                      aria-label={`Claim, ${hours(row.videoSeconds)} hours of video`}
                      className={cn(advButton("primary", "sm"), "ml-2")}
                    >
                      {busy ? "Claiming…" : "Claim"}
                    </button>
                  ) : (
                    <span />
                  )}
                </div>
                {message ? (
                  <p
                    role="alert"
                    className="px-3 pb-2.5 text-[12px] text-[var(--danger)]"
                  >
                    {message}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
      {hidden > 0 ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="self-start rounded-[var(--radius-element)] px-3 pt-1 pb-2 text-[12px] font-medium text-[var(--ink-700)] outline-none hover:text-[var(--ink-900)] focus-visible:shadow-[var(--focus-ring)]"
        >
          Show {hidden} more
        </button>
      ) : null}
    </Lane>
  );
}

/* -------------------------------------------------------------------------
 * In progress and Submitted
 * ---------------------------------------------------------------------- */

function FlagProgress({ flags }: { flags: BoardFlags }) {
  if (!flags) return null;
  if ("total" in flags) {
    const pct = flags.total > 0 ? (flags.resolved / flags.total) * 100 : 100;
    return (
      <>
        <div
          role="progressbar"
          aria-label="Flags resolved"
          aria-valuemin={0}
          aria-valuemax={flags.total}
          aria-valuenow={flags.resolved}
          className="h-1.5 overflow-hidden rounded-full bg-[var(--ink-200)]"
        >
          <div
            className="h-full rounded-full bg-[var(--blue)]"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span>
          <span className="font-medium text-[var(--ink-900)]">
            {flags.resolved} of {flags.total}
          </span>{" "}
          flags resolved
        </span>
      </>
    );
  }
  return (
    <span>
      <span className="font-medium text-[var(--ink-900)]">{flags.left}</span>{" "}
      {flags.left === 1 ? "flag left" : "flags left"}
    </span>
  );
}

/** The viewer's own held match: progress and the way back into it. */
function MineCard({ row, now }: { row: LabellerSessionRow; now: number }) {
  const hasBar = row.flags !== null && "total" in row.flags;
  return (
    <article
      data-label-mine=""
      className="flex flex-col gap-3 rounded-[var(--radius-element)] border border-[var(--border-field)] bg-[var(--surface-card)] px-3 pb-3"
    >
      <div className={cn(ROW_GRID, "h-[44px]")}>
        <Hours seconds={row.videoSeconds} />
        <UrgencyMark level={row.urgency} />
        <span className="text-right text-[12px] font-semibold text-[var(--ink-900)]">
          Your match
        </span>
        <span className="pl-2">
          <DueText dueAt={row.dueAt} now={now} />
        </span>
      </div>
      {row.flags ? (
        <div
          className={cn(
            "flex flex-col text-[12px] text-[var(--ink-500)] tabular-nums",
            hasBar ? "gap-2" : "gap-0",
          )}
        >
          <FlagProgress flags={row.flags} />
        </div>
      ) : null}
      {row.sessionId ? (
        <Link
          href={`/label/${row.sessionId}`}
          className={cn(advButton("primary", "md"), "w-full gap-1")}
        >
          Continue labelling
          <ChevronRight
            className="size-3.5"
            strokeWidth={1.5}
            aria-hidden="true"
          />
        </Link>
      ) : null}
    </article>
  );
}

/**
 * The viewer's own match an admin sent back (LabSentBack): when, the admin's
 * note, and the way back in. The first version stays published meanwhile.
 */
function SentBackCard({
  row,
  sentBack,
  now,
}: {
  row: LabellerSessionRow;
  sentBack: NonNullable<LabellerSessionRow["sentBack"]>;
  now: number;
}) {
  const name = row.labellerFirstName;
  return (
    <article
      data-label-mine=""
      data-label-sent-back=""
      className="flex flex-col gap-3 rounded-[var(--radius-element)] border border-[var(--border-field)] bg-[var(--surface-card)] px-3 pb-3"
    >
      <div className={cn(ROW_GRID, "h-[44px]")}>
        <Hours seconds={row.videoSeconds} />
        <UrgencyMark level={row.urgency} />
        <span className="text-right text-[12px] font-semibold text-[var(--ink-900)]">
          Your match
        </span>
        <span className="flex pl-2">
          {name ? (
            <AdminAvatar
              name={name}
              photoUrl={row.labellerPhotoUrl}
              size={26}
            />
          ) : (
            <span aria-hidden="true" className="size-[26px]" />
          )}
        </span>
      </div>
      <div className="flex flex-col gap-1 rounded-[var(--radius-element)] bg-[var(--surface-subtle)] px-3 py-2.5 text-[12px]">
        <p className="font-semibold text-[var(--ink-900)]">
          Sent back {agoText(sentBack.at, now)}
        </p>
        {sentBack.note ? (
          <p
            data-label-sent-back-note=""
            className="whitespace-pre-line text-[var(--ink-700)]"
          >
            {sentBack.note}
          </p>
        ) : null}
      </div>
      <p className="text-[12px] text-[var(--ink-500)]">
        Your first version is still published. Publishing again replaces it.
      </p>
      {row.sessionId ? (
        <Link
          href={`/label/${row.sessionId}`}
          className={cn(advButton("primary", "md"), "w-full gap-1")}
        >
          Fix and publish again
          <ChevronRight
            className="size-3.5"
            strokeWidth={1.5}
            aria-hidden="true"
          />
        </Link>
      ) : null}
    </article>
  );
}

/** A published match: who published it and when, never the match. */
function PublishedRow({ row, now }: { row: LabellerSessionRow; now: number }) {
  const name = row.labellerFirstName;
  const who = row.mine ? "You" : name;
  const text = [who, row.publishedAt ? agoText(row.publishedAt, now) : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <div
      data-label-published-row=""
      className={cn(
        ROW_GRID,
        "h-[44px] rounded-[var(--radius-element)] bg-[var(--surface-card)] px-3",
      )}
    >
      <Hours seconds={row.videoSeconds} />
      <UrgencyMark level={row.urgency} />
      <span className="min-w-0 truncate text-right text-[12px] text-[var(--ink-500)] tabular-nums">
        {text}
      </span>
      <span className="flex pl-2">
        {name ? (
          <AdminAvatar name={name} photoUrl={row.labellerPhotoUrl} size={26} />
        ) : (
          <span aria-hidden="true" className="size-[26px]" />
        )}
      </span>
    </div>
  );
}

/** Someone's held or handed-in match: the labeller, never the match. */
function SessionRow({ row }: { row: LabellerSessionRow }) {
  const name = row.labellerFirstName;
  return (
    <div
      data-label-session-row=""
      className={cn(
        ROW_GRID,
        "h-[44px] rounded-[var(--radius-element)] bg-[var(--surface-card)] px-3",
      )}
    >
      <Hours seconds={row.videoSeconds} />
      <UrgencyMark level={row.urgency} />
      <span className="flex min-w-0 items-center justify-end gap-1.5 text-[12px] text-[var(--ink-500)]">
        <span className="truncate">{name ?? "Unassigned"}</span>
        {row.mine ? <YouPill /> : null}
      </span>
      <span className="flex pl-2">
        {name ? (
          <AdminAvatar name={name} photoUrl={row.labellerPhotoUrl} size={26} />
        ) : (
          <span aria-hidden="true" className="size-[26px]" />
        )}
      </span>
    </div>
  );
}

/* -------------------------------------------------------------------------
 * The board
 * ---------------------------------------------------------------------- */

export function LabelBoard({
  board,
  now,
  canClaim,
}: {
  board: LabellerBoard;
  /** Epoch ms, read once on the server. */
  now: number;
  /** The viewer is a labeller (an admin who is not one is refused a claim). */
  canClaim: boolean;
}) {
  const overdue = board.todo.filter((row) => isOverdue(row.dueAt, now)).length;
  // A sent-back match leads the lane; only the viewer's own row carries one.
  const mine = board.inProgress
    .filter((row) => row.mine)
    .sort((a, b) => Number(Boolean(b.sentBack)) - Number(Boolean(a.sentBack)));
  const others = board.inProgress.filter((row) => !row.mine);
  const sentBack = mine.some((row) => row.sentBack);
  // A sent-back match is held like any other: no claim until it is published.
  const holding = board.holding || sentBack;
  const lede = [
    overdue > 0 ? `${overdue} overdue.` : null,
    sentBack
      ? "A match was sent back to you. Fix and publish it again to claim the next one."
      : board.holding
        ? "Submit yours to claim the next one."
        : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-display">
          {matchesWord(board.todo.length)} to label
        </h1>
        {lede ? <p className="text-body-sm mt-[9px]">{lede}</p> : null}
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start gap-4">
          <TodoLane
            rows={board.todo}
            now={now}
            canClaim={canClaim && !holding}
          />

          <Lane
            id="label-board-in-progress"
            title="In progress"
            count={laneCount(board.inProgress)}
          >
            <div className="flex flex-col gap-1">
              {mine.map((row, i) =>
                row.sentBack ? (
                  <SentBackCard
                    key={row.sessionId ?? `mine-${i}`}
                    row={row}
                    sentBack={row.sentBack}
                    now={now}
                  />
                ) : (
                  <MineCard
                    key={row.sessionId ?? `mine-${i}`}
                    row={row}
                    now={now}
                  />
                ),
              )}
              {mine.length === 0 ? (
                <LaneEmpty>Claim a match and it appears here.</LaneEmpty>
              ) : null}
              {others.map((row, i) => (
                <SessionRow key={i} row={row} />
              ))}
            </div>
          </Lane>

          <Lane
            id="label-board-published"
            title="Published"
            count={laneCount(board.published)}
          >
            {board.published.length === 0 ? (
              <LaneEmpty>Nothing is published yet.</LaneEmpty>
            ) : (
              <div className="flex flex-col gap-1">
                {board.published.map((row, i) => (
                  <PublishedRow
                    key={row.sessionId ?? `published-${i}`}
                    row={row}
                    now={now}
                  />
                ))}
              </div>
            )}
          </Lane>

          {/* Sessions handed in before submit published; gone once drained. */}
          {board.submitted.length > 0 ? (
            <Lane
              id="label-board-submitted"
              title="Submitted"
              count={laneCount(board.submitted)}
            >
              <div className="flex flex-col gap-1">
                {board.submitted.map((row, i) => (
                  <SessionRow key={row.sessionId ?? i} row={row} />
                ))}
              </div>
            </Lane>
          ) : null}
        </div>
        <p className="text-[12px] text-[var(--ink-500)]">
          Publishing puts a match in front of the player straight away. It can
          still be sent back to you.
        </p>
      </div>
    </div>
  );
}
