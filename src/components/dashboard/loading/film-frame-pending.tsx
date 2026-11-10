import { cn } from "@/lib/utils";

import { PendingBar, PendingRegion } from "./pending";

/**
 * The film player's 16:9 frame, pending: pulsing in the skeleton token rather
 * than the loaded frame's dark ground, because this is a request in flight
 * (a chunk, a metadata fetch, a credential being re-signed), not a film.
 *
 * `overlay` sits it over a live `<video>` inside the player's own frame — the
 * element stays mounted underneath, which is what the refresh harness and
 * the fullscreen room watch. There it draws square corners: the player's
 * frame clips them, and a cover rounded on the same curve antialiased its own
 * edge and let the frame's dark ground through as a fringe at each corner.
 *
 * Its own file, with no import beyond the primitives: `film-player.tsx` draws
 * it, and the film harness bundles that player for the browser — the rest of
 * `match-report-pending.tsx` reaches the report frame and, through its
 * context, `next/navigation`, which that bundle cannot resolve.
 */
export function FilmFramePending({
  overlay = false,
  caption,
}: {
  overlay?: boolean;
  caption?: string;
}) {
  const corners = overlay ? "rounded-none" : "rounded-[14px]";
  return (
    <PendingRegion
      label="video"
      className={overlay ? "absolute inset-0" : "aspect-video w-full"}
      innerClassName={cn(
        "relative flex h-full items-end overflow-hidden",
        corners,
      )}
    >
      <PendingBar className={cn("absolute inset-0 h-full w-full", corners)} />
      {caption ? (
        <span
          className="text-micro relative px-4 pb-3"
          style={{ color: "var(--ink-500)" }}
        >
          {caption}
        </span>
      ) : null}
    </PendingRegion>
  );
}
