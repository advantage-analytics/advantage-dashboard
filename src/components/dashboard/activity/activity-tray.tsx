"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Activity, ChevronRight, CircleX } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ChromeTooltip } from "@/components/dashboard/shared/chrome-tooltip";
import { AnalysisProgressTrack } from "@/components/dashboard/matches/analysis-progress-track";
import { useWorkspace } from "@/components/dashboard/workspace-provider";
import {
  useLiveMatchAnalysis,
  withLiveAnalysis,
} from "@/hooks/use-live-match-analysis";
import {
  ANALYSIS_LABEL,
  isAnalysisFailed,
  isInFlight,
  isLiveUpdating,
  isWorking,
} from "@/lib/data/match-analysis";
import { invitationHref } from "@/lib/services/programs/join-links";
import { acceptPendingInvite } from "@/lib/services/programs/join-actions";
import { inviteSubtitle } from "@/lib/services/programs/join-role";
import { setActiveWorkspace } from "@/lib/workspace/actions";
import { trayDetail } from "./tray-detail";
import type {
  ActivityFeed,
  ActivityItem,
  ElsewhereWork,
} from "@/lib/data/activity-server";
// Type-only, and it has to stay that way: `pending-invites-server.ts` builds a
// Supabase server client. This file is `"use client"`, so a value import would
// drag the server module into the browser bundle.
import type { PendingInvite } from "@/lib/data/pending-invites-server";
import { cn } from "@/lib/utils";

/**
 * The tray's one job: what is happening, and what is waiting on you.
 *
 * It used to do a third — keep a receipt of what had finished — and that is
 * what made it crowded: three row anatomies, an empty dot gutter on every
 * settled row, and an ETA restating a bar restating a title. The receipt now
 * lives behind one footer line that covers the whole history rather than the
 * last two rows of it, so the panel holds two row shapes and one blue.
 *
 * ── The leading column carries state, not air ──────────────────────────────
 * 14px, always present, so every row's text starts on the same x. A blue dot
 * on a row that is moving or waiting; the loss-red circle-x on a failure.
 * Nothing else renders as a row here any more, so nothing else needs an
 * empty one.
 *
 * ── Actions are always visible ─────────────────────────────────────────────
 * A popover cannot be hovered on touch, and the rows with an action are the
 * rows the panel exists for. Accept is a word: the row's wash and dot already
 * carry it. Start over keeps its border: it spends video budget.
 */

/** The row chrome every kind shares. Only the body differs. */
function RowShell({
  lead,
  washed,
  children,
}: {
  lead: React.ReactNode;
  /** The wash marks a row that is waiting on the reader. */
  washed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex gap-3 rounded-[9px] px-2.5 py-3",
        washed && "bg-[var(--surface-subtle)]"
      )}
    >
      <span className="flex w-[14px] shrink-0 justify-center">{lead}</span>
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

const DOT = (
  <span
    aria-hidden="true"
    className="mt-[5px] size-1.5 rounded-full bg-[var(--blue)]"
  />
);

/** The same row as `RowShell`, made a link. Reads as one thing; is one thing. */
const LINK_ROW_CLASS =
  "flex gap-3 rounded-[9px] px-2.5 py-3 transition-colors duration-150 hover:bg-[var(--surface-subtle)] focus-visible:bg-[var(--surface-subtle)] focus-visible:outline-none";

/** Blue text action — the row it sits in already carries the emphasis. */
const TEXT_ACTION_CLASS =
  "text-[12px] font-medium text-[var(--blue)] transition-colors duration-150 hover:text-[var(--blue-hover)] focus-visible:outline-none focus-visible:underline disabled:opacity-60 cursor-pointer";

/** Grey text link beside a blue action. */
const TEXT_LINK_CLASS =
  "text-[12px] text-[var(--ink-600)] transition-colors duration-150 hover:text-[var(--ink-900)] focus-visible:outline-none focus-visible:underline";

