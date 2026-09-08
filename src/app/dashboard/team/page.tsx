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
import KpiCards from "@/components/dashboard/home/kpi-cards";
import { EmptyKpiStrip } from "@/components/dashboard/shared/kpi-tile-shell";
import {
  defaultKpiLabels,
  TEAM_KPI_DEFAULT_COUNT,
} from "@/lib/data/performance-server";
import { DualSheet } from "@/components/dashboard/team/dual-sheet";
import { DualSheetEmpty } from "@/components/dashboard/team/dual-sheet-empty";
import { TopMovers } from "@/components/dashboard/team/top-movers";
import { DualHistory } from "@/components/dashboard/team/dual-history";
import { CourtRecord } from "@/components/dashboard/team/court-record";
import { FocusCard } from "@/components/dashboard/home/focus-card";
import { FocusEmpty } from "@/components/dashboard/home/focus-empty";
import HomeAiInsight from "@/components/dashboard/home/home-ai-insight";
import { TeamSetupLine } from "@/components/dashboard/team/team-setup-line";

/**
 * The page's own name. The header greets rather than naming the page, so
 * without this the tab fell back to the root layout's "Advantage Analytics".
 */
export const metadata = { title: "Team Home" };

/**
 * Platform Audit Ta3 — the program's home page, in season and on day zero.
 *
 * One route, one composition, every state. The header bar greets
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
 * **The frame never moves** (Pa2's rule, carried over from round 45 and
 * taken further). Every region is on screen from the first visit: an empty
 * KPI strip draws its four labels over rules and grey curves, the dual card
 * draws a ghost lineup with one "Add a dual" band, the movers card draws
 * ghost rows with "Add players", the rail says when it fills. Round 45 had
 * these mount nothing until data arrived, which meant a coach's second visit
 * rearranged the page under them and taught the first visit's layout to
 * nobody.
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

  // Whether the strip has a number to show. Not `analyzedCount > 0`: that
  // counts reports by job status, and a report can be back for a match the
  // program cannot be attributed to, or ahead of its stats row landing. Either
  // way every card reads "—", and four dashes under a title saying "3 matches
  // analyzed" is the confident, wrong shape the guardrails describe. The
  // cards themselves know whether anything measured them.
  const stripHasFigures = kpiCards.some((card) => card.value !== "—");

  return (
    <div className="w-full flex-1 bg-[var(--surface-card)]">
      {/* The personal Home's column exactly — `px-14 pt-5 pb-8`, 16px between
          the title row, the strip, the grid and the footer — so the two
          workspaces' pages line up region for region. Ta3 ran 24px here;
          the tighter gap is Pa2's, and Roster and Schedule share the same
          56px gutter. */}
      <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-4 px-14 pt-5 pb-8">
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

        {/* The personal Home's strip, for the program: the same twelve cards
            and the same picker, with a team-average headline, four tiles by
            default, and a storage key of its own so a coach's pick here does
            not rearrange their personal strip. **Dual matches only** — a
            report for a match that is not on a dual's lineup is counted in
            the title row and nowhere in the strip. Ghost curves until a card
            has two readings; trends from two (`kpiMatchCount`). Until a dual
            match has been analyzed there is nothing to average, and the strip
            draws its four labelled regions empty instead. */}
        {stripHasFigures ? (
          <KpiCards
            cards={kpiCards}
            matchCount={kpiMatchCount}
            storageKey="advantage.kpi.team.visible"
            defaultCount={TEAM_KPI_DEFAULT_COUNT}
            ghostSparkline
            compactPhone
            collapse={false}
            ariaLabel="Program summary"
          />
        ) : (
          /* The same four regions the picker will show, off the same count.
             Three states, three sentences: "When the report lands" while a
             match is in and no report is back; "After your first dual match"
             when reports ARE back but none sits on a dual lineup — the title
             row above counts those, so the strip has to say why it does not;
             and the shell's own "After your first match" on day zero. */
          <EmptyKpiStrip
            labels={defaultKpiLabels(TEAM_KPI_DEFAULT_COUNT)}
            awaitingReport={awaitingReport}
            hint={analyzedCount > 0 && !awaitingReport ? "After your first dual match" : undefined}
            ariaLabel="Program summary"
          />
        )}

        {/* Pa2's grid: 400px rail, 24px gutter, `items-start` so each column
            bottoms out where its cards do — nothing is stretched to level
            them, and the cards inside a column sit 20px apart. `lg` rather
            than Ta3's `xl`, because that is where the personal Home breaks and
            the two pages should fold at the same width. */}
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
          <div className="flex min-w-0 flex-col gap-5">
            {/* This week's dual, the next one ahead, or the shape of one. Not
                staff-only: a player's lines are on this card, and the same
                `program_events` policy that lets them read the schedule page
                is what put it there. */}
            {weekendDual ? (
              <DualSheet dual={weekendDual} />
            ) : (
              <DualSheetEmpty canSchedule={isStaff} />
            )}
            <TopMovers movers={movers} rosterSize={rosterSize} canManage={isStaff} />
          </div>

          <div className="flex flex-col gap-5">
            {/* The personal Home's three states, one card: computed evidence
                with a streamed claim; its own anatomy holding nothing before
                any match is in; and off the page between the two, because a
                placeholder after a coach has already sent a match would be
                the page failing to notice. */}
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
                <FocusCard footer={{ left: "One thing to work on, after the first dual." }}>
                  <FocusEmpty />
                </FocusCard>
              )
            )}
            <CourtRecord record={courtRecord} />
            <DualHistory rows={dualHistory} form={dualForm} teamName={active.name} />
          </div>
        </div>

        {/* The frame's bottom edge — the setup line while there is one, then
            the footer, last on the page in every state. */}
        <div className="flex flex-col gap-4">
          {isStaff && <TeamSetupLine setup={setup} />}
          {/* `dualWeekends` asks the footer for the "about 3 dual weekends"
              clause; the footer owns both the arithmetic and the refusal to
              print "about 0". `note` is the pilot's free-quota clause, which
              this page has carried since round 45. */}
          <UsageFooter
            usedSeconds={usage.usedSeconds}
            capSeconds={usage.capSeconds}
            billingMonth={usage.billingMonth}
            dualWeekends
            note="free through Dec 31, 2026"
          />
        </div>
      </div>
    </div>
  );
}
