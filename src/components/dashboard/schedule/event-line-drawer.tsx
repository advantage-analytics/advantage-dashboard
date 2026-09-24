"use client";

import Link from "next/link";
import Image from "next/image";
import { Calendar, Clock, Info, MapPin, Trophy } from "lucide-react";
import {
  PeekDrawerFrame,
  RetryButton,
} from "@/components/dashboard/matches/match-drawer";
import { MatchActionsMenu } from "@/components/dashboard/matches/match-actions/match-actions-menu";
import {
  AnalysisNotice,
  DrawerFact,
  DrawerHeading,
  ProviderFact,
  SnapshotSection,
  drawerSideName,
  useMatchSnapshot,
} from "@/components/dashboard/matches/drawer-sections";
import {
  noteIconCls,
  noteStripCls,
} from "@/components/dashboard/matches/new-match-wizard/styles";
import {
  PendingBar,
  PendingRegion,
} from "@/components/dashboard/loading/pending";
import { lineAction } from "@/lib/schedule/line-action";
import { scoreHref } from "@/lib/schedule/score-seed";
import { ResultMark } from "@/components/dashboard/result-mark";
import { StatusChip } from "@/components/ui/status-chip";
import {
  isAnalysisFailed,
  isAnalysisReady,
  isInFlight,
} from "@/lib/data/match-analysis";
import {
  resolveEntryResult,
  resultState,
  resultWon,
} from "@/lib/schedule/entry-state";
import { lineupForfeitSide } from "@/lib/schedule/entry-plan";
import {
  formatEventDatesLong,
  lineFormat,
  siteTitle,
  surfaceTitle,
} from "@/lib/schedule/format";
import { LINE_STATUS } from "@/lib/schedule/line-status";
import { scoreSetsFrom } from "@/lib/ui/score-format";
import { advButton } from "@/lib/ui/adv-button";
import { formatShortDate } from "@/lib/ui/date-format";
import { cn } from "@/lib/utils";
import type {
  EventEntry,
  EventFormat,
  ProgramEvent,
} from "@/lib/schedule/types";

/**
 * The event pages' line drawer — one line (a dual's court, a tournament
 * round) as the Matches page's peek rail. Frames: `DualDrawer.dc.html`
 * (singles), `DualDoublesDrawer.dc.html` (doubles) and
 * `TournamentDrawer.dc.html` (a tournament round) in
 * `docs/superpowers/specs/2026-09-23-event-pages-match-table/`.
 *
 * The shell is `PeekDrawerFrame`, and the body is `drawer-sections.tsx`'s
 * pieces, so a line reads exactly as a match does on the Matches page:
 * the matchup (linking to the report once there is a match), the outcome and
 * score, the facts rail, the analysis state, and the snapshot figures. What
 * differs by page is the `context` slot under them — the dual's nine lines,
 * a tournament player's rounds — which the page draws and hands in.
 *
 * ── Actions ────────────────────────────────────────────────────────────────
 * What a line offers next is `lineAction` (`src/lib/schedule/line-action.ts`),
 * the rule the old line rows drew — never restated here. The footer maps it
 * onto the Matches drawer's rule (`MatchDrawer`'s `continueHref`): "View
 * match" is the blue primary while nothing else is on offer, and drops to
 * ghost the moment a follow-up applies — the follow-up is then the one
 * primary. Follow-ups, first one wins the primary:
 *
 *   1. "Add result" / "Edit result" into the event's `/score` flow — a line
 *      with no match, an outcome, or any doubles line (score only: no
 *      snapshot, video or report to offer).
 *   2. "Retry" — a singles match whose analysis failed, for a viewer who can
 *      edit the schedule. `EntryMatch` carries no uploader, so `canEdit`
 *      gates it and the resubmit route refuses anyone else (T10's rule).
 *   3. "Add video" — a scored singles line nothing was sent for.
 *   4. A tournament round's next step — `nextResultHref`, "Add result" into
 *      the score flow at the round after the run's last match — so every
 *      round's drawer, a played one included, can move the run on.
 *
 * Any later follow-up is outline. No footer ever holds two primaries.
 *
 * ⋯ is `MatchActionsMenu` (Edit · Delete), drawn only when the line has a
 * played match and the viewer can edit the schedule. `EntryMatch` carries no
 * uploader, so `canEdit` gates it and the server actions refuse anyone who
 * does not own the match.
 */
