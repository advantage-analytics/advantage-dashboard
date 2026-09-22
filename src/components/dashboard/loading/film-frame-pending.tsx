import { cn } from "@/lib/utils";

/**
 * The film player's 16:9 frame, pending: pulsing in the skeleton token rather
 * than the loaded frame's dark ground, because this is a request in flight
 * (a chunk, a metadata fetch, a credential being re-signed), not a film.
 *
 * `overlay` sits it over a live `<video>` inside the player's own frame — the
 * element stays mounted underneath, which is what the refresh harness and
 * the fullscreen room watch.
 *
 * Its own file, with no import beyond `cn`: `film-player.tsx` draws it, and
 * the film harness bundles that player for the browser — the rest of
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
    <div
      role="status"
      aria-label="Loading video"
      className={cn(
        "flex items-end overflow-hidden rounded-[14px] bg-[var(--surface-skeleton)] motion-safe:animate-pulse",
        overlay ? "absolute inset-0" : "aspect-video w-full",
      )}
    >
      {caption ? (
        <span
          className="text-micro px-4 pb-3"
          style={{ color: "var(--ink-500)" }}
        >
          {caption}
        </span>
      ) : null}
    </div>
  );
}
