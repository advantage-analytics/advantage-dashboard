import { PendingBar, PendingRegion } from "./pending";

/**
 * The film player's 16:9 frame, pending: pulsing in the skeleton token rather
 * than the loaded frame's dark ground, because this is a request in flight
 * (a chunk, a metadata fetch, a credential being re-signed), not a film.
 *
 * `overlay` sits it over a live `<video>` inside the player's own frame — the
 * element stays mounted underneath, which is what the refresh harness and
 * the fullscreen room watch.
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
  return (
    <PendingRegion
      label="video"
      className={overlay ? "absolute inset-0" : "aspect-video w-full"}
      innerClassName="relative flex h-full items-end overflow-hidden rounded-[14px]"
    >
      <PendingBar className="absolute inset-0 h-full w-full rounded-[14px]" />
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
