import { Info } from "lucide-react";

/**
 * Shown when a match has a verified point timeline but no published statistics.
 *
 * It exists because the honest alternative to a number is a sentence, not a
 * zero. Every aggregate on this page coerces an absent statistic to 0 before
 * rendering, so withholding the data alone would print "0 aces" — which reads
 * as a fact about the player rather than a gap in the analysis. Hiding the
 * cards silently is barely better: a coach who expects serve numbers and finds
 * an empty column assumes the page is broken.
 *
 * So the cards are hidden AND this says why, in the same place they would have
 * been.
 */
export function UnpublishedStatsNotice() {
  return (
    <section
      aria-label="Statistics not published"
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
            Point-by-point analysis is ready. Match statistics aren&apos;t
            published for this match.
          </p>
          <p className="text-[12px] font-normal text-[var(--color-text-body)] leading-[19.8px]">
            Every point below has been checked against the final score you
            entered, so the timeline, key moments and court placement are
            accurate. Aggregate totals aren&apos;t shown because parts of them
            can&apos;t be measured reliably from this video yet &mdash; showing a
            zero would read as a fact about your match rather than a gap in the
            analysis.
          </p>
        </div>
      </div>
    </section>
  );
}
