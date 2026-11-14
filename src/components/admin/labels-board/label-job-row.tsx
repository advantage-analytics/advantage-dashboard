"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  assignLabelSessionAction,
  checkLabelSessionAction,
  sendBackLabelSessionAction,
} from "@/app/admin/labels/actions";
import {
  AdminMatchCell,
  RowChevron,
  TwoLineDate,
  WorkspaceCell,
} from "@/components/admin/admin-cells";
import { useStartLabelling } from "@/components/admin/labels/start-labelling-button";
import { UrgencyMark } from "@/components/admin/labels/urgency-mark";
import { SendBackDialog } from "@/components/admin/labels-board/send-back-dialog";
import { DueText, Hours, ROW_GRID } from "@/components/label/label-board";
import { FloatMenu, FloatMenuItem } from "@/components/ui/float-menu";
import { StatePill } from "@/components/ui/state-pill";
import type { LabelJobOwner } from "@/lib/data/label-overview-server";
import type {
  AdminLabelBoardRow,
  BoardFlags,
} from "@/lib/data/label-queue-server";
import type { LabelJobRow } from "@/lib/data/labels-server";
import type { Labeller } from "@/lib/services/labels/assign-session";
import {
  jobState,
  jobStatusText,
  type FlagCounts,
} from "@/lib/services/labels/job-groups";
import { agoText, labelPublishedText } from "@/lib/services/labels/queue";
import { actionRejected } from "@/lib/ui/action-rejected";
import { cn } from "@/lib/utils";

/**
 * Two kinds of row for Admin › Labels. `AdminLaneRow` (at the foot) is a
 * match on the board's lanes. `LabelJobListRow` is a row of the Requested
 * reviews table, drawn as the Labels list (LabelsFlat, "Labels B") drew it:
 *
 * One row of the Labels list: Match · Workspace ·
 * Analyzed · Points · Flags · Status · Assigned · Worked · chevron. A match is a
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
  "grid grid-cols-[minmax(260px,1fr)_170px_96px_56px_88px_170px_150px_64px_13px] items-center gap-x-4";

export const LABEL_COLUMNS = [
  "Match",
  "Workspace",
  "Analyzed",
  "Points",
  "Flags",
  "Status",
  "Assigned",
  "Worked",
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
      <MinutesWorked minutes={job.session?.minutesWorked ?? 0} />
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
  onAssigned,
}: {
  sessionId: string;
  frozen: boolean;
  initial: { id: string; name: string } | null;
  labellers: readonly Labeller[];
  /** Ran after the assignment is saved (the board re-reads its lanes). */
  onAssigned?: () => void;
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
      onAssigned?.();
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
 * Minutes of active work on the session (its `label_work_beats`), "N min";
 * none recorded reads as the dash.
 */