export function EventLineDrawer({
  kind = "Line",
  event,
  entry,
  round = null,
  lineLabel,
  eventLabel,
  canEdit,
  nextResultHref = null,
  context,
  index,
  total,
  canPrev,
  canNext,
  closing,
  autoFocus,
  onPrev,
  onNext,
  onClose,
  onClosed,
}: {
  /** The counter's noun — "Line" on a dual, "Match" on a tournament. */
  kind?: string;
  event: ProgramEvent;
  entry: EventEntry;
  /** The tournament round this drawer describes. Null on a dual line. */
  round?: string | null;
  /** "S2" on a dual, "R16" on a tournament — printed after the event fact. */
  lineLabel: string;
  /** The event fact's words — "vs Meridian State" on a dual. */
  eventLabel: string;
  canEdit: boolean;
  /**
   * The score flow at the entry's next round — a tournament's "Add result".
   * Drawn only when the viewer can score this line, and never twice.
   */
  nextResultHref?: string | null;
  /** The page's own list under the line — "This dual", a player's rounds. */
  context?: React.ReactNode;
  /** The counter — "Line 2 / 9". */
  index: number;
  total: number;
  canPrev: boolean;
  canNext: boolean;
  closing: boolean;
  autoFocus: boolean;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  onClosed: () => void;
}) {
  const result = resolveEntryResult(entry, round);
  const played = result.kind === "played" ? result.match : null;
  const state = resultState(result);
  const won = resultWon(result);
  const doubles = entry.discipline === "doubles";
  const forfeitSide = lineupForfeitSide(entry);
  // A "No player" forfeit, either side's, is the lineup's own answer: it
  // changes through Edit dual, not the score flow — the rows' rule.
  const canScore = canEdit && forfeitSide === null;
  const lineScoreHref = scoreHref(entry.eventId, entry.id, round);
  const action = lineAction({
    state,
    match: played,
    entryId: entry.id,
    matchId: played?.id ?? null,
    doubles,
    canEdit: canScore,
    scoreHref: lineScoreHref,
  });

  const ours =
    entry.playerLabels.length === 0
      ? "No player"
      : entry.playerLabels.join(" / ");
  const theirs =
    played?.opponentLabels.join(" / ") || entry.opponentLabels.join(" / ");
  const fullName = theirs ? `${ours} vs ${theirs}` : ours;
  const title = theirs
    ? `${drawerSideName(ours)} vs ${drawerSideName(theirs)}`
    : drawerSideName(ours);
  const href = played ? `/dashboard/matches/${played.id}` : null;
  const outcome =
    result.kind === "non-played" ? (LINE_STATUS[state] ?? null) : null;

  // No numbers while a match is being worked on or has failed — the score
  // would draw as a result the analysis has not stood behind yet.
  const status = played?.status;
  const settled =
    played !== null &&
    !isInFlight(played.status) &&
    !isAnalysisFailed(played.status);
  const sets = settled && played ? scoreSetsFrom(played.score) : [];

  // Doubles: the one follow-up is the score, scored or not. Singles take the
  // rows' rule.
  const resultLink = doubles
    ? canScore
      ? { label: played ? "Edit result" : "Add result", href: lineScoreHref }
      : null
    : action?.kind === "add-result"
      ? { label: "Add result", href: action.href }
      : action?.kind === "outcome" && action.editHref
        ? { label: "Edit result", href: action.editHref }
        : null;
  const viewMatch = href && !(doubles && resultLink) ? href : null;
  const addVideo = action?.kind === "add-video" ? action.href : null;
  const nextResult =
    canScore && nextResultHref && resultLink?.label !== "Add result"
      ? nextResultHref
      : null;
  // A failed singles analysis the coach can resubmit. `status` is the line's
  // match's own — the in-flight and ready states never offer it.
  const retryJobId =
    !doubles && canEdit && played?.status === "failed" && played.jobId
      ? played.jobId
      : null;
  // The first follow-up on offer is the footer's one primary; "View match"
  // is primary only when there is none (the Matches drawer's rule).
  const primary: "result" | "retry" | "video" | "next" | "view" = resultLink
    ? "result"
    : retryJobId
      ? "retry"
      : addVideo
        ? "video"
        : nextResult
          ? "next"
          : "view";
  const variant = (slot: typeof primary) =>
    primary === slot ? "primary" : slot === "view" ? "ghost" : "outline";
  // Retry is a follow-up, never "view", so it is primary or outline.
  const retryVariant = primary === "retry" ? "primary" : "outline";

  return (
    <PeekDrawerFrame
      kind={kind}
      label={fullName}
      index={index}
      total={total}
      canPrev={canPrev}
      canNext={canNext}
      closing={closing}
      autoFocus={autoFocus}
      // A tournament's rounds share an entry, so the round is part of the key.
      focusKey={round ? `${entry.id}:${round}` : entry.id}
      onPrev={onPrev}
      onNext={onNext}
      onClose={onClose}
      onClosed={onClosed}
      actions={
        played && canEdit ? (
          <MatchActionsMenu
            key={played.id}
            matchId={played.id}
            matchLabel={`${fullName} · ${lineLabel}`}
          />
        ) : null
      }
      footer={
        resultLink || viewMatch || retryJobId || addVideo || nextResult ? (
          <>
            {resultLink ? (
              <Link
                href={resultLink.href}
                className={cn(advButton(variant("result"), "md"), "w-full")}
              >
                {resultLink.label}
              </Link>
            ) : null}
            {viewMatch ? (
              <Link
                href={viewMatch}
                className={cn(advButton(variant("view"), "md"), "w-full")}
              >
                View match
              </Link>
            ) : null}
            {retryJobId ? (
              <RetryButton
                key={retryJobId}
                jobId={retryJobId}
                variant={retryVariant}
              />
            ) : null}
            {addVideo ? (
              <Link
                href={addVideo}
                className={cn(advButton(variant("video"), "md"), "w-full")}
              >
                Add video
              </Link>
            ) : null}
            {nextResult ? (
              <Link
                href={nextResult}
                className={cn(advButton(variant("next"), "md"), "w-full")}
              >
                Add result
              </Link>
            ) : null}
          </>
        ) : null
      }
    >
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-[22px] pt-5 pb-[22px]">
        {href ? (
          <DrawerHeading
            href={href}
            label={fullName}
            title={title}
            won={won}
            sets={sets}
          />
        ) : (
          <div className="flex min-w-0 flex-col gap-2.5">
            <h2 className="text-title-lg truncate text-[var(--ink-900)]">
              {title}
            </h2>
            {outcome ? (
              // A non-played line carries its outcome, never an invented score.
              <div className="flex h-5 items-center gap-2">
                {won === null ? null : <ResultMark won={won} />}
                <StatusChip tone={outcome.tone}>{outcome.label}</StatusChip>
              </div>
            ) : null}
          </div>
        )}

        <dl className="flex min-w-0 flex-col gap-0.5 text-left">
          <DrawerFact label="Date" icon={<Calendar />}>
            {/* The match's own day once there is one — the Matches drawer's
                formatter — else the event's dates (a tournament's span). */}
            <span className="tabular">
              {played?.date
                ? formatShortDate(played.date)
                : formatEventDatesLong(event.startsOn, event.endsOn)}
            </span>
          </DrawerFact>
          <DrawerFact
            label="Court"
            icon={
              <Image
                src="/icons/tennis-court-icon.svg"
                alt=""
                width={16}
                height={16}
              />
            }
          >
            {event.surface ? surfaceTitle(event.surface) : "Not specified"}
          </DrawerFact>
          <DrawerFact label="Home/Away" icon={<MapPin />}>
            {siteTitle(event.site)}
          </DrawerFact>
          <DrawerFact label="Event" icon={<Trophy />}>
            {eventLabel}
            <span className="text-[var(--ink-500)]"> · {lineLabel}</span>
          </DrawerFact>
          {/* The Matches drawer's order: the match's own facts, then Format
              last. A line with no match draws neither. */}
          {played?.duration ? (
            <DrawerFact label="Duration" icon={<Clock />}>
              <span className="tabular">{played.duration}</span>
            </DrawerFact>
          ) : null}
          {played ? <ProviderFact providerId={played.sourceProvider} /> : null}
          <DrawerFact label="Format" icon={<Info />}>
            {lineFormatWords(event.format, entry.discipline)}
          </DrawerFact>
        </dl>

        {doubles ? (
          // A fact about the product, not a question — grey, the wizard's
          // strip (`DualFactsStep`), word for word.
          <div className={noteStripCls}>
            <Info
              className={`${noteIconCls} text-[var(--ink-400)]`}
              strokeWidth={1.5}
              aria-hidden="true"
            />
            <span>
              <b className="font-medium text-[var(--ink-900)]">
                Doubles lines record a score only.
              </b>{" "}
              Statistics and video analysis are singles only for now.
            </span>
          </div>
        ) : played ? (
          <>
            <AnalysisNotice
              status={status}
              // The job's note travels with the retry: a viewer who cannot
              // resubmit reads only that analysis stopped.
              failNote={retryJobId ? played.failNote : null}
              canRetry={retryJobId !== null}
            />
            {settled && isAnalysisReady(played.status) ? (
              <LineSnapshot matchId={played.id} />
            ) : null}
          </>
        ) : null}

        {context}
      </div>
    </PeekDrawerFrame>
  );
}

