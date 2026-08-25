import Link from "next/link";
import { Check } from "lucide-react";
import { advButton } from "@/lib/ui/adv-button";
import { playersLabel } from "./roster-vocabulary";
import { StatusChip } from "@/components/ui/status-chip";
import { formatEventDay } from "@/lib/schedule/format";
import {
  ANALYSIS_LABEL,
  isAnalysisReady,
  isInFlight,
  isWorking,
} from "@/lib/data/match-analysis";
import type {
  RosterProgress,
  TeamMatchRow,
  TeamNextEvent,
} from "@/lib/data/team-home-server";

/**
 * Round 45 — the three things to do on visit one, and what becomes of them.
 *
 * **Cards flip in place.** Each of the three holds one slot for the whole of
 * onboarding and changes what it says inside it: active, then — for the one
 * card whose work takes time — a progress receipt, then a done receipt. The
 * eyebrow never changes, so the slot stays recognisable as the same card
 * across all three.
 *
 * The version this replaces removed a card the moment it was done, which
 * collapsed a three-card grid to one card and a dashed ghost explaining the
 * gap. Two failures in one: a coach's second visit reflowed the page under
 * them, and the ghost was a placeholder standing in for nothing — the exact
 * thing round 45 rules out elsewhere on this page. Receipts hold their slots
 * instead, so the row's geometry is fixed from the first visit to the last.
 *
 * **The row leaves once.** When all three receipts read done, the whole row
 * unmounts together — one layout change instead of three staggered
 * disappearances, and nothing is left behind to explain where it went. There
 * is no "skip": the cards are dismissed by doing them, which is what makes the
 * populated page the real end of onboarding rather than a state you declare.
 *
 * **No circled glyph.** The two circled marks in this product mean won and lost
 * and belong to matches; borrowing one here would put match vocabulary on a
 * setup task, and a green tick on "roster built" reads as a result rather than
 * a record. A done receipt gets a plain check in the ink of its own title.
 */

/** The slot: one box, three fillings, identical geometry in all of them. */
const SLOT = "flex flex-col gap-3 rounded-[var(--radius-card)] border p-6";

/**
 * The heading line, at the weight the DS gives an event or card name. The
 * variant supplies the ink — active is `--ink-900`, a receipt has stepped back.
 */
const TITLE = "flex items-center gap-2 text-[16px] tracking-[-0.4px]";

const BODY = "max-w-[34ch] text-[12px] leading-[1.5]";

/** The done receipt's single control. A text link, deliberately not a button. */
const QUIET_LINK =
  "text-[11px] text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)]";

type Variant = "active" | "progress" | "done";