function MinutesWorked({ minutes }: { minutes: number }) {
  if (!minutes) {
    return (
      <span
        aria-label="No time recorded"
        className="text-[12px] text-[var(--ink-400)]"
      >
        —
      </span>
    );
  }
  return (
    <span
      data-labels-minutes=""
      className="tabular text-[13px] whitespace-nowrap text-[var(--ink-700)]"
    >
      {minutes} min
    </span>
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

/* -------------------------------------------------------------------------
 * The board's lanes
 * ---------------------------------------------------------------------- */

export type AdminLane = "todo" | "inProgress" | "toCheck" | "submitted";

const DAY_MS = 86_400_000;

/**
 * "no work in N days" once the holder's newest work beat is a day old or
 * more; null with no beat at all, or a recent one.
 */
export function noWorkText(
  lastBeatAt: string | null,
  now: number,
): string | null {
  if (!lastBeatAt) return null;
  const days = Math.floor((now - Date.parse(lastBeatAt)) / DAY_MS);
  if (!(days >= 1)) return null;
  return days === 1 ? "no work in 1 day" : `no work in ${days} days`;
}

/** "3 of 10 flags resolved", or "4 flags left" before a start was counted. */
export function flagText(flags: NonNullable<BoardFlags>): string {
  if ("total" in flags) {
    return `${flags.resolved} of ${flags.total} flags resolved`;
  }
  return flags.left === 1 ? "1 flag left" : `${flags.left} flags left`;
}

/**
 * A published row's timeliness in the due slot: "On time", or "N h late" in
 * the overdue weight the due text uses.
 */
function PublishedTimeliness({
  publishedAt,
  dueAt,
}: {
  publishedAt: string;
  dueAt: string;
}) {
  const text = labelPublishedText(publishedAt, dueAt);
  const late = text !== "On time";
  return (
    <span
      data-label-published-late={late ? "true" : "false"}
      className={cn(
        "text-[12px] whitespace-nowrap tabular-nums",
        late ? "font-semibold text-[var(--ink-900)]" : "text-[var(--ink-500)]",
      )}
    >
      {text}
    </span>
  );
}

/** The quiet text actions under a row: Check is the lane's one blue word. */
const TEXT_ACTION =
  "cursor-pointer rounded-[var(--radius-element)] px-1 -mx-1 text-[12px] font-medium transition-colors duration-200 outline-none focus-visible:shadow-[var(--focus-ring)] disabled:cursor-progress disabled:opacity-50";

/**
 * A Published, to check row's actions: Check passes the published session
 * and takes it off the board; Send back opens the note dialog and returns it
 * to its labeller. A refusal prints its sentence under the row (inside the
 * dialog while it is open); a success re-reads the board.
 */
function CheckActions({
  sessionId,
  players,
  labellerName,
}: {
  sessionId: string;
  players: string;
  labellerName: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [running, setRunning] = useState<"check" | "sendBack" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [note, setNote] = useState("");

  const run = (
    kind: "check" | "sendBack",
    action: () => Promise<{ error: string } | { ok: true }>,
  ) => {
    setError(null);
    setRunning(kind);
    startTransition(async () => {
      const result = await action().catch(actionRejected);
      setRunning(null);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setDialogOpen(false);
      setNote("");
      router.refresh();
    });
  };

  return (
    <>
      <div className="flex items-center gap-4">
        <button
          type="button"
          data-labels-check={sessionId}
          aria-busy={running === "check" || undefined}
          disabled={isPending}
          onClick={() => run("check", () => checkLabelSessionAction(sessionId))}
          className={cn(
            TEXT_ACTION,
            "text-[var(--blue)] hover:text-[var(--blue-hover)]",
          )}
        >
          {running === "check" ? "Checking…" : "Check"}
        </button>
        <button
          type="button"
          data-labels-send-back={sessionId}
          disabled={isPending}
          onClick={() => {
            setError(null);
            setDialogOpen(true);
          }}
          className={cn(
            TEXT_ACTION,
            "text-[var(--ink-700)] hover:text-[var(--ink-900)]",
          )}
        >
          Send back
        </button>
      </div>
      {error && !dialogOpen ? (
        <p role="alert" className="text-[12px] text-[var(--danger)]">
          {error}
        </p>
      ) : null}
      <SendBackDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        players={players}
        labellerName={labellerName}
        note={note}
        onNoteChange={setNote}
        pending={running === "sendBack"}
        error={dialogOpen ? error : null}
        onConfirm={() =>
          run("sendBack", () => sendBackLabelSessionAction(sessionId, note))
        }
      />
    </>
  );
}

/**
 * One match on the admin's board (AdminAudit artboard): hours, urgency and
 * the due time, then "Player vs Player · Team" with the chevron a record row
 * carries. The top of the card is the way in — for every row in every lane it
 * seeds or reopens the session (`useStartLabelling`) and opens the console;
 * an admin labels any match, with no claim and no limit.
 *
 * Below it, outside the button: a row with an open session keeps the Assign
 * menu (its pill reads the labeller's name), and an In progress row its
 * progress in flags and, when the holder has gone quiet, "no work in N days".
 * A sent-back In progress row adds a "Sent back" pill, when, and the note.
 * A Published, to check row has no Assign menu: it names its labeller and
 * when they published, prints "On time" or "N h late" where the due text
 * goes, and carries Check and Send back.
 */
export function AdminLaneRow({
  row,
  lane,
  now,
  labellers = [],
  onOpen,
}: {
  row: AdminLabelBoardRow;
  lane: AdminLane;
  /** Epoch ms, read once on the server. */
  now: number;
  /** Who the Assign menu offers (`listLabellers`). */
  labellers?: readonly Labeller[];
  /** Ran on the click, before the session opens. */
  onOpen?: () => void;
}) {
  const router = useRouter();
  const { start, isPending, error } = useStartLabelling(row.jobId);
  const players = `${row.player1Name} vs ${row.player2Name}`;
  const flags = lane === "inProgress" ? row.flags : null;
  const stalled =
    lane === "inProgress" ? noWorkText(row.lastBeatAt, now) : null;
  const sentBack = lane === "inProgress" ? row.sentBack : null;
  const bar = flags && "total" in flags ? flags : null;
  const toCheck = lane === "toCheck" && row.sessionId ? row.sessionId : null;
  const assignable = row.sessionId && lane !== "toCheck";

  return (
    <div
      data-admin-label-row=""
      data-labels-job={row.jobId}
      className="group rounded-[var(--radius-element)] bg-[var(--surface-card)]"
    >
      <button
        type="button"
        aria-label={`Open ${players}`}
        aria-busy={isPending}
        disabled={isPending}
        onClick={() => {
          onOpen?.();
          start();
        }}
        className="flex w-full cursor-pointer flex-col rounded-[var(--radius-element)] px-3 pb-2 text-left transition-colors duration-100 outline-none hover:bg-[var(--surface-muted)] focus-visible:shadow-[var(--focus-ring)] active:scale-[0.998] disabled:cursor-progress"
      >
        <span className={cn(ROW_GRID, "h-[40px] w-full")}>
          <Hours seconds={row.videoSeconds} />
          <UrgencyMark level={row.urgency} />
          <span
            className={cn(
              "min-w-0 text-right",
              sentBack ? "col-span-1" : "col-span-2",
            )}
          >
            {lane === "toCheck" && row.publishedAt ? (
              <PublishedTimeliness
                publishedAt={row.publishedAt}
                dueAt={row.dueAt}
              />
            ) : (
              <DueText dueAt={row.dueAt} now={now} />
            )}
          </span>
          {sentBack ? <StatePill>Sent back</StatePill> : null}
        </span>
        <span className="flex w-full items-center justify-between gap-3">
          <span className="min-w-0 truncate text-[12px] text-[var(--ink-900)]">
            {players}{" "}
            <span className="text-[var(--ink-500)]">· {row.programName}</span>
          </span>
          <ChevronRight
            className="size-[13px] shrink-0 text-[var(--ink-300)] transition-colors duration-200 group-hover:text-[var(--ink-900)]"
            strokeWidth={1.5}
            aria-hidden="true"
          />
        </span>
      </button>

      {assignable || stalled || flags || sentBack ? (
        <div className="flex flex-col gap-2 px-3 pt-0.5 pb-2.5">
          {bar ? (
            <div
              role="progressbar"
              aria-label="Flags resolved"
              aria-valuemin={0}
              aria-valuemax={bar.total}
              aria-valuenow={bar.resolved}
              className="h-1.5 overflow-hidden rounded-full bg-[var(--ink-200)]"
            >
              <div
                className="h-full rounded-full bg-[var(--blue)]"
                style={{
                  width: `${bar.total > 0 ? (bar.resolved / bar.total) * 100 : 100}%`,
                }}
              />
            </div>
          ) : null}
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-[var(--ink-500)] tabular-nums">
            {assignable && row.sessionId ? (
              <span className="flex min-w-0 flex-col items-start">
                <AssignMenu
                  key={row.sessionId}
                  sessionId={row.sessionId}
                  frozen={false}
                  initial={
                    row.labellerId && row.labellerName
                      ? { id: row.labellerId, name: row.labellerName }
                      : null
                  }
                  labellers={labellers}
                  onAssigned={() => router.refresh()}
                />
              </span>
            ) : null}
            {sentBack || stalled || flags ? (
              <span data-admin-label-progress="">
                {[
                  sentBack && {
                    text: `sent back ${agoText(sentBack.at, now)}`,
                    strong: false,
                  },
                  stalled && { text: stalled, strong: true },
                  flags && { text: flagText(flags), strong: false },
                ]
                  .filter((part) => !!part)
                  .map((part, i) => (
                    <span key={part.text}>
                      {i > 0 ? " · " : null}
                      <span
                        className={
                          part.strong
                            ? "font-medium text-[var(--ink-900)]"
                            : undefined
                        }
                      >
                        {part.text}
                      </span>
                    </span>
                  ))}
              </span>
            ) : null}
          </div>
          {sentBack ? (
            <p
              data-admin-label-note=""
              className="line-clamp-3 text-[12px] leading-[1.5] text-[var(--ink-700)]"
            >
              Note: {sentBack.note}
            </p>
          ) : null}
        </div>
      ) : null}

      {toCheck ? (
        <div className="flex flex-col gap-2 px-3 pt-0.5 pb-3">
          <p className="min-w-0 truncate text-[12px] text-[var(--ink-500)] tabular-nums">
            {row.labellerName ?? "No labeller"}
            {row.publishedAt
              ? ` · published ${agoText(row.publishedAt, now)}`
              : null}
          </p>
          <CheckActions
            sessionId={toCheck}
            players={players}
            labellerName={row.labellerName}
          />
        </div>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="px-3 pb-2.5 text-[12px] text-[var(--danger)]"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
