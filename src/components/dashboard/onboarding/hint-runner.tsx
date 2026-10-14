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
 * seen this session, it re-checks on every change to the document
 * (`watchDocument`) until the anchor is in the document AND nothing carries
 * `role="dialog"` — Radix Dialog and Radix
 * Popover content both do, so the hint never lands on top of BetaWelcome or
 * an open menu. That wait gates opening only: once open, the hint's own
 * popover is a `role="dialog"` too, and it must not close itself over it.
 * If `when` turns false before it opens, it gives up and renders nothing;
 * if it turns false while the hint shows (the upload finished, the viewer
 * left the team), the box goes too — quietly, unstamped, since the moment it
 * spoke to has passed rather than been answered.
 *
 * Done and Skip (the X, Escape) both close it for good, and so does
 * `resolved` — the person did the thing the hint points at (opened the tray,
 * switched back), so it has nothing left to say. That holds whether the box
 * is showing or only due: a tray opened before the hint found its quiet
 * moment must not have the hint pop up on it once it closes. The
 * this-session guard (`tour-done:<hint>:<viewerId>`, the same key scheme as
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
  /**
   * The person did what the hint points at — the activity tray opened, the
   * viewer switched out of the team. A showing or due hint closes for good
   * (stamped, like Done); one that is not due is left alone.
   */
  resolved?: boolean;
}

const OPEN_DIALOG = '[role="dialog"]';

/**
 * Run `check` on the next frame and again after any change to the document,
 * at most once a frame, until it answers `true`. Everything the hint waits on
 * is a DOM change — the anchor mounting, a dialog or menu opening or closing,
 * the anchor leaving — so a `MutationObserver` wakes it exactly then, and a
 * page that sits still costs nothing: no per-frame loop for however long a
 * dialog stays open or an anchor stays away. Returns the cleanup.
 */
function watchDocument(check: () => boolean): () => void {
  let frame = 0;
  let done = false;
  const observer = new MutationObserver(() => schedule());
  function run() {
    frame = 0;
    if (done) return;
    if (check()) {
      done = true;
      observer.disconnect();
    }
  }
  function schedule() {
    if (!done && frame === 0) frame = requestAnimationFrame(run);
  }
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["role", "data-tour"],
  });
  schedule();
  return () => {
    done = true;
    observer.disconnect();
    if (frame) cancelAnimationFrame(frame);
  };
}

export function HintRunner({
  hint,
  viewerId,
  when,
  copyFacts,
  resolved = false,
}: HintRunnerProps) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [finished, setFinished] = useState(false);

  // Open: wait for the anchor and a moment with no dialog in the document.
  useEffect(() => {
    if (!when || anchor || finished || seenThisSession(hint, viewerId)) return;
    return watchDocument(() => {
      const element = findTarget(HINT_ANCHOR[hint]);
      if (!element || document.querySelector(OPEN_DIALOG)) return false;
      setAnchor(element);
      return true;
    });
  }, [when, anchor, finished, hint, viewerId]);

  // Open: if the anchor leaves the document (the tray unmounts, the sidebar
  // re-renders), withhold the box rather than pin it to a detached node. Not
  // a dismissal — the guard is untouched, so it may open again.
  useEffect(() => {
    if (!anchor) return;
    return watchDocument(() => {
      if (anchor.isConnected) return false;
      setAnchor(null);
      return true;
    });
  }, [anchor]);

  const finish = useCallback(() => {
    setFinished(true);
    setAnchor(null);
  }, []);

  // Adjusted during render (React's "state from a prop change" pattern), so
  // the box is gone in the same commit the condition changes in.
  // Answered — showing or only due: closed for good.
  if (resolved && !finished && (anchor !== null || when)) finish();
  // No longer due while it shows: withdrawn, not answered — unstamped, so a
  // later moment may offer it again.
  else if (!when && !finished && anchor !== null) setAnchor(null);

  // Finished — by Done, Skip or `resolved` — stamps it, once. The guard is
  // set before the action, so it holds for this session even when the action
  // fails; the action never throws by contract.
  useEffect(() => {
    if (!finished) return;
    rememberSeen(hint, viewerId);
    void markTourDone(hint).catch(() => undefined);
  }, [finished, hint, viewerId]);

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
