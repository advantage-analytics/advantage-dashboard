"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { Activity, ChevronRight, CircleX } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ChromeTooltip } from "@/components/dashboard/shared/chrome-tooltip";
import { WorkspaceScopeChip } from "@/components/dashboard/shared/workspace-scope-chip";
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

/** The one row measure. Every row — div, link or button — draws from it. */
const ROW_CLASS = "flex gap-3 rounded-[9px] px-2.5 py-3";

/** The interactive rows' hover and focus, on top of `ROW_CLASS`. */
const ROW_INTERACTIVE_CLASS =
  "transition-colors duration-150 hover:bg-[var(--surface-subtle)] focus-visible:bg-[var(--surface-subtle)] focus-visible:outline-none";

/** Blue text action — the row it sits in already carries the emphasis. */
const TEXT_ACTION_CLASS =
  "text-[12px] font-medium text-[var(--blue)] transition-colors duration-150 hover:text-[var(--blue-hover)] focus-visible:outline-none focus-visible:underline disabled:opacity-60 cursor-pointer";

/** Grey text link beside a blue action. */
const TEXT_LINK_CLASS =
  "text-[12px] text-[var(--ink-600)] transition-colors duration-150 hover:text-[var(--ink-900)] focus-visible:outline-none focus-visible:underline";

/**
 * The 14px leading column. One definition, so the x every row's text starts
 * on is one number rather than three copies of it.
 */
function Lead({ children }: { children?: React.ReactNode }) {
  return <span className="flex w-[14px] shrink-0 justify-center">{children}</span>;
}

const DOT = (
  <span
    aria-hidden="true"
    className="mt-[5px] size-1.5 rounded-full bg-[var(--blue)]"
  />
);

const RING = (
  <span
    aria-hidden="true"
    className="size-[7px] rounded-full border-[1.5px] border-[var(--blue)]"
  />
);

function InFlightRow({ item }: { item: ActivityItem }) {
  const { analysis, title } = item;

  return (
    <Link
      href={`/dashboard/matches/${item.matchId}`}
      className={cn(ROW_CLASS, ROW_INTERACTIVE_CLASS)}
    >
      <Lead>{DOT}</Lead>
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
 *
 * The button keeps a border, unlike Accept: it is destructive-adjacent — it
 * spends video budget. Hand-drawn at 24px because `advButton`'s smallest
 * size is 32px, which is a page control, not a row control.
 */
function FailedRow({ item }: { item: ActivityItem }) {
  return (
    <div className={ROW_CLASS}>
      <Lead>
        <CircleX
          className="size-[14px] text-[var(--danger)]"
          strokeWidth={1.5}
          aria-hidden="true"
        />
      </Lead>
      <span className="flex min-w-0 flex-1 items-center gap-3">
        <Link
          href={`/dashboard/matches/${item.matchId}`}
          className="min-w-0 flex-1 truncate text-[12px] text-[var(--ink-900)] hover:underline focus-visible:outline-none focus-visible:underline"
        >
          Analysis failed — <b className="font-medium">{item.title}</b>
        </Link>
        <Link
          href="/dashboard/matches/new"
          className="flex h-6 shrink-0 items-center rounded-[6px] border border-[var(--border-medium)] bg-[var(--surface-card)] px-[9px] text-[12px] text-[var(--ink-700)] transition-colors duration-150 hover:bg-[var(--surface-subtle)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
        >
          Start over
        </Link>
      </span>
    </div>
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
 * row, in its own words; a rejection that is not Next's own redirect signal
 * gets a sentence of ours, so the row never sits on "Joining…" forever.
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
      try {
        const result = await acceptPendingInvite(invite.id);
        if (result && !result.ok) {
          setError(result.error);
          setConfirming(false);
        }
      } catch (caught) {
        // Success is a redirect, which arrives as a throw; let it through.
        unstable_rethrow(caught);
        setError("We couldn't finish that. Try again in a moment.");
        setConfirming(false);
      }
    });
  };

  const beginConfirm = () => {
    setError(null);
    setConfirming(true);
  };

  return (
    <div className={cn(ROW_CLASS, "bg-[var(--surface-subtle)]")}>
      <Lead>{DOT}</Lead>
      <div className="flex min-w-0 flex-1 flex-col">
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
                onClick={beginConfirm}
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
      </div>
    </div>
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
          // than resolving. A refused id resolves, and `isPending` clears on
          // its own; nothing here to unwind.
          await setActiveWorkspace(work.workspaceId);
        })
      }
      className={cn(
        ROW_CLASS,
        ROW_INTERACTIVE_CLASS,
        "w-full items-center py-[11px] text-left disabled:opacity-60 cursor-pointer"
      )}
    >
      <Lead>{RING}</Lead>
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
  const { viewer } = useWorkspace();
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
   * other workspaces' work is a count the tray shows, not a feed it follows —
   * so `elsewhere` is as fresh as the last RSC render, and no fresher.
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

  // Everything waiting on the reader or moving for them. Invitations count
  // but NOT toward the live subscription above: they arrive with the RSC
  // payload and change only when a coach sends one, which no socket here
  // would learn about anyway. Failures count because their row carries a
  // button now — a dot that vanished the moment an upload failed was saying
  // "nothing here" over the one row that needed someone.
  const unread = inFlight.length + invites.length + failed.length;
  const elsewhereCount = elsewhere.reduce((sum, work) => sum + work.count, 0);

  // The trigger carries a dot, not a number: the chrome has no numeric badges,
  // so the count lives here — in the tooltip and, word for word, in the
  // aria-label — and in the tray itself.
  const detail = trayDetail(
    invites.length,
    inFlight.length,
    elsewhereCount,
    failed.length
  );

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
                className="absolute right-[2.5px] top-[2.5px] size-[7px] rounded-full border-[1.5px] border-[var(--blue)] bg-[var(--surface-card)]"
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
          {/* The workspace this feed is scoped to — the same chip the search
              palette states its scope with, and absent for the same viewer. */}
          <WorkspaceScopeChip />
        </div>

        <div className="flex max-h-[420px] flex-col overflow-y-auto p-2">
          {unread > 0 ? (
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
