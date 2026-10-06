"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  BLACK_VIDEO_WIDTH,
  LabelRailAside,
  useRailWidth,
} from "./label-black-view";

/** The film's and the court's card on the light page: the court card's dark. */
const STAGE_CARD =
  "rounded-[var(--radius-card)] bg-[var(--surface-dark)] shadow-[var(--shadow-card)]";

/**
 * The console's "Docked side" view: the full-screen view's arrangement
 * (`label-black-view.tsx` — the film top-left with its transport, the court
 * under it, the points rail down the right) inside the admin page, under the
 * console's own header, in the page's light chrome.
 *
 * The same three pieces, handed in by the console so the player keeps its
 * ref, its transport and its clock across a switch of layout: the shared
 * `LabelVideoPlayer` and `LabelCourtPanel`, and the rail (`LabelBlackRail`,
 * in its light tone). The film and the court stay dark — a film is watched on
 * black — as two cards on the page; the rail is a white card. Its width is
 * the full-screen view's own (`useRailWidth`, one stored number for both),
 * its handle on its left edge in the gap between the two.
 *
 * The film's box follows the full screen's rule (`BLACK_VIDEO_WIDTH`): 16:9
 * of the stage's width until that would crowd the court, then capped. Here
 * the card keeps the stage's whole width and the capped frame sits centred
 * on its dark ground, so the two cards' edges line up.
 *
 * Nothing is covered and nothing is made inert: this is a column of the
 * page, not a layer over it.
 */
export function LabelSideView({
  initialRailWidth,
  video,
  court,
  placing = false,
  children,
}: {
  /** The rail's width on first render, in px — for specs. */
  initialRailWidth?: number;
  /** The shared `LabelVideoPlayer`. */
  video: ReactNode;
  /** The shared `LabelCourtPanel`. */
  court: ReactNode;
  /** A stroke is selected and a court click would write: the card's outline. */
  placing?: boolean;
  /** The rail's contents — `LabelBlackRail`, in its light tone. */
  children: ReactNode;
}) {
  const rail = useRailWidth(initialRailWidth);

  return (
    <div data-label-side="" className="flex min-h-0 flex-1 gap-4">
      {/* The stage: a size container, for the film's cap. */}
      <div
        data-label-side-stage=""
        className="[container-type:size] flex min-h-0 min-w-0 flex-1 flex-col gap-4"
      >
        <div
          data-label-side-video=""
          className={cn(
            STAGE_CARD,
            "flex shrink-0 justify-center overflow-hidden",
          )}
        >
          <div
            className="aspect-video max-w-full"
            style={{ width: BLACK_VIDEO_WIDTH }}
          >
            {video}
          </div>
        </div>
        <div
          data-label-side-court=""
          data-court-placing={placing ? "true" : "false"}
          className={cn(
            STAGE_CARD,
            "flex min-h-0 flex-1 flex-col px-3 pt-3 pb-2.5 transition-[box-shadow] duration-150",
            placing && "shadow-[0_0_0_1.5px_var(--blue),var(--shadow-card)]",
          )}
        >
          {court}
        </div>
      </div>

      <LabelRailAside
        tone="light"
        rail={rail}
        className="rounded-[var(--radius-card)] bg-[var(--surface-card)] shadow-[var(--shadow-card)]"
        boxClassName="overflow-hidden rounded-[var(--radius-card)]"
      >
        {children}
      </LabelRailAside>
    </div>
  );
}