export function FirstSteps({
  canSubmitVideo,
  matches,
  nextEvent,
  roster,
  nowMs,
}: {
  /**
   * False while a claim is still being confirmed. The claim-review screen
   * promises that everything except sending video works now, so this card has
   * to keep that promise rather than offer a button that the quota check would
   * refuse.
   */
  canSubmitVideo: boolean;
  /** The same rows the list below renders — no second read, no second answer. */
  matches: TeamMatchRow[];
  nextEvent: TeamNextEvent | null;
  roster: RosterProgress;
  /**
   * The page's clock, passed rather than read here. Same reason the greeting
   * takes it from the server: one render, one answer to "what time is it", and
   * a component that reads the clock mid-render is a component whose output
   * changes when React happens to re-render it.
   */
  nowMs: number;
}) {
  // The first report is done when one has actually come back, and in progress
  // while one is on its way. A match that FAILED is neither: it leaves the card
  // active, which is right — after a failure the next thing to do really is to
  // send a match, and the row above says what happened to the last one.
  const report = matches.find((match) => isAnalysisReady(match.status));
  const inFlight = matches.find((match) => isInFlight(match.status));

  const reportVariant: Variant = report
    ? "done"
    : inFlight
      ? "progress"
      : "active";
  const scheduleVariant: Variant = nextEvent ? "done" : "active";
  // Joined players and outstanding invitations both count: a coach who has
  // sent the invitations has built the roster and is now waiting on other
  // people, which is not a task the checklist should keep asking for.
  const teamVariant: Variant = roster.invited > 0 ? "done" : "active";

  const variants = [reportVariant, scheduleVariant, teamVariant];

  // Once, and only once the row has nothing left to ask for.
  if (variants.every((variant) => variant === "done")) return null;

  // Emphasis marks where the row is up to, so it belongs to the first card that
  // is not finished — whatever variant that card is wearing. A progress receipt
  // qualifies: the first report being on its way is exactly where a coach's
  // attention should land, and skipping past it to an active card behind would
  // recommend a later step over the one already running.
  //
  // Written as "first not done" rather than "first active" for a second reason:
  // the only arrangement with no active card at all — report analysing, event
  // scheduled, roster built — is reachable on any coach's first afternoon, and
  // "first active" returns -1 there, leaving the whole row flat. Because the
  // all-done row has already returned above, this always finds a card, so there
  // is exactly one emphasised card in every state that renders.
  const emphasis = variants.findIndex((variant) => variant !== "done");

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Slot eyebrow="First report" emphasis={emphasis === 0}>
        {reportVariant === "done" && report ? (
          <DoneReceipt
            title="Report is back"
            body={`${report.title} · ${report.date}`}
            href={`/dashboard/matches/${report.id}`}
            link="View report"
          />
        ) : reportVariant === "progress" && inFlight ? (
          <>
            <span className={`${TITLE} text-[var(--ink-700)]`}>On its way</span>
            <span className={`${BODY} text-[var(--ink-700)]`}>
              We&#39;ll notify you when it&#39;s ready — the tray tracks it.
            </span>
            {/* The button's slot, holding the state instead. When this card
                carries emphasis there is nothing here to turn primary, so the
                lifted border and the card shadow are the whole of it — which is
                right for a receipt: it is reporting, not asking. */}
            <div className="mt-1 flex items-center gap-3">
              {/* The product's own word for the state, and its own rule about
                  which states pulse: `isWorking`, the same predicate the match
                  page animates on. A chip that pulsed here and sat still there
                  would be two screens telling one job different stories. */}
              <StatusChip tone="blue" live={isWorking(inFlight.status)}>
                {ANALYSIS_LABEL[inFlight.status]}
              </StatusChip>
              <Elapsed startedAt={inFlight.startedAt} nowMs={nowMs} />
            </div>
          </>
        ) : (
          <>
            <span className={`${TITLE} text-[var(--ink-900)]`}>
              Send your first match
            </span>
            <span className={`${BODY} text-[var(--ink-700)]`}>
              Singles, 1080p or better.
            </span>
            {/* Unconditionally primary, and it can be: this branch renders only
                when the first card is active, and an active first card is by
                definition the first not-done one — so emphasis is already here.
                The other two cards have a card in front of them and so have to
                ask. */}
            <div className="mt-1">
              {canSubmitVideo ? (
                <Link
                  href="/dashboard/matches/new"
                  className={advButton("primary")}
                >
                  Send a match
                </Link>
              ) : (
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    disabled
                    className={advButton("primary")}
                  >
                    Send a match
                  </button>
                  <span className="text-[11px] leading-[1.4] text-[var(--ink-500)]">
                    Paused until we confirm the program. Everything else below
                    works now.
                  </span>
                </div>
              )}
            </div>
          </>
        )}
      </Slot>

      <Slot eyebrow="Your schedule" emphasis={emphasis === 1}>
        {nextEvent ? (
          <DoneReceipt
            title={`${nextEvent.name} is scheduled`}
            body={`${formatEventDay(nextEvent.startsOn)} · film from it tags itself`}
            href={`/dashboard/team/schedule/${nextEvent.id}`}
            link="View event"
          />
        ) : (
          <>
            <span className={`${TITLE} text-[var(--ink-900)]`}>
              Put a dual on the schedule
            </span>
            <span className={`${BODY} text-[var(--ink-700)]`}>
              Film you send from it tags itself.
            </span>
            <div className="mt-1">
              <Link
                href="/dashboard/team/schedule/new/dual"
                className={advButton(emphasis === 1 ? "primary" : "outline")}
              >
                New event
              </Link>
            </div>
          </>
        )}
      </Slot>

      <Slot eyebrow="Your team" emphasis={emphasis === 2}>
        {teamVariant === "done" ? (
          <DoneReceipt
            title={
              roster.joined > 0
                ? `${playersLabel(roster.joined)} on the roster`
                : "Invitations are out"
            }
            body={
              roster.invited > roster.joined
                ? `${roster.invited - roster.joined} still to accept.`
                : "Add more whenever the squad changes."
            }
            href="/dashboard/team/roster"
            link="View roster"
          />
        ) : (
          <>
            <span className={`${TITLE} text-[var(--ink-900)]`}>
              Build your roster
            </span>
            <span className={`${BODY} text-[var(--ink-700)]`}>
              Add players now — you can upload for them today. Invites link
              later; everything carries over when they claim.
            </span>
            <div className="mt-1">
              <Link
                href="/dashboard/team/roster"
                className={advButton(emphasis === 2 ? "primary" : "outline")}
              >
                Add players
              </Link>
            </div>
          </>
        )}
      </Slot>
    </div>
  );
}

