"use client";

import Link from "next/link";
import { DayZeroOffer } from "@/components/dashboard/home/day-zero-offer";
import { DayZeroGrade } from "@/components/dashboard/home/day-zero-shape";
import { advButton } from "@/lib/ui/adv-button";
import { StatisticsBody } from "./statistics-body";
import {
  StatisticsProvider,
  type StatisticsContextValue,
} from "./statistics-provider";
import { DEFAULT_STATISTICS_SEARCH } from "./statistics-search";

/**
 * Statistics with no analyzed match: one offer over the page it is offering.
 *
 * The composition is Home's and Matches' (empty-and-loading.md → day zero).
 * From Matches, the offer block with a sentence naming what THIS page holds;
 * from Home, the page-length `DayZeroGrade` under it rather than the flat
 * 0.32 a single table takes, because what sits below is a column of cards.
 * Like both, it carries no title row — that returns with the first report.
 *
 * The tail is the page's own `StatisticsBody` over an empty provider, so
 * every region draws the anatomy it ships — its labels, a `—` or a rule
 * where each value goes — and nothing in it is invented. It is `inert`
 * (`DayZeroGrade` pairs that with the sentence a screen reader gets instead).
 *
 * ── One action, to Matches ──────────────────────────────────────────────────
 * Not the "Send match video / Import instead" pair. Two different absences
 * land here — no match at all, and a match sent that has not come back — and
 * Matches is the right next page for both: it holds the offer to send one,
 * and it holds the progress of one already sent. The fine print says which
 * of the two this is.
 */

const EMPTY: StatisticsContextValue = {
  all: [],
  filtered: [],
  points: [],
  state: DEFAULT_STATISTICS_SEARCH,
  setState: () => {},
};

export function StatisticsDayZero({
  awaitingReport,
}: {
  /** A match is filed and its report has not landed (`totalMatches > 0`). */
  awaitingReport: boolean;
}) {
  return (
    <div className="flex flex-1 flex-col gap-4">
      <DayZeroOffer
        headline="Every match you send adds to these numbers."
        headlineMeasure="26ch"
        actions={
          <Link href="/dashboard/matches" className={advButton("primary")}>
            View matches
          </Link>
        }
        conditions={
          awaitingReport
            ? "Your first report is on its way. Its serve, return and rally numbers land here as soon as it is analyzed."
            : "Serve, return and rally numbers, averaged across your season and tracked match to match. Send a match from Matches to start."
        }
      />

      <StatisticsProvider value={EMPTY}>
        <DayZeroGrade
          description="Once a match is analyzed this page holds your season averages, a trend for any statistic, splits by opponent type, every statistic in one table, and how your points ran and ended. Nothing below is real data yet."
          className="flex flex-1 flex-col"
        >
          <StatisticsBody awaitingReport={awaitingReport} />
        </DayZeroGrade>
      </StatisticsProvider>
    </div>
  );
}