/**
 * The four snapshot figures for a line whose match has statistics. Only
 * asked for once analysis is ready — a hand-scored match has none to fetch.
 * A skeleton holds the section's place while the row loads; a match that
 * turns out to have no figures shows nothing, the Matches drawer's rule.
 */
function LineSnapshot({ matchId }: { matchId: string }) {
  const snapshot = useMatchSnapshot(matchId);
  if (snapshot === undefined) return <SnapshotPending />;
  return snapshot ? <SnapshotSection snapshot={snapshot} /> : null;
}

/**
 * `SnapshotSection`'s frame — its real "Snapshot" eyebrow over four figure
 * bars in the section's 2×2 grid: a 20px bar for the 16px figure, a 12px bar
 * for its 11px label, 3px apart as the `dt`/`dd` pair sits.
 */
function SnapshotPending() {
  return (
    <PendingRegion label="snapshot" innerClassName="flex flex-col gap-3">
      <span className="eyebrow-sm">Snapshot</span>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        {[0, 1, 2, 3].map((cell) => (
          <div key={cell} className="flex flex-col gap-[3px]">
            <PendingBar className="h-5 w-10" />
            <PendingBar className="h-3 w-20" />
          </div>
        ))}
      </div>
    </PendingRegion>
  );
}

/**
 * "Best of 3 · no-ad", "One set to 6 · no-ad" — a line's format in sentence
 * case, off `lineFormat`, the one place the singles/doubles split is
 * decided. A null ad-scoring prints nothing rather than a guess.
 */
