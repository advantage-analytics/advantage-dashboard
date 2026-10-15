"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

import { AskAnswer } from "@/components/dashboard/ask/ask-answer";
import {
  AskComposer,
  type AskQuotaView,
} from "@/components/dashboard/ask/ask-composer";
import {
  AskFilmSeekContext,
  filmWatchTargetOf,
  type AskFilmSeek,
  type AskFilmWatchTarget,
} from "@/components/dashboard/ask/ask-film-seek";
import { AskPrompt } from "@/components/dashboard/ask/ask-prompt";
import { AskShowMe } from "@/components/dashboard/ask/ask-show";
import { askTagRows } from "@/components/dashboard/ask/ask-tag-menu";
import {
  useAskStream,
  type AskTag,
} from "@/components/dashboard/ask/use-ask-stream";
import { useMatchData } from "@/components/dashboard/matches/match-data-provider";
import { useOptionalWorkspace } from "@/components/dashboard/workspace-provider";
import type { AskMatchOption, AskTagOptions } from "@/lib/data/ask-tags";
import { matchDay } from "@/lib/data/match-day";
import { PERSONAL_ASK_SCOPE, type AskScope } from "@/lib/services/ask/scope";
import { cn } from "@/lib/utils";

import { useMatchSides } from "../use-match-sides";
import {
  escClosesRail,
  MATCH_REPORT_FRAME_ID,
  type FilterRailPhase,
} from "../match-filters/rail-state";

/**
 * Ask, inside the film room (roadmap 6.1): a 340px drawer over the Video
 * tab's list column with the match already tagged, where every answer's
 * "Watch" and "Show me" seeks the player beside it instead of leaving the
 * page.
 *
 * ── What it is made of ───────────────────────────────────────────────────
 * The Ask page's own pieces, unchanged: `useAskStream` posts to `/api/ask`
 * with `{ question, tags: [{ kind: "match", id }] }` exactly as the page
 * does, `AskComposer` writes the question, `AskPrompt` and `AskAnswer` draw
 * the exchange, and `AskShowMe` sits under a saved answer. The drawer owns
 * only the shell, the tag, and the seek.
 *
 * ── The seek ─────────────────────────────────────────────────────────────
 * Two ways in. The pieces this drawer owns (`AskShowMe`, the point list's
 * rows) read `AskFilmSeekContext` and call `watch` themselves. The pieces
 * it does not — a figure tile's "Watch", the sources' "Watch N points", a
 * momentum mark — are plain links into this match's Video tab, so a
 * capture-phase click handler on the thread turns their href into the same
 * target (`filmWatchTargetOf`) and calls `preventDefault` before `next/link`
 * sees the click. A link into another match, or anywhere else, navigates as
 * it always did.
 *
 * ── The shell ────────────────────────────────────────────────────────────
 * The filters drawer's (`match-filters/filter-rail.tsx`): portalled into
 * `MatchReportFrame`, the WIDTH animating on the roster drawer's keyframes,
 * Esc closing it, focus taken on open. `FilmRoom` holds the phase with the
 * same reducer the filters rail uses (`rail-state.ts`) and opens one or the
 * other, never both — they share the edge.
 *
 * ── Where the thread lives ───────────────────────────────────────────────
 * In `AskFilmDrawer`, which `FilmRoom` keeps mounted for as long as the
 * Video view is, and which draws nothing while shut. The shell — the sheet,
 * the portal, the focus — mounts and unmounts with the phase, so closing
 * the drawer to watch a point and opening it again finds the question and
 * its answer where they were; a switch to another view ends the thread, as
 * it ends the room's every other state (the conversation itself is saved,
 * and waits in the Ask page's rail). Mounting the stream above the portal
 * also keeps the server render honest: nothing reads the DOM until a click.
 */

/** The drawer's id — `aria-controls` on its trigger, and the film tab's key handler skips it. */
export const ASK_FILM_DRAWER_ID = "ask-film-drawer";

export const ASK_FILM_DRAWER_TITLE = "Ask about this match";
export const ASK_FILM_DRAWER_LEAD =
  "Every answer can open the film on the points it counted.";

const ICON_BUTTON =
  "inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-element)] text-[var(--ink-500)] transition-colors duration-[var(--duration-hover)] hover:bg-[var(--surface-subtle)] hover:text-[var(--ink-900)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none";