function InFlightRow({ item }: { item: ActivityItem }) {
  const { analysis, title } = item;

  return (
    <Link href={`/dashboard/matches/${item.matchId}`} className={LINK_ROW_CLASS}>
      <span className="flex w-[14px] shrink-0 justify-center">{DOT}</span>
      <span className="flex min-w-0 flex-1 flex-col gap-[7px]">
        <span className="min-w-0 text-[12px] text-[var(--ink-900)] [text-wrap:pretty]">
          {ANALYSIS_LABEL[analysis.status]} <b className="font-medium">{title}</b>
        </span>
        {/* The bar is the whole estimate. The "about N minutes left" line this
            used to carry said the same thing a second time, and needed a
            15-second timer to keep saying it. */}
        {analysis.progressPercent !== undefined && (
          <AnalysisProgressTrack
            percent={analysis.progressPercent}
            live={isWorking(analysis.status)}
            label={`${ANALYSIS_LABEL[analysis.status]} ${title}`}
          />
        )}
      </span>
    </Link>
  );
}

/**
 * A failure, with the one thing you can do about it.
 *
 * "Start over" is `analysisAction()`'s word for this state and it leads where
 * that does — the upload wizard. There is no retry endpoint, so a "Retry" here
 * would be a fourth word for a state the product already names in three
 * places, promising a thing the pipeline cannot do.
 */
function FailedRow({ item }: { item: ActivityItem }) {
  return (
    <RowShell
      lead={
        <CircleX
          className="size-[14px] text-[var(--danger)]"
          strokeWidth={1.5}
          aria-hidden="true"
        />
      }
    >
      <span className="flex items-center gap-3">
        <Link
          href={`/dashboard/matches/${item.matchId}`}
          className="min-w-0 flex-1 truncate text-[12px] text-[var(--ink-900)] hover:underline focus-visible:outline-none focus-visible:underline"
        >
          Analysis failed — <b className="font-medium">{item.title}</b>
        </Link>
        <Link
          href="/dashboard/matches/new"
          className="flex h-6 shrink-0 items-center rounded-[6px] border border-[var(--border-medium)] bg-white px-[9px] text-[12px] text-[var(--ink-700)] transition-colors duration-150 hover:bg-[var(--surface-subtle)] focus-visible:outline-none focus-visible:bg-[var(--surface-subtle)]"
        >
          Start over
        </Link>
      </span>
    </RowShell>
  );
}

/**
 * An invitation, with Accept in place.
 *
 * Two steps, on purpose. Joining a program is not undoable, and a popover is
 * the wrong place for a dialog, so the confirmation is the action line itself
 * changing shape: "Join <program>?  Join · Cancel". The server action
 * redirects on success, which unmounts this — there is no local success state
 * to draw. On failure the sentence the action returns is printed under the
 * row, in its own words.
 *
 * No Decline. Nothing on the server records one — the invitation page's "Not
 * now" is a GET flag that leaves the row exactly as it was — and a button that
 * changes nothing would be teaching people to ignore buttons. Details opens
 * the page, which also says when the invitation expires; this row does not,
 * because a countdown in a 360px popover is pressure without a remedy.
 */
function InviteRow({ invite }: { invite: PendingInvite }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const join = () => {
    setError(null);
    startTransition(async () => {
      // Success redirects, so this settles with Next's redirect signal rather
      // than a value; only an `{ ok: false }` return is ours to show.
      const result = await acceptPendingInvite(invite.id);
      if (result && !result.ok) {
        setError(result.error);
        setConfirming(false);
      }
    });
  };

  return (
    <RowShell lead={DOT} washed>
      <span className="min-w-0 text-[12px] text-[var(--ink-900)] [text-wrap:pretty]">
        Invitation to <b className="font-medium">{invite.programName}</b>
      </span>
      <span className="mt-[3px] text-[11px] text-[var(--ink-500)]">
        Join {inviteSubtitle(invite)}
      </span>

      <span className="mt-2.5 flex items-center gap-4">
        {confirming ? (
          <>
            <span className="text-[12px] text-[var(--ink-700)]">
              Join {invite.programName}?
            </span>
            <button
              type="button"
              onClick={join}
              disabled={isPending}
              className={TEXT_ACTION_CLASS}
            >
              {isPending ? "Joining…" : "Join"}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={isPending}
              className={cn(TEXT_LINK_CLASS, "cursor-pointer")}
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className={TEXT_ACTION_CLASS}
            >
              Accept
            </button>
            <Link href={invitationHref(invite.id)} className={TEXT_LINK_CLASS}>
              Details
            </Link>
          </>
        )}
      </span>

      {error && (
        <span role="alert" className="mt-1.5 text-[11px] text-[var(--danger)]">
          {error}
        </span>
      )}
    </RowShell>
  );
}