export function lineFormatWords(
  format: EventFormat,
  discipline: EventEntry["discipline"],
): string {
  const line = lineFormat(format, discipline);
  const sets =
    discipline === "doubles"
      ? line.gamesTo === 8
        ? "8-game pro-set"
        : "One set to 6"
      : line.bestOf === 1
        ? "One set"
        : `Best of ${line.bestOf}`;
  if (line.adScoring === null) return sets;
  return `${sets} · ${line.adScoring ? "ad" : "no-ad"}`;
}

/* ── Context list ───────────────────────────────────────────────────────── */

/**
 * The context section's frame: a 9px eyebrow with a summary on the right,
 * then 30px rows. The page fills the rows with `LineContextRow`.
 */
export function LineContextList({
  eyebrow,
  summary,
  children,
}: {
  eyebrow: string;
  summary?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={eyebrow} className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="eyebrow-sm">{eyebrow}</span>
        {summary ? (
          <span className="text-[11px] text-[var(--ink-500)]">{summary}</span>
        ) : null}
      </div>
      <div className="flex flex-col">{children}</div>
    </section>
  );
}

/**
 * One line in the context list: slot, our side, the score (or outcome), and
 * the result mark. A button — choosing it moves the drawer to that line; the
 * open line carries `aria-current` and the Matches row's wash.
 */
export function LineContextRow({
  label,
  name,
  score,
  won,
  current,
  onSelect,
}: {
  label: string;
  name: string;
  score: React.ReactNode;
  won: boolean | null;
  current: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-current={current ? "true" : undefined}
      onClick={(clickEvent) => {
        clickEvent.stopPropagation();
        onSelect();
      }}
      className={cn(
        "-mx-2 flex h-[30px] cursor-pointer items-center gap-2.5 rounded-[var(--radius-element)] px-2 text-left transition-colors duration-[var(--duration-hover)] hover:bg-[var(--surface-muted)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
        current && "bg-[var(--surface-muted)]",
      )}
    >
      <span className="mono w-[22px] shrink-0 text-[10px] text-[var(--ink-400)]">
        {label}
      </span>
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-[12px]",
          current
            ? "font-medium text-[var(--ink-900)]"
            : "text-[var(--ink-700)]",
        )}
      >
        {name}
      </span>
      <span className="tabular shrink-0 text-[12px] whitespace-nowrap text-[var(--ink-700)]">
        {score}
      </span>
      <span className="flex w-3.5 shrink-0 justify-center">
        {won === null ? null : <ResultMark won={won} />}
      </span>
    </button>
  );
}
