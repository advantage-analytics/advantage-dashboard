import Link from "next/link";
import { redirect } from "next/navigation";
import { Mail } from "lucide-react";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import {
  getTeamHomeData,
  type RosterProgress,
} from "@/lib/data/team-home-server";
import { currentBillingMonth } from "@/lib/services/splitstep/config";
import { isAnalysisReady, isWorking } from "@/lib/data/match-analysis";
import { advButton } from "@/lib/ui/adv-button";
import { UsageFooter } from "@/components/dashboard/team/usage-footer";
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
  const { usage, matches, roster, nextEvent, playersCanUpload } =
    await getTeamHomeData(active.id, billingMonth);

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

        {/* The middle — the only thing empty → populated changes.

            The checklist is no longer part of what changes. It renders in both
            states and holds one position, because its cards flip to receipts
            rather than disappearing as they are done; it takes itself off the
            page in one step once all three are, which is the only layout
            change it ever makes. Staff only: `program_roster` returns a player
            their own line and nothing else, and every write behind these cards
            is one the database refuses them. */}
        {isStaff && (
          <FirstSteps
            canSubmitVideo={active.canSubmitVideo}
            matches={matches}
            nextEvent={nextEvent}
            roster={roster}
            nowMs={now.getTime()}
          />
        )}

        {!empty && (
          <>
            <MatchRows matches={matches} />

            {/* Only when there is something outstanding to say. A program whose
                roster is fully joined does not need a row telling it so. */}
            {isStaff && roster.invited > roster.joined && (
              <PendingInvites roster={roster} />
            )}
          </>
        )}

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
 * "2 invites pending" — and where to do something about it.
 *
 * Round 44 sends this at **Roster**, not Settings › Team. Invites live on the
 * roster now: they render there as dashed rows in the same list as the players
 * who accepted, each with its own Resend, and the bulk invite dialog opens from
 * that page's header. Settings › Team was where the invite controls used to be,
 * so the old link sent a coach to the settings form to do a thing the roster
 * does better — and after T2 moved the dialog, to a page that no longer holds
 * the action this line is about at all.
 *
 * The count is outstanding invites rather than "N of M have joined", because
 * the number that decides whether to act is the one still owed a reply. The
 * sub-line carries the expiry, which is the only part of this that is urgent,
 * and names Roster a second time — the link is a destination, the sentence is
 * the instruction, and someone reading rather than clicking still learns where
 * Resend is.
 *
 * Names and send dates are what 44a shows beside the count; `RosterProgress`
 * carries neither, and this task is presentation. Roster itself has both.
 */
function PendingInvites({ roster }: { roster: RosterProgress }) {
  const pending = roster.invited - roster.joined;
  const expiring =
    roster.expiringSoon > 0 && roster.expiringInDays !== null
      ? `${roster.expiringSoon === 1 ? "One expires" : `${roster.expiringSoon} expire`} ${
          roster.expiringInDays === 0
            ? "today"
            : roster.expiringInDays === 1
              ? "tomorrow"
              : `in ${roster.expiringInDays} days`
        }`
      : null;

  return (
    <div className="flex flex-wrap items-start gap-3 rounded-[var(--radius-card)] border border-[var(--border-hairline)] bg-[var(--surface-subtle)] px-[18px] py-3.5">
      <Mail
        className="mt-px size-[15px] shrink-0 text-[var(--ink-400)]"
        strokeWidth={1.5}
        aria-hidden
      />

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-[12px] leading-[1.5] text-[var(--ink-700)]">
          <span className="tabular">{pending}</span>{" "}
          {pending === 1 ? "invite" : "invites"} pending
        </span>
        <span className="text-micro">
          {expiring ? `${expiring} · ` : ""}Resend from Roster
        </span>
      </div>

      <Link
        href="/dashboard/team/roster"
        className="shrink-0 text-[11px] text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)]"
      >
        Roster
      </Link>
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