export interface AskFilmDrawerProps {
  phase: FilterRailPhase;
  /** Esc, the X. */
  onClose: () => void;
  /** The out animation ended — the drawer leaves the DOM. */
  onExited: () => void;
  /** Seek the player, or apply a cut and land on its first point (`film-tab.tsx`). */
  onWatch: (target: AskFilmWatchTarget) => void;
}

/** What the always-mounted parent hands the shell: the thread and its match. */
interface AskFilmThread {
  matchId: string;
  scope: AskScope;
  tagOptions: AskTagOptions;
  stream: ReturnType<typeof useAskStream>;
  /** Send the draft, the match tag always on it. */
  send: () => void;
}

/**
 * The thread's owner. Nothing on screen while shut, so the page is exactly
 * as it was until the control is pressed — but the question, its answer
 * and the draft stay here across a close and a reopen.
 */
export function AskFilmDrawer(props: AskFilmDrawerProps) {
  const { match } = useMatchData();
  const sides = useMatchSides();
  const workspace = useOptionalWorkspace()?.active ?? null;

  // Whose matches: the active workspace's. A team workspace asks about the
  // program's matches, as `/dashboard/team/ask` does; the route re-checks
  // the membership.
  const scope: AskScope = useMemo(
    () =>
      workspace?.kind === "team"
        ? { kind: "team", programId: workspace.id, programName: workspace.name }
        : PERSONAL_ASK_SCOPE,
    [workspace],
  );

  // The one thing `@` can tag here, and the tag the question always carries:
  // this match, named the way the tag menu names it (`askTagRows`), so a
  // chip here and a chip on the Ask page read the same.
  const { tagOptions, matchTag } = useMemo(() => {
    const option: AskMatchOption = {
      matchId: match.id,
      opponentName: sides.opp.name,
      playedOn: matchDay(match.date),
      iWon: null,
      scoreText: null,
      tournamentName: match.tournamentName ?? null,
      playerName: scope.kind === "team" ? sides.you.name : null,
    };
    const options: AskTagOptions = {
      matches: [option],
      opponents: [],
      players: [],
    };
    const row = askTagRows(options, "").matches[0];
    const tag: AskTag = row?.tag ?? {
      kind: "match",
      id: match.id,
      label: sides.opp.name,
    };
    return { tagOptions: options, matchTag: tag };
  }, [
    match.id,
    match.date,
    match.tournamentName,
    sides.opp.name,
    sides.you.name,
    scope.kind,
  ]);

  const stream = useAskStream({
    conversationId: null,
    messages: [],
    programId: scope.kind === "team" ? scope.programId : null,
  });
  const { setDraft, ask, state } = stream;

  // Pre-tagged: the draft opens with the match on it.
  useEffect(() => {
    setDraft({ text: "", tags: [matchTag] });
  }, [setDraft, matchTag]);

  // The tag is the drawer's promise, so a question goes out with it whether
  // or not the chip was removed from the composer.
  const send = useCallback(() => {
    const tags = state.draft.tags.some(
      (tag) => tag.kind === "match" && tag.id === matchTag.id,
    )
      ? state.draft.tags
      : [matchTag, ...state.draft.tags];
    void ask({ text: state.draft.text, tags });
  }, [ask, state.draft, matchTag]);

  const thread = useMemo<AskFilmThread>(
    () => ({ matchId: match.id, scope, tagOptions, stream, send }),
    [match.id, scope, tagOptions, stream, send],
  );

  if (props.phase === "closed") return null;
  const shell = <AskFilmDrawerShell {...props} thread={thread} />;
  // Only ever open after a click, so reading the DOM here never runs on the
  // server. Without a host (an offline harness that mounts `FilmTab` on its
  // own) it renders in place instead of vanishing.
  const host =
    typeof document === "undefined"
      ? null
      : document.getElementById(MATCH_REPORT_FRAME_ID);
  return host ? createPortal(shell, host) : shell;
}

