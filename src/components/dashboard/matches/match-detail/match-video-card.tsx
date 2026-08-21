import type { MatchVideo } from "@/lib/data/match-video-server";

/**
 * The match video, on the match's own page.
 *
 * Kept since the trimmed-capture work landed and rendered nowhere until now.
 *
 * ── Called the match video, deliberately ────────────────────────────────────
 * The file is the trim window from our own job request, re-encoded — not dead
 * time removed, no annotations, no rally-only cut. `ui-revamp-guardrails.md`
 * §1 says this in as many words, after somebody watched it. For a player who
 * trimmed nothing it is their own upload at a lower bitrate, so calling it a
 * highlight or a condensed match would be describing a file that does not
 * exist.
 *
 * ── `preload="metadata"` ────────────────────────────────────────────────────
 * Not `auto`. These are multi-gigabyte files streamed from Azure at roughly
 * $0.087/GB, and `auto` would start paying that for every person who opened a
 * match page and scrolled past. Metadata is enough for the duration and the
 * scrubber; bytes move when somebody presses play.
 */
export function MatchVideoCard({ video }: { video: MatchVideo }) {
  return (
    <section
      aria-label="Match video"
      className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--border-medium)] bg-[var(--surface-card)]"
    >
      <div className="flex items-baseline justify-between px-[18px] pt-4 pb-3">
        <h2 className="text-[13px] font-medium text-[var(--ink-900)]">
          Match video
        </h2>
        <span className="text-[11px] text-[var(--ink-500)]">
          The window you submitted
        </span>
      </div>

      {/* Black rather than the card surface: letterboxing on a light panel
          reads as a broken image, and every recording here is a wide court
          shot that will letterbox on some viewport. */}
      <div className="bg-black">
        <video
          controls
          preload="metadata"
          playsInline
          className="block max-h-[70vh] w-full"
          src={video.url}
        >
          Your browser cannot play this video.
        </video>
      </div>
    </section>
  );
}
