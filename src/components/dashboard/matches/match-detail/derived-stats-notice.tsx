import { Info } from "lucide-react";

/**
 * Caveat shown above the statistics of a video-derived match.
 *
 * The page marks approximate values with a "≈" and shows an em dash where a
 * statistic could not be measured, but neither glyph can carry the two things a
 * coach would otherwise get wrong, so they are said in words here.
 *
 * The first is that "Errors" counts forced and unforced together. Nothing in the
 * video distinguishes them — a forced error also ends with the point loser
 * striking last — so the number reads roughly double what a hand-tagged match
 * reports, and a coach comparing the two would conclude the player fell apart.
 *
 * The second is why aces are missing rather than zero. An ace is a serve the
 * returner never touched, and a swing that misses is not recorded as a stroke,
 * so an ace and a service winner are the same event to us.
 */
export function DerivedStatsNotice() {
  return (
    <section
      aria-label="About these statistics"
      className="surface-card overflow-hidden"
    >
      <div className="flex items-start gap-3 px-5 py-4 sm:px-6 sm:py-5">
        <Info
          aria-hidden
          className="mt-0.5 h-4 w-4 shrink-0 text-[#3B82F6]"
          strokeWidth={1.5}
        />
        <div className="flex flex-col gap-1.5 min-w-0">
          <p className="text-[13px] font-medium text-[var(--color-text-primary)] leading-[19.5px]">
            These statistics come from video analysis.
          </p>
          <p className="text-[12px] font-normal text-[var(--color-text-body)] leading-[19.8px]">
            Scores, games, break points and serve counts are checked against the
            final score you entered. Values marked{" "}
            <span className="text-[var(--color-text-primary)]">&#8776;</span> are
            estimated and may be off by a few &mdash; and{" "}
            <span className="whitespace-nowrap">&ldquo;Errors&rdquo;</span> counts
            forced and unforced together, so it reads higher than a hand-tagged
            match. Aces, double faults and return direction are shown as{" "}
            <span className="text-[var(--color-text-primary)]">&mdash;</span>{" "}
            because they can&apos;t be measured reliably from video yet.
          </p>
        </div>
      </div>
    </section>
  );
}
