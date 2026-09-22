import Link from "next/link";
import { DayZeroGrade } from "@/components/dashboard/home/day-zero-shape";
import { SeasonKpiStrip } from "@/components/dashboard/shared/season-kpi-strip";
import type { CardSubject } from "@/components/dashboard/shared/card-empty";
import { LastMatchGhost } from "@/components/dashboard/team/player-profile/last-match-card";
import { MatchHistoryGhost } from "@/components/dashboard/team/player-profile/match-history-card";
import { LineHistoryGhost } from "@/components/dashboard/team/player-profile/line-history-card";
import { ServePlacementGhost } from "@/components/dashboard/home/serve-placement-quiet-strip";
import { profileDayZeroCopy } from "@/lib/ui/profile-day-zero-copy";

/**
 * A player's profile on the day it holds no match: one sentence, then the
 * page it will become, graded and `inert`.
 *
 * ── Not the `ProfileDayZero` that `d6fd4d16` deleted ────────────────────────
 * That one put a second 30px headline and a second New match under the
 * identity row, over the whole page dimmed flat at 0.32 — two headings and
 * two primaries a few pixels apart. This component draws **no offer
 * headline and no second primary**: the identity row is the page's one
 * heading and already holds New match, so nothing here may compete with it.
 * What returns from the deleted version is only the tail — the real page in
 * its real order under Home's continuous grade (`DayZeroGrade`, brightest
 * at the top, 0.32 at the foot), in place of the four card-level bands that
 * each said "your first match fills this" in their own words.
 *
 * ── What the sentence is ───────────────────────────────────────────────────
 * One 13px line in the voice of whoever is reading (`profileDayZeroCopy`),
 * with at most one inline link. The link is the SwingVision entrance to the
 * same wizard New match opens, preselected — the one route the identity row
 * does not already name. A reader who cannot send a match gets a sentence
 * that ends, not a link they would be refused at.
 *
 * ── What the grade holds ───────────────────────────────────────────────────
 * The populated page's frame, block for block — the KPI strip (its own
 * empty form, via `SeasonKpiStrip` with nothing measured), then the 2:1
 * grid: Last match and Match history on the left, Line history and Serve
 * placement on the right. Each section keeps its `surface-card` and its
 * eyebrow so the reader learns the layout they will keep; each holds only
 * its ghost. No "Full report", no "All N matches", no band, no button: the
 * grade is `inert`, and a control inside it would be an invisible tab stop.
 */
export function ProfileDayZero({
  subject,
  canUpload,
  importHref,
}: {
  subject: CardSubject;
  /** May this viewer send a match for this athlete? Decides the link. */
  canUpload: boolean;
  /** The wizard with Source preselected: `…/matches/new?player=…&source=swing-vision`. */
  importHref: string;
}) {
  const copy = profileDayZeroCopy({
    isSelf: subject.isSelf,
    firstName: subject.firstName,
    canUpload,
  });

  return (
    <>
      <p
        className="text-[13px] leading-[1.5] text-[var(--ink-700)]"
        style={{ textWrap: "pretty" }}
      >
        {copy.lead}
        {copy.link && (
          <Link
            href={importHref}
            className="rounded-sm text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
          >
            {copy.link.label}
          </Link>
        )}
        {copy.tail}
      </p>

      <DayZeroGrade
        description={copy.description}
        className="flex flex-col gap-4"
      >
        <SeasonKpiStrip
          kpis={[]}
          hasStats={false}
          matchesPlayed={0}
          subject={subject}
        />

        <div className="grid items-start gap-4 lg:grid-cols-[1.9fr_1fr]">
          <div className="flex min-w-0 flex-col gap-4">
            <section
              aria-label="Last match"
              className="surface-card flex flex-col gap-3.5"
              style={{ padding: "18px 20px" }}
            >
              <span className="eyebrow">Last match</span>
              <LastMatchGhost />
            </section>

            <section
              aria-label="Match history"
              className="surface-card flex flex-col gap-0.5"
              style={{ padding: 20 }}
            >
              <span className="eyebrow block pb-3">Match history</span>
              <MatchHistoryGhost />
            </section>
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            <section
              aria-label="Line history"
              className="surface-card flex flex-col gap-0.5"
              style={{ padding: 20 }}
            >
              <span className="eyebrow block pb-3">Line history</span>
              <LineHistoryGhost />
            </section>

            <section
              aria-label="Serve placement"
              className="surface-card flex flex-col gap-3"
              style={{ padding: "var(--pad-card)" }}
            >
              <span className="eyebrow">Serve placement</span>
              <ServePlacementGhost />
            </section>
          </div>
        </div>
      </DayZeroGrade>
    </>
  );
}