/**
 * The one row that reaches past the active workspace.
 *
 * A hollow ring, not a dot: something is moving, but not here. Clicking it
 * switches workspace through the same action the profile menu uses, so the
 * switch is validated and navigated the same way from both doors.
 */
function ElsewhereRow({ work }: { work: ElsewhereWork }) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          // Redirects on success — rejects with Next's redirect signal rather
          // than resolving. Nothing to clear: the navigation unmounts this.
          await setActiveWorkspace(work.workspaceId);
        })
      }
      className={cn(
        LINK_ROW_CLASS,
        "w-full items-center py-[11px] text-left disabled:opacity-60 cursor-pointer"
      )}
    >
      <span className="flex w-[14px] shrink-0 justify-center">
        <span
          aria-hidden="true"
          className="size-[7px] rounded-full border-[1.5px] border-[var(--blue)]"
        />
      </span>
      <span className="min-w-0 flex-1 text-[12px] text-[var(--ink-600)] [text-wrap:pretty]">
        {work.count} upload{work.count === 1 ? "" : "s"} running in{" "}
        <b className="font-medium text-[var(--ink-900)]">{work.workspaceName}</b>
      </span>
      <ChevronRight
        className="size-[13px] shrink-0 text-[var(--ink-400)]"
        strokeWidth={1.5}
        aria-hidden="true"
      />
    </button>
  );
}

