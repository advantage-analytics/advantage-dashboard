"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { markTourDone } from "@/app/dashboard/onboarding-actions";
import { useMatchReport } from "@/components/dashboard/matches/match-detail/match-report-context";
import { TourPopover } from "@/components/ui/tour";
import {
  resolveSteps,
  TOUR_TARGETS,
  type TourId,
  type TourStep,
  type TourTarget,
} from "@/lib/onboarding/tours";

/**
 * Drives a first-run report tour (design §5–§6): finds the `[data-tour]`
 * targets the report actually rendered, keeps the steps whose target is
 * present (`resolveSteps`), and walks `TourPopover` through them. Mounts
 * inside `MatchReportProvider`, after the report's parts, so a step with a
 * `tab` can switch the view through `actions.selectView` before anchoring.
 *
 * It owns three things the popover deliberately does not: finding the
 * element, remembering that the tour was seen, and switching views. It does
 * not own scrolling — `TourPopover` brings each new anchor into view itself,
 * `behavior: "auto"` under `prefers-reduced-motion`.
 *
 * Seen-ness lives in two places. `markTourDone(tour)` stamps
 * `users.<tour>_done_at` for next session; `sessionStorage["tour-done:<tour>"]`
 * stops THIS session re-opening it (a navigation back to the page passes
 * `start` again before the server has re-read the row), and still holds when
 * the action fails — a tour that repeats next session is harmless, one that
 * loops now is not. No partial step index anywhere: re-entering restarts at 1.
 *
 * Opening and anchoring both wait a frame. The report's sections commit
 * beside this component, and a view switch mounts its content a tick later,
 * so the target is polled on `requestAnimationFrame` (briefly) rather than
 * read once. A target that never appears skips its step.
 */

export interface TourRunnerProps {
  tour: TourId;
  /** Open the tour. Ignored while one is already running or after it was seen this session. */
  start: boolean;
}

/** Frames to wait for a step's target before giving up on that step (~1s). */
const TARGET_WAIT_FRAMES = 60;

const guardKey = (tour: TourId) => `tour-done:${tour}`;

function seenThisSession(tour: TourId): boolean {
  try {
    return sessionStorage.getItem(guardKey(tour)) !== null;
  } catch {
    return false;
  }
}

function rememberSeen(tour: TourId) {
  try {
    sessionStorage.setItem(guardKey(tour), "1");
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

export function TourRunner({ tour, start }: TourRunnerProps) {
  const { actions } = useMatchReport();
  // `actions` is rebuilt on every view change; the anchoring effect wants the
  // latest `selectView` without re-running for it.
  const selectViewRef = useRef(actions.selectView);
  useEffect(() => {
    selectViewRef.current = actions.selectView;
  }, [actions]);

  /** The resolved steps while a tour runs; `null` between tours. */
  const [steps, setSteps] = useState<TourStep[] | null>(null);
  const [index, setIndex] = useState(0);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  // Open: one frame after `start`, so the report's own commit has landed.
  useEffect(() => {
    if (!start || seenThisSession(tour)) return;
    const frame = requestAnimationFrame(() => {
      const present = TOUR_TARGETS.filter((target) => findTarget(target));
      const resolved = resolveSteps(tour, present);
      if (resolved.length === 0) return;
      setSteps((running) => running ?? resolved);
      setIndex(0);
    });
    return () => cancelAnimationFrame(frame);
  }, [start, tour]);

  const finish = useCallback(() => {
    setSteps(null);
    rememberSeen(tour);
    // The action never throws by contract; a transport failure is still not
    // this component's problem — the tour is closed either way.
    void markTourDone(tour).catch(() => undefined);
  }, [tour]);

  const step = steps?.[index] ?? null;
  const total = steps?.length ?? 0;

  const advance = useCallback(() => {
    if (index >= total - 1) finish();
    else setIndex(index + 1);
  }, [index, total, finish]);

  // Anchor the current step: switch the view it names, then wait for its
  // target to be in the document.
  useEffect(() => {
    if (!step) return;
    if (step.tab) selectViewRef.current(step.tab);

    let frame = 0;
    let tries = 0;
    const look = () => {
      const element = findTarget(step.target);
      if (element) {
        setAnchor(element);
        return;
      }
      if (tries++ < TARGET_WAIT_FRAMES) {
        frame = requestAnimationFrame(look);
        return;
      }
      // Gone since it was resolved: skip the step rather than point at nothing.
      advance();
    };
    frame = requestAnimationFrame(look);
    return () => cancelAnimationFrame(frame);
  }, [step, advance]);

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
