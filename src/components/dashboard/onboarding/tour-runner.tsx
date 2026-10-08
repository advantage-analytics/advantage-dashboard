"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { markTourDone } from "@/app/dashboard/onboarding-actions";
import { useMatchReport } from "@/components/dashboard/matches/match-detail/match-report-context";
import { TourPopover } from "@/components/ui/tour";
import {
  resolveSteps,
  TOUR_TARGET_VIEW,
  TOUR_TARGETS,
  type TourId,
  type TourTarget,
} from "@/lib/onboarding/tours";

/**
 * Drives a first-run report tour (design §5–§6): keeps the steps whose
 * `[data-tour]` target the report renders (`resolveSteps`), and walks
 * `TourPopover` through them. Mounts inside `MatchReportProvider`, after the
 * report's parts, so a step with a `tab` can switch the view through
 * `actions.selectView` before anchoring.
 *
 * It owns three things the popover deliberately does not: finding the
 * element, remembering that the tour was seen, and switching views. It does
 * not own scrolling — `TourPopover` brings each new anchor into view itself,
 * `behavior: "auto"` under `prefers-reduced-motion`.
 *
 * Which steps run is settled in two passes, because a target can be absent
 * for two reasons. At open, a target missing from the view it lives in
 * (`TOUR_TARGET_VIEW`: the rail, or the Statistics sections while Statistics
 * is showing) is known absent — a report with no film, or no points — and
 * its step is dropped before the counter is first printed. A target that is
 * only out of view (the Statistics sections while Film is open, from
 * `?tab=film` or the viewer's preference) is kept, and resolved AFTER its
 * step switches to its view. Only a target that then never appears skips
 * its step, and the counter shrinks by one — it never names a step the
 * report was already seen to lack.
 *
 * Seen-ness lives in two places. `markTourDone(tour)` stamps
 * `users.<tour>_done_at` for next session; `sessionStorage["tour-done:
 * <tour>:<viewerId>"]` stops THIS session re-opening it (a navigation back to
 * the page passes `start` again before the server has re-read the row), and
 * still holds when the action fails — a tour that repeats next session is
 * harmless, one that loops now is not. Keyed by viewer, so a sign-out and
 * sign-in as someone else in one tab is not blocked by the first viewer's
 * tour; and `requested` (the page's `?tour=1`) bypasses it, since someone
 * who asked for the tour by URL has answered the question the guard asks.
 * No partial step index anywhere: re-entering restarts at 1.
 *
 * Opening and anchoring both wait a frame. The report's sections commit
 * beside this component, and a view switch mounts its content a tick later,
 * so the target is polled on `requestAnimationFrame` (briefly) rather than
 * read once. Between steps the box stays on the previous anchor until the
 * next is found — Radix moves it, no remount — unless that element is gone
 * or about to go with a view switch, in which case the popover is withheld
 * (nothing for a frame or two) rather than pinned to a detached node. That
 * withholding unmounts the popover, which returns focus as its contract
 * says; the next anchor re-opens it and focus lands on Next again.
 */

export interface TourRunnerProps {
  tour: TourId;
  /** Whose tour this is: keys the this-session guard. */
  viewerId: string;
  /** Open the tour. Ignored while one is already running or after it was seen this session. */
  start: boolean;
  /**
   * The viewer asked for the tour by URL (`?tour=1`): open it even if it was
   * seen this session.
   */
  requested?: boolean;
}

/** Frames to wait for a step's target before giving up on that step (~1s). */
const TARGET_WAIT_FRAMES = 60;

const guardKey = (tour: TourId, viewerId: string) =>
  `tour-done:${tour}:${viewerId}`;

function seenThisSession(tour: TourId, viewerId: string): boolean {
  try {
    return sessionStorage.getItem(guardKey(tour, viewerId)) !== null;
  } catch {
    return false;
  }
}

function rememberSeen(tour: TourId, viewerId: string) {
  try {
    sessionStorage.setItem(guardKey(tour, viewerId), "1");
  } catch {
    // Private windows and blocked storage: the server stamp still lands.
  }
}

