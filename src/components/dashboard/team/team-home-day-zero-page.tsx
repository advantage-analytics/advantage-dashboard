"use client";

import { SeasonKpiStrip } from "@/components/dashboard/shared/season-kpi-strip";
import { DualSheetEmpty } from "@/components/dashboard/team/dual-sheet-empty";
import { TopMovers } from "@/components/dashboard/team/top-movers";
import { DualHistory } from "@/components/dashboard/team/dual-history";
import { CourtRecord } from "@/components/dashboard/team/court-record";
import { TeamDayZeroHome } from "@/components/dashboard/team/team-day-zero-home";
import { FocusCard } from "@/components/dashboard/home/focus-card";
import {
  FocusEmpty,
  teamInsightBand,
} from "@/components/dashboard/home/focus-empty";
import { TeamHomeRegions } from "@/components/dashboard/loading/team-home-skeleton";
import { courtRecordFrom } from "@/lib/data/team-court-record";

const EMPTY_COURT_RECORD = courtRecordFrom([], new Map());
const EMPTY_FORM = { form: [], wins: 0, losses: 0 };

/**
 * Team Home on day zero: the offer over a graded preview of every card, empty.
 *
 * Built from nothing but the workspace, because day zero is defined by the
 * absence of exactly what these cards read — no match, no player, no dual
 * (`getTeamHomePresence`). With none of those the KPI strip has no stats, the
 * dual sheet and dual history have no dual, the court record has no singles
 * result, top movers has no roster and the insight has no match; each card's
 * empty anatomy is the whole truth. So the page draws it without starting a
 * read, and the route's loading fallback draws the identical page before the
 * page has run — neither one pulses skeleton bars inside the preview.
 *
 * If a card ever learns to show something a day-zero program CAN hold, it has
 * to come back out of this file and into a streamed region on the page.
 */
export function TeamHomeDayZeroPage({
  canManage,
  teamName,
}: {
  /** The offer's actions. The preview cards below draw none, whoever views. */
  canManage: boolean;
  teamName: string;
}) {
  return (
    <div className="flex w-full flex-1 flex-col bg-[var(--surface-card)]">
      <div className="mx-auto flex w-full max-w-screen-2xl flex-1 flex-col gap-4 px-14 pt-5 pb-8">
        <TeamDayZeroHome canManage={canManage}>
          <TeamHomeRegions
            kpis={
              <SeasonKpiStrip
                kpis={[]}
                hasStats={false}
                matchesPlayed={0}
                awaitingReport={false}
                ariaLabel="Program summary"
              />
            }
            dual={<DualSheetEmpty canSchedule={false} isPreview />}
            movers={
              <TopMovers
                movers={[]}
                rosterSize={0}
                canManage={false}
                isPreview
              />
            }
            insight={
              <FocusCard showStatisticsLink={false}>
                <FocusEmpty band={teamInsightBand(0)} />
              </FocusCard>
            }
            court={<CourtRecord record={EMPTY_COURT_RECORD} />}
            history={
              <DualHistory
                rows={[]}
                form={EMPTY_FORM}
                teamName={teamName}
                isPreview
              />
            }
          />
        </TeamDayZeroHome>
      </div>
    </div>
  );
}
