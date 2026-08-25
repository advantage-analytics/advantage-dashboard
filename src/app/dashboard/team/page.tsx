import Link from "next/link";
import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import { canUploadForProgram, isProgramStaff } from "@/lib/workspace/types";
import { getTeamHomeData } from "@/lib/data/team-home-server";
import { currentBillingMonth } from "@/lib/services/splitstep/config";
import { isAnalysisReady, isWorking } from "@/lib/data/match-analysis";
import { UsageMeter } from "@/components/dashboard/team/usage-meter";
import { FirstSteps } from "@/components/dashboard/team/first-steps";
import { MatchRows } from "@/components/dashboard/team/match-rows";

/**
 * The page's own name. Its `<h1>` is a greeting rather than the program, and
 * the header names the workspace rather than the page, so the tab fell back to
 * the root layout's "Advantage Analytics" — the app, not where you are.
 *
 * Most of this subtree is still in that state (schedule, settings, upload and
 * the schedule sub-routes export no metadata); this covers the one route the
 * header change left with nothing naming it.
 */
export const metadata = { title: "Team Home" };

/**
 * F6 and F8 — the program's home page, empty and a week in.
 *
 * One route with two states rather than two routes, because the transition
 * between them is the thing being designed: onboarding ends when this page has
 * rows in it. A separate "welcome" screen would have to be dismissed, and a
 * dismissable welcome is a screen that lies about whether anything happened.
 *
 * The empty state reads as an instruction, not a greeting — "Nothing here yet"
 * followed by the three things to do, in order. The populated one greets,
 * because by then the person is arriving rather than starting.
 */
export default async function TeamHomePage() {
  const workspace = await getWorkspaceContext();
  if (!workspace) redirect("/login");

  const { active, viewer } = workspace;
  // The rail only offers this destination inside a program. Somebody who typed
  // the URL from a personal workspace gets their own dashboard rather than an
  // empty program page that belongs to nobody.
  if (active.kind !== "team") redirect("/dashboard");

  const billingMonth = currentBillingMonth();
  const { usage, matches, roster, playersCanUpload } = await getTeamHomeData(
    active.id,
    billingMonth
  );

  // Roster facts and the two invite cards are staff business. A player reaches
  // this page from the same rail item, and `program_roster` returns them only
  // their own line — so without this the greeting would tell a player that "1
  // player has joined", and the invite buttons would open a dialog whose every
  // write the database refuses.
  // `isProgramStaff` rather than the same test spelled by hand — its own doc
  // comment exists because the rail and this page once wrote the rule in
  // opposite directions.
  const isStaff = isProgramStaff(active);
  const empty = matches.length === 0;

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const firstName = viewer.name.split(" ")[0];

  // The same predicates the matches list and the match page ask. A dot that
  // means "running" here and something else there is how two screens start
  // disagreeing about one job.
  const working = matches.filter((match) => isWorking(match.status)).length;
  const ready = matches.filter((match) => isAnalysisReady(match.status)).length;

  return (
    <div className="w-full flex-1 bg-[var(--surface-card)]">
      <div
        className={`mx-auto flex max-w-screen-2xl flex-col px-6 py-8 sm:px-10 sm:py-8 ${
          empty ? "gap-7" : "gap-6"
        }`}
      >
        <div className="flex flex-col items-start justify-between gap-6 lg:flex-row lg:gap-10">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-[24px] font-light leading-[1.2] tracking-[-0.4px] text-[var(--ink-900)]">
              {empty ? "Nothing here yet" : `${greeting}, ${firstName}`}
            </h1>
            <p className="max-w-[56ch] text-[13px] leading-[1.6] text-[var(--ink-700)]">
              {empty ? (
                isStaff ? (
                  <>
                    Send a match and the analysis comes back into this page.
                    Start with a dual you already have on film.
                  </>
                ) : (
                  <>
                    Your matches appear here as they come back from analysis.
                    Your coach sends them
                    {canUploadForProgram(active) ? ", and so can you." : "."}
                  </>
                )
              ) : (
                <ProgressLine
                  working={working}
                  ready={ready}
                  joined={isStaff ? roster.joined : 0}
                />
              )}
            </p>
          </div>

          <UsageMeter
            usedSeconds={usage.usedSeconds}
            capSeconds={usage.capSeconds}
            showTerms={empty}
          />
        </div>

        {empty ? (
          isStaff && (
            <FirstSteps
              canSubmitVideo={active.canSubmitVideo}
              playersCanUpload={playersCanUpload}
            />
          )
        ) : (
          <>
            <MatchRows matches={matches} />

            {/* Only when there is something outstanding to say. A program whose
                roster is fully joined does not need a row telling it so. */}
            {isStaff && roster.invited > roster.joined && (
              <div className="flex flex-wrap items-center gap-3 rounded-[var(--radius-card)] border border-[var(--border-hairline)] bg-[var(--surface-subtle)] px-[18px] py-3.5">
                <span className="flex-1 text-[12px] leading-[1.5] text-[var(--ink-700)]">
                  {roster.joined} of {roster.invited} invited players have
                  joined.
                  {roster.expiringSoon > 0 && roster.expiringInDays !== null && (
                    <>
                      {" "}
                      {roster.expiringSoon === 1
                        ? "One invite expires"
                        : `${roster.expiringSoon} invites expire`}{" "}
                      {roster.expiringInDays === 0
                        ? "today"
                        : roster.expiringInDays === 1
                          ? "tomorrow"
                          : `in ${roster.expiringInDays} days`}
                      .
                    </>
                  )}
                </span>
                <Link
                  href="/dashboard/settings/team"
                  className="text-[11px] text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)]"
                >
                  See who hasn&#39;t
                </Link>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * "One match analyzing, one ready. Six players have joined."
 *
 * Assembled from counts rather than written as a template with numbers in it,
 * because every clause has to be able to disappear: a program with nothing
 * running and nobody new should not read "0 matches analyzing, 0 ready".
 */
function ProgressLine({
  working,
  ready,
  joined,
}: {
  working: number;
  ready: number;
  joined: number;
}) {
  const clauses: string[] = [];
  if (working > 0) clauses.push(`${working} analyzing`);
  if (ready > 0) clauses.push(`${ready} ready`);

  const matchPart =
    clauses.length > 0
      ? `${clauses.join(", ")}.`
      : "Nothing is running right now.";
  const rosterPart =
    joined > 0
      ? ` ${joined} ${joined === 1 ? "player has" : "players have"} joined.`
      : "";

  return (
    <>
      {matchPart}
      {rosterPart}
    </>
  );
}