function findTarget(target: TourTarget): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-tour="${target}"]`);
}

/** The rail's targets open to the right; the body's open below. */
const SIDE_BY_TARGET: Record<TourTarget, "right" | "bottom"> = {
  scoreboard: "right",
  shots: "right",
  film: "right",
  insight: "bottom",
  "head-to-head": "bottom",
};

export function TourRunner({
  tour,
  viewerId,
  start,
  requested = false,
}: TourRunnerProps) {
  const { state, actions } = useMatchReport();
  // `actions` is rebuilt on every view change; the effects want the latest
  // `selectView` and view without re-running for them.
  const selectViewRef = useRef(actions.selectView);
  const viewRef = useRef(state.view);
  useEffect(() => {
    selectViewRef.current = actions.selectView;
    viewRef.current = state.view;
  }, [actions, state.view]);

  /**
   * The running tour, `null` between tours: the targets seen to be missing
   * (at open, or after a step waited in vain) and the step index into the
   * steps that leaves.
   */
  const [run, setRun] = useState<{
    absent: ReadonlySet<TourTarget>;
    index: number;
  } | null>(null);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  /** The target `anchor` was found for. */
  const anchoredRef = useRef<TourTarget | null>(null);

  const absent = run?.absent ?? null;
  const steps = useMemo(
    () =>
      absent
        ? resolveSteps(
            tour,
            TOUR_TARGETS.filter((target) => !absent.has(target)),
          )
        : null,
    [tour, absent],
  );
  const index = run?.index ?? 0;

  // Open: one frame after `start`, so the report's own commit has landed.
  useEffect(() => {
    if (!start || (!requested && seenThisSession(tour, viewerId))) return;
    const frame = requestAnimationFrame(() => {
      // Known absent: missing from the view it lives in. Anything else may
      // still appear once its step switches views.
      const view = viewRef.current;
      const missing = TOUR_TARGETS.filter((target) => {
        const home = TOUR_TARGET_VIEW[target];
        return (home === null || home === view) && !findTarget(target);
      });
      const present = TOUR_TARGETS.filter((t) => !missing.includes(t));
      if (resolveSteps(tour, present).length === 0) return;
      setRun((running) => running ?? { absent: new Set(missing), index: 0 });
    });
    return () => cancelAnimationFrame(frame);
  }, [start, requested, tour, viewerId]);

  const finish = useCallback(() => {
    setRun(null);
    setAnchor(null);
    anchoredRef.current = null;
    rememberSeen(tour, viewerId);
    // The action never throws by contract; a transport failure is still not
    // this component's problem — the tour is closed either way.
    void markTourDone(tour).catch(() => undefined);
  }, [tour, viewerId]);

  const step = steps?.[index] ?? null;
  const total = steps?.length ?? 0;

  const advance = useCallback(() => {
    if (index >= total - 1) finish();
    else setRun((running) => running && { ...running, index: index + 1 });
  }, [index, total, finish]);

  // The step's target never appeared: drop it. The steps shrink around the
  // same index, which now names the next step — or nothing, when it was last.
  const skipAbsent = useCallback(
    (target: TourTarget) => {
      if (index >= total - 1) finish();
      else
        setRun(
          (running) =>
            running && {
              ...running,
              absent: new Set([...running.absent, target]),
            },
        );
    },
    [index, total, finish],
  );

  // Anchor the current step: switch the view it names, then wait for its
  // target to be in the document.
  useEffect(() => {
    if (!step) return;
    const switching = step.tab !== undefined && step.tab !== viewRef.current;
    if (switching && step.tab) selectViewRef.current(step.tab);

    // Keep the box where it is until the new target is found — unless the
    // element it points at is detached, or lives in the view that is about
    // to leave; then withhold it rather than pin it to nothing.
    setAnchor((current) => {
      if (!current?.isConnected) return null;
      const anchored = anchoredRef.current;
      if (switching && anchored && TOUR_TARGET_VIEW[anchored] !== null)
        return null;
      return current;
    });

    let frame = 0;
    let tries = 0;
    const look = () => {
      const element = findTarget(step.target);
      if (element) {
        anchoredRef.current = step.target;
        setAnchor(element);
        return;
      }
      // The previous anchor went while waiting (a view switch unmounted it).
      setAnchor((current) => (current?.isConnected ? current : null));
      if (tries++ < TARGET_WAIT_FRAMES) {
        frame = requestAnimationFrame(look);
        return;
      }
      skipAbsent(step.target);
    };
    frame = requestAnimationFrame(look);
    return () => cancelAnimationFrame(frame);
  }, [step, skipAbsent]);

  if (!step || !anchor) return null;

  return (
    <TourPopover
      open
      anchor={anchor}
      index={index}
      total={total}
      title={step.title}
      body={step.body}
      onNext={advance}
      onSkip={finish}
      side={SIDE_BY_TARGET[step.target]}
    />
  );
}
