import Link from "next/link";
import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import { getTeamHomeData } from "@/lib/data/team-home-server";
import { currentBillingMonth } from "@/lib/services/splitstep/config";
import { isAnalysisReady, isWorking } from "@/lib/data/match-analysis";
import { advButton } from "@/lib/ui/adv-button";
import { UsageFooter } from "@/components/dashboard/team/usage-footer";
import { FirstSteps } from "@/components/dashboard/team/first-steps";
import { DualSheet } from "@/components/dashboard/team/dual-sheet";
import { KpiStrip } from "@/components/dashboard/team/kpi-strip";
import { MatchRows } from "@/components/dashboard/team/match-rows";
import { NextEventCard } from "@/components/dashboard/team/next-event-card";
import { RosterCard } from "@/components/dashboard/team/roster-card";
import { NeedsAttention } from "@/components/dashboard/team/needs-attention";

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
 * **Round 45, rule 1: the frame never moves.** Greeting, New match and the
 * usage footer are on screen from day zero, in the positions they will still
 * be in a season later; only the middle changes as data arrives. The empty
 * state used to be its own composition — an instructional headline announcing
 * its own emptiness, with the budget card promoted beside it — which meant a
 * coach's second visit rearranged the page under them and taught the first
 * visit's layout to nobody. An empty middle makes the point the headline was
 * making, and makes it without a ghost row or a dashed placeholder standing in
 * for content that has not arrived.
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
  const {
    usage,
    matches,
    kpis,
    roster,
    rosterCard,
    attention,
    nextEvent,
    weekendDual,
    playersCanUpload,
  } = await getTeamHomeData(active.id, billingMonth);

  // Roster facts and the setup checklist are staff business. A player reaches
  // this page from the same rail item, and `program_roster` returns them only
  // their own line — so without this the greeting would tell a player that "1
  // player has joined", and the checklist would send them to pages whose every
  // write the database refuses.
  const isStaff = active.role !== "player";
  const empty = matches.length === 0;

  const now = new Date();
  const hour = now.getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const firstName = viewer.name.split(" ")[0];
  // Server clock, like the greeting it sits under — the two would contradict
  // each other if one were rendered here and the other in the browser.
  const today = now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  // The same predicates the matches list and the match page ask. A dot that
  // means "running" here and something else there is how two screens start
  // disagreeing about one job.
  const working = matches.filter((match) => isWorking(match.status)).length;
  const ready = matches.filter((match) => isAnalysisReady(match.status)).length;

  // Who may send video at all. A player only when the program has opened
  // uploads to them — that is the rule the database enforces, so a player
  // without it gets no button rather than a disabled one: it is not paused,
  // it is not theirs to do. Staff whose claim is still being confirmed DO get
  // the button, disabled, because for them it genuinely is paused and the slot
  // it occupies is the one it will stay in.
  const canUpload = isStaff || playersCanUpload;

  // Whether there is a right column at all.
  //
  // Two gates, and both matter. **Staff**, because every card in it is staff
  // business — `program_invites` returns a player nothing, `program_roster`
  // returns them their own line, and a failed job on somebody else's match is
  // not theirs to chase. And **something to say**, because each of the three
  // cards renders nothing when it is empty: without this a coach on a quiet
  // morning would get a 340px strip of blank page beside their matches. One
  // column when there is one column's worth of page — which is also every
  // player's view of it, gutter included.
  const showRail =
    isStaff &&
    (nextEvent !== null || rosterCard !== null || attention.length > 0);

  return (
    <div className="w-full flex-1 bg-[var(--surface-card)]">
      <div className="mx-auto flex max-w-screen-2xl flex-col gap-6 px-6 py-8 sm:px-10">
        {/* The frame's top edge. Greeting, subline and the primary sit in the
            same places in every state — the gap between the h1 and the line
            under it is the only thing tuned by hand (9px), because 8 reads as
            attached and 12 as unrelated. */}
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end sm:gap-6">
          <div className="flex flex-col gap-[9px]">
            <h1 className="text-display">
              {greeting}, {firstName}
            </h1>

            {/* Subline and date share a baseline. The subline is the one part
                of the frame whose words change with the state — that is the
                point of it; the frame is the geometry, not the sentence. */}
            <div className="flex flex-wrap items-baseline gap-3">
              <p className="text-body-sm max-w-[56ch]">
                {empty ? (
                  isStaff ? (
                    "Send a match and the analysis comes back to this page."
                  ) : playersCanUpload ? (
                    "Your matches appear here — your coach sends them, and so can you."
                  ) : (
                    "Your matches appear here as your coach sends them."
                  )
                ) : (
                  <ProgressLine
                    working={working}
                    ready={ready}
                    joined={isStaff ? roster.joined : 0}
                  />
                )}
              </p>
              <span className="text-micro tabular">{today}</span>
            </div>
          </div>

          {canUpload &&
            (active.canSubmitVideo ? (
              <Link
                href="/dashboard/matches/new"
                className={advButton("primary")}
              >
                New match
              </Link>
            ) : (
              /* Claim still in review. The claim-review screen promises that
                 everything except sending video works now, so this keeps the
                 promise in the honest way — the control is where it will be,
                 and refuses rather than disappearing. `title` carries the
                 reason; the checklist card below states it in full. */
              <button
                type="button"
                disabled
                title="Paused until we confirm the program."
                className={advButton("primary")}
              >
                New match
              </button>
            ))}
        </div>

        {/* Two columns from `xl` up, one below it.

            **The frame spans both.** The greeting row above and the usage
            footer below are siblings of this grid rather than cells in it —
            round 45's first rule is that the frame never moves, and a greeting
            that narrowed to make room for a card would be the frame moving.
            What splits is the middle: the page's own detail on the left, and on
            the right the three cards answering what is next, who is on the
            roster, and what is waiting.

            340px is a fixed track rather than a fraction, because the cards in
            it are sized to their contents and a proportional column would
            stretch a two-line event card across a 27-inch monitor. `minmax(0,
            1fr)` on the main column is what lets its rows truncate instead of
            forcing the grid wider than the page.

            `xl` (1280px), not `lg`: the matches card is a five-track grid
            whose three fixed columns are measured to the widest score a row
            can hold, and everything the 340px takes comes out of the two name
            tracks that share what is left. At `xl` the main column is 836px —
            the width that card already has at a 916px window, and comfortably
            above the 560px it is laid out in at the `sm` breakpoint where its
            grid first appears. At `lg` it would be 580px, narrower than
            anything the card renders in today, which is why the split waits.

            One column when there is no right column to show — see `showRail`. A
            player never meets an empty gutter, because a player never meets the
            split at all. */}
        <div
          className={`grid gap-6 ${
            showRail ? "xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start" : ""
          }`}
        >
          <div className="flex min-w-0 flex-col gap-6">
            {/* The strip — up to four figures, directly under the greeting
                it summarises and above everything the page then details.
                Outside the `!empty` gate because it carries its own, stricter
                one: `kpis` is empty until the program has a match that has
                actually been ANALYZED, which is later than having a row. On
                day zero this mounts nothing at all — no skeleton, no zeroed
                tiles — which is the rule round 45 states about this strip in
                particular. Fewer than four arrive whenever a figure cannot be
                computed honestly; `teamKpis()` says which and when. Not
                staff-only: every figure on it is about the program, and a
                player reads the same numbers their coach does. */}
            <KpiStrip tiles={kpis} />

            {/* The middle — the only thing empty → populated changes.

                The checklist is no longer part of what changes. It renders in
                both states and holds one position, because its cards flip to
                receipts rather than disappearing as they are done; it takes
                itself off the page in one step once all three are, which is
                the only layout change it ever makes. Staff only:
                `program_roster` returns a player their own line and nothing
                else, and every write behind these cards is one the database
                refuses them. */}
            {isStaff && (
              <FirstSteps
                canSubmitVideo={active.canSubmitVideo}
                matches={matches}
                nextEvent={nextEvent}
                roster={roster}
                nowMs={now.getTime()}
              />
            )}

            {/* Above the matches list, and outside its `!empty` gate: a
                program's first dual is on the schedule before anybody has
                played it, so the sheet has something to say on a page with no
                rows in it yet. It is not part of the frame either — most weeks
                there is no dual in range and `weekendDual` is null, in which
                case nothing renders here at all. Not staff-only: a player's
                lines are on this card, and the same `program_events` policy
                that lets them read the schedule page is what put it there. */}
            {weekendDual && <DualSheet dual={weekendDual} />}

            {!empty && <MatchRows matches={matches} />}
          </div>

          {/* The right column. Three cards, each rendering nothing at all when
              it has nothing to say — so this is a column of one card as often
              as it is a column of three, and never a column of headings over
              empty lists. The invitations that used to be summarised in a line
              under the matches list are here now: the roster card lists them
              with a Resend beside each, which is what 44a shows and what a
              count could never offer. */}
          {showRail && (
            <aside
              aria-label="Program status"
              className="flex min-w-0 flex-col gap-6"
            >
              <NextEventCard event={nextEvent} />
              <RosterCard roster={rosterCard} />
              <NeedsAttention alerts={attention} />
            </aside>
          )}
        </div>

        {/* The frame's bottom edge — last block on the page in both states. */}
        <UsageFooter
          usedSeconds={usage.usedSeconds}
          capSeconds={usage.capSeconds}
          billingMonth={usage.billingMonth}
        />
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