/**
 * One card's box.
 *
 * Emphasis is the whole difference: the medium border and the card shadow lift
 * exactly one card off the page, and every other card is a hairline rectangle
 * whose control — where it still has one — is secondary. Two lifted cards is
 * two recommendations, which is none.
 */
function Slot({
  eyebrow,
  emphasis,
  children,
}: {
  eyebrow: string;
  emphasis: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`${SLOT} ${
        emphasis
          ? "border-[var(--border-medium)]"
          : "border-[var(--border-hairline)]"
      }`}
      style={emphasis ? { boxShadow: "var(--shadow-card)" } : undefined}
    >
      <span className="eyebrow">{eyebrow}</span>
      {children}
    </div>
  );
}

/**
 * A step that is over, stated once and then left alone.
 *
 * Ink-500 for both lines, because the card is now a record rather than an
 * instruction, and one text link rather than a button — a receipt with a button
 * on it is still asking for something.
 */
function DoneReceipt({
  title,
  body,
  href,
  link,
}: {
  title: string;
  body: string;
  href: string;
  link: string;
}) {
  return (
    <>
      <span className={`${TITLE} text-[var(--ink-500)]`}>
        {/* Plain, inheriting the title's ink. A green tick would read as a
            result, and results on this page belong to matches. */}
        <Check className="size-[15px] shrink-0" strokeWidth={1.5} aria-hidden />
        {title}
      </span>
      <span className={`${BODY} text-[var(--ink-500)]`}>{body}</span>
      <div className="mt-1">
        <Link href={href} className={QUIET_LINK}>
          {link}
        </Link>
      </div>
    </>
  );
}

/**
 * How long the job has been going, in mono.
 *
 * A machine value, so Roboto Mono and tabular figures — the same treatment the
 * match rows give a date. Rendered on the server clock and not ticking: nothing
 * else on this page updates in place either, and a lone live counter beside six
 * static rows claims a freshness the page does not have.
 *
 * Renders nothing at all when there is no start time. An import has no job and
 * so no clock, and inventing one would put a fabricated fact beside a real
 * status.
 */
function Elapsed({
  startedAt,
  nowMs,
}: {
  startedAt?: string;
  nowMs: number;
}) {
  if (!startedAt) return null;

  const started = Date.parse(startedAt);
  if (!Number.isFinite(started)) return null;

  const minutes = Math.max(0, Math.floor((nowMs - started) / 60_000));
  const label =
    minutes < 60
      ? `${minutes}m`
      : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;

  return (
    <span className="font-mono tabular text-[11px] text-[var(--ink-500)]">
      {label}
    </span>
  );
}