export function ActivityTray({
  feed,
  invites,
  elsewhere,
}: {
  feed: ActivityFeed;
  invites: PendingInvite[];
  elsewhere: ElsewhereWork[];
}) {
  const { active, available, viewer } = useWorkspace();
  const [isOpen, setIsOpen] = useState(false);

  /**
   * Subscribe only when an update is actually coming.
   *
   * `isLiveUpdating`, deliberately, and not `isInFlight` — the two differ on
   * `processed`, which is in flight but waits on a deploy rather than a running
   * process. Watching it is what once held a WebSocket and a 25-second
   * heartbeat open indefinitely, per user, against a per-project connection
   * cap. This tray renders on EVERY dashboard page, so it is the worst possible
   * place to get that predicate wrong.
   *
   * Gated on the SERVER feed of the ACTIVE workspace, not the merged list and
   * not the other workspaces. Deriving it from `merged` is circular; and the
   * other workspaces' work is a count the tray shows, not a feed it follows.
   */
  const hasLiveWork = feed.items.some((item) =>
    isLiveUpdating(item.analysis.status)
  );
  const patches = useLiveMatchAnalysis({
    by: "user",
    userId: hasLiveWork ? viewer.id : undefined,
  });

  // Partition AFTER merging: a live event is exactly the thing that moves a job
  // out of flight, so any split made before the merge is already stale. Settled
  // successes fall out here entirely — they are the footer's, not the list's.
  const { inFlight, failed } = useMemo(() => {
    const merged = feed.items.map((item) => ({
      ...item,
      analysis: withLiveAnalysis(item.analysis, patches.get(item.matchId)),
    }));

    return {
      inFlight: merged.filter((item) => isInFlight(item.analysis.status)),
      failed: merged.filter((item) => isAnalysisFailed(item.analysis.status)),
    };
    // `feed.items`, not `feed`: the wrapper object is a fresh identity on every
    // RSC payload.
  }, [feed.items, patches]);

  // Invitations count toward the dot but NOT toward the live subscription
  // above: they arrive with the RSC payload and change only when a coach sends
  // one, which no socket here would learn about anyway.
  const unread = inFlight.length + invites.length;
  const elsewhereCount = elsewhere.reduce((sum, work) => sum + work.count, 0);

  // The trigger carries a dot, not a number: the chrome has no numeric badges,
  // so the count lives here — in the tooltip and, word for word, in the
  // aria-label — and in the tray itself.
  const detail = trayDetail(invites.length, inFlight.length, elsewhereCount);

  const hasRows = invites.length > 0 || inFlight.length > 0 || failed.length > 0;

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <ChromeTooltip label="Activity" detail={detail} hidden={isOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`Activity, ${detail}`}
            className={cn(
              "group relative flex size-7 items-center justify-center rounded-[8px] transition-colors duration-150 hover:bg-[var(--surface-subtle)] focus-visible:outline-none cursor-pointer",
              isOpen && "bg-[var(--surface-subtle)]"
            )}
          >
            <Activity
              className={cn(
                // The DS `.adv-tray-btn` darkens the glyph only while open;
                // hover is the surface wash alone.
                "size-[15px] transition-colors duration-150",
                isOpen ? "text-[var(--ink-900)]" : "text-[var(--ink-700)]"
              )}
              strokeWidth={1.5}
              aria-hidden="true"
            />
            {/* Three states, one corner. Solid: something here is moving or
                waiting on you. Hollow: only somewhere else. Nothing: quiet.
                The header's one resting blue either way, and it clears itself
                when the last job settles — which is why there is no "mark all
                read". */}
            {unread > 0 ? (
              <span
                aria-hidden="true"
                className="absolute right-[3px] top-[3px] size-1.5 rounded-full bg-[var(--blue)]"
              />
            ) : elsewhereCount > 0 ? (
              <span
                aria-hidden="true"
                className="absolute right-[2.5px] top-[2.5px] size-[7px] rounded-full border-[1.5px] border-[var(--blue)] bg-white"
              />
            ) : null}
          </button>
        </PopoverTrigger>
      </ChromeTooltip>

      {/* 360px on the popover primitive's own surface — the 12px radius and
          medium border this used to override it with are gone, so the tray and
          the profile menu 6px to its right are one object. */}
      <PopoverContent
        align="end"
        sideOffset={6}
        className="w-[360px] overflow-hidden p-0"
      >
        <div className="flex items-center justify-between gap-2.5 border-b border-[var(--border-hairline)] px-4 py-[11px]">
          {/* "Activity" — the trigger's and the tooltip's word. This said
              "Notifications", and a panel that names itself differently from
              the thing that opens it reads as two systems. */}
          <p className="text-[13px] font-medium text-[var(--ink-900)]">
            Activity
          </p>
          {/* The workspace this feed is scoped to, in the same grey chip the
              search palette states its scope with. No chevron: the palette's
              chip switches workspace, and switching from a notification panel
              is not a move anyone means to make. Absent for a viewer holding
              one workspace — there is nothing it would be distinguishing from. */}
          {available.length > 1 && (
            <span className="flex h-5 shrink-0 items-center rounded-[6px] bg-[var(--surface-subtle)] px-[7px] text-[11px] text-[var(--ink-700)]">
              {active.name}
            </span>
          )}
        </div>

        <div className="flex max-h-[420px] flex-col overflow-y-auto p-2">
          {hasRows ? (
            <>
              {invites.map((invite) => (
                <InviteRow key={invite.id} invite={invite} />
              ))}
              {inFlight.map((item) => (
                <InFlightRow key={item.matchId} item={item} />
              ))}
              {failed.map((item) => (
                <FailedRow key={item.matchId} item={item} />
              ))}
            </>
          ) : (
            <p className="px-2.5 py-4 text-[12px] text-[var(--ink-500)]">
              Nothing running here.
            </p>
          )}

          {elsewhere.length > 0 && (
            <>
              <div className="mx-2.5 my-1.5 h-px bg-[var(--border-hairline)]" />
              {elsewhere.map((work) => (
                <ElsewhereRow key={work.workspaceId} work={work} />
              ))}
            </>
          )}
        </div>

        {/* The receipt. Every report that landed, every analysis that failed
            and was started over — the matches list already shows analysis
            state on every row, so this is a door to it rather than a second
            copy of its last two lines. */}
        <Link
          href="/dashboard/matches"
          onClick={() => setIsOpen(false)}
          className="flex items-center justify-between border-t border-[var(--border-hairline)] px-4 py-2.5 text-[11px] text-[var(--ink-600)] transition-colors duration-150 hover:bg-[var(--surface-subtle)] hover:text-[var(--ink-900)] focus-visible:outline-none focus-visible:bg-[var(--surface-subtle)]"
        >
          Everything that finished
          <ChevronRight
            className="size-[13px] text-[var(--ink-400)]"
            strokeWidth={1.5}
            aria-hidden="true"
          />
        </Link>
      </PopoverContent>
    </Popover>
  );
}
