import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import { canUploadForProgram, isProgramStaff } from "@/lib/workspace/types";
import { getTeamHomeData } from "@/lib/data/team-home-server";
import { currentBillingMonth } from "@/lib/services/splitstep/config";
import { UsageFooter } from "@/components/dashboard/shared/usage-footer";
import {
  NewMatchAction,
  TeamSeasonTitle,
} from "@/components/dashboard/team/team-season-title";
import { SeasonKpiStrip } from "@/components/dashboard/shared/season-kpi-strip";
import { DualSheet } from "@/components/dashboard/team/dual-sheet";
import { DualSheetEmpty } from "@/components/dashboard/team/dual-sheet-empty";
import { TopMovers } from "@/components/dashboard/team/top-movers";
import { DualHistory } from "@/components/dashboard/team/dual-history";
import { CourtRecord } from "@/components/dashboard/team/court-record";
import { FocusCard } from "@/components/dashboard/home/focus-card";
import { FocusEmpty } from "@/components/dashboard/home/focus-empty";
import HomeAiInsight from "@/components/dashboard/home/home-ai-insight";
import { TeamSetupLine } from "@/components/dashboard/team/team-setup-line";
import { TeamDayZeroHome } from "@/components/dashboard/team/team-day-zero-home";

/**
 * The page's own name. The header greets rather than naming the page, so
 * without this the tab fell back to the root layout's "Advantage Analytics".
 */
export const metadata = { title: "Team Home" };

/**
 * Platform Audit Ta3 — the program's home page, in season and on day zero.
 *
 * The populated page's composition. The header bar greets
 * ("Good morning, Elena · Meridian State · Men's tennis · Monday, Aug 10");
 * the page opens on "Team season" in title type, then the KPI strip, then
 * the personal Home's two columns: this weekend's dual and the top movers on
 * the left, and a 400px rail of the Focus card, the court record and the
 * dual history — over a quiet setup line and the usage footer.
 *
 * **The columns are Pa2's, by decision (2026-09-07, "Team Home Layouts"
 * canvas, direction A).** Ta3 ran the dual sheet across the whole page and it
 * was a third of a 900px viewport before the squad appeared at all — on a
 * Tuesday, a result nobody needed re-read. Now the card keeps every row and
 * simply shares the width with the rail, and a coach who also plays learns
 * one page shape in both workspaces. Nothing inside a card changed.
 *
 * Before setup begins, the centered offer sits above an inert preview of
 * these regions, without the title row, widget actions or footer. Once a
 * roster, dual or match exists, the normal dashboard returns so real content
 * stays accessible while the remaining regions fill in.
 *
 * **What Ta3 retired, by decision (2026-09-07).** The three-card checklist
 * became `TeamSetupLine`, one line in the personal Home's register. The
 * Matches list, the Next-event card, the Roster card and the Needs-attention
 * list are gone from this page; `/dashboard/matches`, the schedule and the
 * roster each carry what those summarised.
 *
 * **White, not the frame's grey.** SKILL.md's ratified surface rule: every
 * dashboard surface is `--surface-card`, and a card is told from the page by
 * its hairline and shadow, never by a tint underneath.
 */