function AskFilmDrawerShell({
  phase,
  onClose,
  onExited,
  onWatch,
  thread,
}: AskFilmDrawerProps & { thread: AskFilmThread }) {
  const closing = phase === "closing";
  const panelRef = useRef<HTMLDivElement>(null);
  const { matchId, scope, tagOptions, send } = thread;
  const { state, setDraft, ask, rate } = thread.stream;

  const seek = useMemo<AskFilmSeek>(
    () => ({ matchId, watch: onWatch }),
    [matchId, onWatch],
  );

  // Links the answer draws itself: into this match's film, they seek.
  const interceptLinks = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey
      ) {
        return;
      }
      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (!anchor) return;
      const target = filmWatchTargetOf(
        anchor.getAttribute("href") ?? "",
        matchId,
      );
      if (!target) return;
      event.preventDefault();
      onWatch(target);
    },
    [matchId, onWatch],
  );

  // Take focus on open so Esc and Tab start inside the drawer.
  useEffect(() => {
    if (phase !== "open") return;
    const frame = requestAnimationFrame(() =>
      panelRef.current?.focus({ preventScroll: true }),
    );
    return () => cancelAnimationFrame(frame);
  }, [phase]);

  // `motion-reduce:animate-none` means no `animationend` ever fires.
  useEffect(() => {
    if (
      closing &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      onExited();
    }
  }, [closing, onExited]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (escClosesRail(phase, event)) onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [phase, onClose]);

  const quota: AskQuotaView | null = state.usage
    ? { ...state.usage, resetsOn: null }
    : null;

  return (
    <aside
      id={ASK_FILM_DRAWER_ID}
      aria-label={ASK_FILM_DRAWER_TITLE}
      data-ask-film-drawer=""
      inert={closing}
      onAnimationEnd={(event) => {
        if (event.animationName === "roster-drawer-out") onExited();
      }}
      className={cn(
        "absolute inset-y-0 right-0 z-30 overflow-hidden border-l border-[var(--border-hairline)] bg-[var(--surface-card)] shadow-[var(--shadow-dropdown)] motion-reduce:animate-none",
        closing
          ? "w-0 animate-[roster-drawer-out_200ms_var(--ease-primary)_both]"
          : "w-[340px] animate-[roster-drawer-in_200ms_var(--ease-primary)_both]",
      )}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="flex h-full w-[340px] flex-col outline-none"
      >
        <div className="flex h-11 shrink-0 items-center gap-2 border-b border-[var(--border-hairline)] pr-3 pl-5">
          <h2 className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--ink-900)]">
            {ASK_FILM_DRAWER_TITLE}
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className={ICON_BUTTON}
          >
            <X className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
          </button>
        </div>

        <AskFilmSeekContext value={seek}>
          <div
            className="flex min-h-0 flex-1 flex-col gap-8 overflow-y-auto px-5 py-4"
            onClickCapture={interceptLinks}
          >
            {state.exchanges.length === 0 ? (
              <p className="text-body-sm max-w-[34ch]">
                {ASK_FILM_DRAWER_LEAD}
              </p>
            ) : (
              state.exchanges.map((exchange, index) => {
                const { answerId } = exchange.answer;
                return (
                  <article key={exchange.id} className="flex flex-col gap-6">
                    <AskPrompt
                      text={exchange.question.text}
                      tags={exchange.question.tags}
                    />
                    <AskAnswer
                      answer={exchange.answer}
                      scope={scope}
                      onChoose={
                        index === state.exchanges.length - 1
                          ? (option) =>
                              void ask({
                                ...exchange.question,
                                text: `${exchange.question.text} (${option})`,
                              })
                          : undefined
                      }
                      onRate={
                        answerId
                          ? (feedback) => rate(answerId, feedback)
                          : undefined
                      }
                    />
                    {exchange.answer.status === "done" && answerId && (
                      <AskShowMe
                        answerId={answerId}
                        sources={exchange.answer.sources}
                      />
                    )}
                  </article>
                );
              })
            )}
          </div>
        </AskFilmSeekContext>

        <div className="flex shrink-0 flex-col gap-2 border-t border-[var(--border-hairline)] px-4 py-3">
          {state.refusal && (
            <p
              role="alert"
              className="rounded-[var(--radius-button)] border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3 py-2 text-[12px] text-[var(--danger-text)]"
            >
              {state.refusal.message}
            </p>
          )}
          <AskComposer
            value={state.draft}
            onChange={setDraft}
            onSubmit={send}
            tagOptions={tagOptions}
            scope={scope}
            quota={quota}
            pending={state.inFlight}
          />
        </div>
      </div>
    </aside>
  );
}
