"use client";

import { useCallback, useEffect, useState } from "react";

import { watchDocument } from "@/components/dashboard/onboarding/hint-runner";
import { findTarget } from "@/components/dashboard/onboarding/seen-this-session";
import { TourPopover } from "@/components/ui/tour";

import {
  readSkipDead,
  readSkipDeadHintSeen,
  writeSkipDeadHintSeen,
} from "./film-room-prefs";

/** The `data-tour` value the report player puts on its Skip dead time glyph. */
export const SKIP_DEAD_HINT_ANCHOR = "skip-dead-time";

/**
 * The title is the glyph's own tooltip, word for word ("Skip dead time — on"
 * on hover), so the card and the control it points at name one thing.
 */
export const SKIP_DEAD_HINT_COPY = {
  title: "Skip dead time is on.",
  body: "The film jumps from the end of each point to the start of the next. Press this to watch everything in between.",
} as const;

/**
 * A beat between the last dialog closing and this card opening. On the
 * sample match the tour's final step is the Film row, so without it the
 * tour's Done and this spotlight were one motion — six spotlights in a row
 * for a first-run player.
 */
export const SKIP_DEAD_HINT_SETTLE_MS = 1500;

/**
 * The one-card hint on the report player's Skip dead time glyph: the control
 * is on by default (`DEFAULT_SKIP_DEAD`), and a film that jumps about on its
 * own needs one sentence of explanation the first time, with the way off.
 *
 * `TourPopover` at `index={0} total={1}`, as the shell's `HintRunner` draws
 * its cards — but not `HintRunner` itself: that one stamps a `users` column
 * through `markTourDone`, and the film room keeps every viewer preference in
 * localStorage (`film-room-prefs.ts`), so the flag that says this was seen
 * sits there beside the preference it explains, and a new device gets the
 * default and the explanation together.
 *
 * Two departures from the shell's hints, both for the anchor: the spotlight
 * is on (`dim`), because the glyph is 15px of white among six like it on a
 * dark bar and "press this" cannot point without it — the exception
 * `TourPopover`'s own `dim` doc names; and the box hangs off the glyph's
 * trailing edge (`align="end"`), since the glyph sits at the right-hand end
 * of the bar and a start-aligned box ran off the player onto the point list.
 *
 * It opens once the glyph is in the document and nothing else has carried
 * `role="dialog"` for `SKIP_DEAD_HINT_SETTLE_MS` — the beta welcome, the
 * sample tour, an open menu — and only while the preference is actually
 * on: someone who already turned skipping off has nothing to be told. Done,
 * the X and Escape close it for good; so does `resolved`, which the tab
 * raises when the glyph itself is pressed, since pressing the control
 * answers the hint. It never opens while the fullscreen room is up
 * (`when`), where the glyph it points at is a different element, and it
 * withdraws if its glyph leaves the document (the player swapping its frame
 * for the refusal panel) rather than pin itself to a detached node.
 */
export function FilmSkipDeadHint({
  when,
  resolved = false,
}: {
  /** The report player is the surface being watched (no room over it). */
  when: boolean;
  /** The glyph was pressed: close for good, showing or not. */
  resolved?: boolean;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [finished, setFinished] = useState(() => readSkipDeadHintSeen());

  // Open: wait for the glyph and a settled moment with no dialog in the
  // document. `watchDocument` wakes on DOM changes only; the settle timer
  // is armed when the conditions first hold and dropped if they stop
  // holding before it fires.
  useEffect(() => {
    if (!when || anchor || finished) return;
    let timer = 0;
    const ready = () => {
      if (!readSkipDead()) return null;
      const element = findTarget(SKIP_DEAD_HINT_ANCHOR);
      if (!element || document.querySelector('[role="dialog"]')) return null;
      return element;
    };
    const stop = watchDocument(() => {
      if (ready()) {
        if (timer === 0) {
          timer = window.setTimeout(() => {
            timer = 0;
            const element = ready();
            if (element) {
              stop();
              setAnchor(element);
            }
          }, SKIP_DEAD_HINT_SETTLE_MS);
        }
      } else if (timer !== 0) {
        window.clearTimeout(timer);
        timer = 0;
      }
      // Keep watching: the timer, not the check, is what opens the card.
      return false;
    });
    return () => {
      stop();
      if (timer) window.clearTimeout(timer);
    };
  }, [when, anchor, finished]);

  // Open: if the glyph leaves the document, withhold the box rather than
  // pin it to a detached node. Not a dismissal — unstamped, may open again.
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
    writeSkipDeadHintSeen();
  }, []);

  // Adjusted during render, so the box is gone in the commit the glyph was
  // pressed in. Not due any more (the room opened): withdrawn, unstamped.
  if (resolved && !finished) finish();
  else if (!when && anchor !== null) setAnchor(null);

  if (finished || !anchor) return null;

  return (
    <TourPopover
      open
      anchor={anchor}
      index={0}
      total={1}
      title={SKIP_DEAD_HINT_COPY.title}
      body={SKIP_DEAD_HINT_COPY.body}
      onNext={finish}
      onSkip={finish}
      side="top"
      align="end"
      dim
    />
  );
}