export default async function TeamHomePage() {
  const workspace = await getWorkspaceContext();
  if (!workspace) redirect("/login");

  const { active } = workspace;
  // The rail only offers this destination inside a program. Somebody who typed
  // the URL from a personal workspace gets their own dashboard rather than an
  // empty program page that belongs to nobody.
  if (active.kind !== "team") redirect("/dashboard");

  const billingMonth = currentBillingMonth();
  const {
    usage,
    matchCount,
    analyzedCount,
    kpiCards,
    kpiHasStats,
    kpiMatchCount,
    firstReport,
    weekendDual,
    dualHistory,
    dualForm,
    newResults,
    movers,
    rosterSize,
    setup,
    courtRecord,
    insight,
  } = await getTeamHomeData(active.id, billingMonth, active.orgType);

  // Roster facts and the setup line are staff business. `isProgramStaff`
  // rather than the same test spelled by hand — its own doc comment exists
  // because the rail and this page once wrote the rule in opposite directions.
  const isStaff = isProgramStaff(active);

  // Who may send video at all — see `canUploadForProgram()`. A player without
  // it gets no button rather than a disabled one; staff whose claim is still
  // being confirmed get it disabled, because for them it genuinely is paused.
  const canUpload = canUploadForProgram(active);

  // A match is in and no report has come back yet — said once here and read by
  // both the title row and the empty strip, so the two cannot describe the
  // same morning differently.
  // `state === "progress"`, not `!== "done"`: `teamFirstReport` returns null
  // for a match whose analysis FAILED, and "on its way" about that one was a
  // promise the page could never keep.
  const awaitingReport =
    matchCount > 0 && analyzedCount === 0 && firstReport?.state === "progress";

  // Roster and schedule setup are progress even before any match is played.
  // Never place a real dual sheet inside the inert day-zero preview.
  const isDayZero = matchCount === 0 && !setup.roster && !setup.schedule;

  const dashboardRegions = (
    <>
      <SeasonKpiStrip
        kpis={kpiCards}
        hasStats={kpiHasStats}
        matchesPlayed={kpiMatchCount}
        awaitingReport={awaitingReport}
        emptyHint={
          analyzedCount > 0 && !awaitingReport
            ? "After your first dual match"
            : undefined
        }
        ariaLabel="Program summary"
      />

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="flex min-w-0 flex-col gap-5">
          {weekendDual ? (
            <DualSheet dual={weekendDual} />
          ) : (
            <DualSheetEmpty canSchedule={isStaff} isPreview={isDayZero} />
          )}
          <TopMovers
            movers={movers}
            rosterSize={rosterSize}
            canManage={isStaff}
            isPreview={isDayZero}
          />
        </div>

        <div className="flex flex-col gap-5">
          {insight ? (
            <FocusCard
              footer={{
                left: insight.caption,
                right: (
                  <>
                    <span className="tabular">{kpiMatchCount}</span>{" "}
                    {kpiMatchCount === 1 ? "match" : "matches"}
                  </>
                ),
              }}
            >
              <HomeAiInsight
                evidence={insight.parts}
                cacheSignature={`${active.id}:${kpiMatchCount}:${kpiCards
                  .map((card) => card.value)
                  .join(",")}`}
                endpoint="/api/team-insight"
              />
            </FocusCard>
          ) : (
            matchCount === 0 && (
              <FocusCard
                showStatisticsLink={!isDayZero}
                footer={{
                  left: "One thing to work on, after the first dual.",
                }}
              >
                <FocusEmpty />
              </FocusCard>
            )
          )}
          <CourtRecord record={courtRecord} />
          <DualHistory
            rows={dualHistory}
            form={dualForm}
            teamName={active.name}
            isPreview={isDayZero}
          />
        </div>
      </div>
    </>
  );

  const homeContent = (
    <>
      <TeamSeasonTitle
        matchCount={matchCount}
        analyzedCount={analyzedCount}
        newResults={newResults}
        usage={usage}
        awaitingReport={awaitingReport}
        action={
          <NewMatchAction
            canUpload={canUpload}
            canSubmitVideo={active.canSubmitVideo}
          />
        }
      />

      {dashboardRegions}

      <div className="flex flex-col gap-4">
        {isStaff && <TeamSetupLine setup={setup} />}
        <UsageFooter
          usedSeconds={usage.usedSeconds}
          capSeconds={usage.capSeconds}
          billingMonth={usage.billingMonth}
          dualWeekends
          note="free through Dec 31, 2026"
        />
      </div>
    </>
  );

  return (
    <div className="w-full flex-1 bg-[var(--surface-card)]">
      {/* The personal Home's column exactly — `px-14 pt-5 pb-8`, 16px between
          the title row, the strip, the grid and the footer — so the two
          workspaces' pages line up region for region. Ta3 ran 24px here;
          the tighter gap is Pa2's, and Roster and Schedule share the same
          56px gutter. */}
      <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-4 px-14 pt-5 pb-8">
        {isDayZero ? (
          <TeamDayZeroHome canManage={isStaff}>
            {dashboardRegions}
          </TeamDayZeroHome>
        ) : (
          homeContent
        )}
      </div>
    </div>
  );
}
