"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { BLACK_VIDEO_WIDTH, LabelRailAside } from "./label-black-view";

/** The film's and the court's card on the light page: the court card's dark. */
const STAGE_CARD =
  "rounded-[var(--radius-card)] bg-[var(--surface-dark)] shadow-[var(--shadow-card)]";

/**
 * The console's "Docked side" view: the full-screen view's arrangement inside
 * the admin page, under the console's own header. The same three pieces, handed
 * in by the console: the film and the court as two dark cards, the rail as a
 * white card at the width both views share (`useRailWidth`).
 *
 * The film's box follows `BLACK_VIDEO_WIDTH`; the card keeps the stage's whole
 * width and the capped frame sits centred in it. Nothing is covered and nothing
 * is made inert.
 */
export function LabelSideView({
  initialRailWidth,
  video,
  court,
  placing = false,
  arrive = false,
  children,
}: {
  /** Fade the view in (`label-layer-in-docked`). Off on first render. */
  arrive?: boolean;
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
  return (
    <div
      data-label-side=""
      className={cn(
        "flex min-h-0 flex-1 gap-4",
        arrive && "label-layer-in-docked",
      )}
    >
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
        initialRailWidth={initialRailWidth}
        className="rounded-[var(--radius-card)] bg-[var(--surface-card)] shadow-[var(--shadow-card)]"
        boxClassName="overflow-hidden rounded-[var(--radius-card)]"
      >
        {children}
      </LabelRailAside>
    </div>
  );
}
