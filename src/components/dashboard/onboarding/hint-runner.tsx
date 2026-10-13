"use client";

import { useCallback, useEffect, useState } from "react";

import { markTourDone } from "@/app/dashboard/onboarding-actions";
import {
  findTarget,
  rememberSeen,
  seenThisSession,
} from "@/components/dashboard/onboarding/seen-this-session";
import { TourPopover } from "@/components/ui/tour";
import {
  HINT_ANCHOR,
  HINT_SIDE,
  hintCopy,
  type HintCopyFacts,
} from "@/lib/onboarding/hints";
import type { HintId } from "@/lib/onboarding/tours";

/**
 * Drives one of the shell's one-card hints: `TourPopover` at `index={0}
 * total={1}` (no step bar, no counter) on the hint's `[data-tour]` anchor.
 * The one-step sibling of `TourRunner`, which is bound to the match report
 * and its view switching and so cannot mount in the shell.
 *
 * Opening waits for a quiet moment: while `when` holds and the hint was not
 * seen this session, it polls `requestAnimationFrame` until the anchor is in
 * the document AND nothing carries `role="dialog"` — Radix Dialog and Radix
 * Popover content both do, so the hint never lands on top of BetaWelcome or
 * an open menu. That wait gates opening only: once open, the hint's own
 * popover is a `role="dialog"` too, and it must not close itself over it.
 * If `when` turns false before it opens, it gives up and renders nothing.
 *
 * Done and Skip (the X, Escape) both close it for good: the this-session
 * guard (`tour-done:<hint>:<viewerId>`, the same key scheme as
 * `TourRunner`'s) is set first, so it holds even when `markTourDone` fails.
 */

export interface HintRunnerProps {
  hint: HintId;
  /** Whose hint this is: keys the this-session guard. */
  viewerId: string;
  /** The hint is due (`workspaceHintDue` / `activityHintDue`). */
  when: boolean;
  /** Facts the copy interpolates — the team's name for the switcher hint. */
  copyFacts?: HintCopyFacts;
}

const OPEN_DIALOG = '[role="dialog"]';

export function HintRunner({
  hint,
  viewerId,
  when,
  copyFacts,
}: HintRunnerProps) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [finished, setFinished] = useState(false);

  // Open: poll for the anchor and a moment with no dialog in the document.
  useEffect(() => {
    if (!when || anchor || finished || seenThisSession(hint, viewerId)) return;
    let frame = 0;
    const look = () => {
      const element = findTarget(HINT_ANCHOR[hint]);
      if (element && !document.querySelector(OPEN_DIALOG)) {
        setAnchor(element);
        return;
      }
      frame = requestAnimationFrame(look);
    };
    frame = requestAnimationFrame(look);
    return () => cancelAnimationFrame(frame);
  }, [when, anchor, finished, hint, viewerId]);

  // Open: if the anchor leaves the document (the tray unmounts, the sidebar
  // re-renders), withhold the box rather than pin it to a detached node. Not
  // a dismissal — the guard is untouched, so it may open again.
  useEffect(() => {
    if (!anchor) return;
    let frame = 0;
    const watch = () => {
      if (!anchor.isConnected) {
        setAnchor(null);
        return;
      }
      frame = requestAnimationFrame(watch);
    };
    frame = requestAnimationFrame(watch);
    return () => cancelAnimationFrame(frame);
  }, [anchor]);

  const finish = useCallback(() => {
    setFinished(true);
    setAnchor(null);
    rememberSeen(hint, viewerId);
    // The action never throws by contract; a transport failure still leaves
    // the hint closed — the guard above already holds for this session.
    void markTourDone(hint).catch(() => undefined);
  }, [hint, viewerId]);

  if (finished || !anchor) return null;

  const { title, body } = hintCopy(hint, copyFacts ?? {});

  return (
    <TourPopover
      open
      anchor={anchor}
      index={0}
      total={1}
      title={title}
      body={body}
      onNext={finish}
      onSkip={finish}
      side={HINT_SIDE[hint]}
    />
  );
}
