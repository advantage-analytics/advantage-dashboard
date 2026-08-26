import { createClient } from "@/lib/supabase/server";
import { getProgramUsage, type ProgramUsage } from "@/lib/data/usage-server";
import {
  getTeamSettings,
  type TeamInvite,
} from "@/lib/data/team-settings-server";
import { loadMatchAnalysis } from "@/lib/data/match-analysis-server";
import {
  claimedTodayNames,
  type RosterInvite,
} from "@/lib/data/team-roster-server";
import {
  ANALYSIS_LABEL,
  importedAnalysis,
  isAnalysisFailed,
  isAnalysisReady,
  isInFlight,
  isLiveUpdating,
  manualAnalysis,
  type AnalysisStatus,
  type MatchAnalysis,
} from "@/lib/data/match-analysis";
import {
  matchOutcome,
  setTally,
  shortDate,
  type MatchScore,
} from "@/lib/data/match-utils";
import { meanOfPresent, pct, statKey } from "@/lib/data/aggregate";
import { rosterMatchIds } from "@/lib/data/roster-ids";
import {
  countTile,
  seriesTile,
  type TeamKpiObservation,
  type TeamKpiTile,
} from "@/lib/data/team-kpi";
import { scoreSetsFrom, type ScoreLineSet } from "@/lib/ui/score-format";
import {
  eventDetailFrom,
  getProgramSchedule,
  scheduleRowsFrom,
} from "@/lib/data/schedule-server";
import type { EventDetail, ScheduleRow } from "@/lib/schedule/types";
import {
  dualScore,
  entryPlayed,
  entryState,
  matchState,
  matchWon,
  type EntryState,
} from "@/lib/schedule/entry-state";
import type { EventEntry, EventKind, EventSite } from "@/lib/schedule/types";
import { INVITE_TTL_HOURS } from "@/lib/services/programs/tokens";

/**
 * What the program's home page reads.
 *
 * F6 and F8 are the same page with and without rows in it, so they are one
 * query set rather than two: the budget meter is on screen from visit one
 * — coaches steward budgets for a living, and hiding it until it matters is
 * the version that feels like a trick.
 *
 * None of this is a new source of truth. Usage comes from the same SECURITY
 * DEFINER functions Settings › Usage reads, the roster from the same
 * `program_roster` RPC Settings › Team reads and the same `program_roster_full`
 * RPC the Roster page reads, the next event, the weekend dual and the dual
 * record from the one `getProgramSchedule()` the schedule page reads through,
 * match state from the shared analysis
 * loader, and who won from the same `matchOutcome` the matches list, the
 * schedule and every player profile ask. A second answer to "how many hours
 * have we used" — or to "did we win that" — would be worse than no answer,
 * because someone would believe this one.
 */

/** How many rows the page shows before "see all" would be the honest control. */
const RECENT_MATCH_LIMIT = 6;

/** Invites close enough to expiry to be worth naming on the home page. */
const EXPIRING_SOON_DAYS = 7;

/** One day. The horizon above is measured in these, and so is the countdown. */
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The zone Team Home does its calendar arithmetic in.
 *
 * Pinned, not inherited from the process. `usage-format.ts` and
 * `active-workspace-server.ts` both pass `timeZone: "UTC"` for this reason: a
 * day computed in whatever zone the runtime happens to sit in is one answer on
 * a laptop and a different one on Vercel, and nothing on screen says which you
 * are looking at.
 *
 * UTC is the honest constant here, NOT the right answer. The week turns over at
 * midnight UTC, which is Sunday afternoon on the West Coast, so a Pacific
 * program's weekend sheet still leaves the page while Sunday evening is going
 * on — the same failure the Monday-start rule below exists to prevent, moved a
 * few hours rather than fixed. Fixing it needs the PROGRAM's zone, and there is
 * no `programs.timezone` column to read one from. `programs.state` is not a
 * substitute: Arizona keeps no DST and nine states are split across two zones,
 * so a state-to-zone table would be a guess wearing a schema's clothes. When
 * that column lands, this constant becomes that field and both getters below
 * already take it as an argument.
 */
const PROGRAM_TIME_ZONE = "UTC";

/**
 * The day `now` falls on in `timeZone`, as YYYY-MM-DD.
 *
 * `program_events.starts_on` and `ends_on` are dates, not instants, so the
 * comparison has to be made in the same units — and which day an instant falls
 * on depends entirely on where the person asking is standing.
 *
 * This used to read the day off `now.getMonth()`/`getDate()` and call the
 * result "the reader's own reckoning", arguing that it protected anyone west of
 * Greenwich from `toISOString()`. It never did: those getters read the SERVER's
 * zone, and on Vercel the server's zone is UTC, so they returned the very UTC
 * day the comment said they were avoiding. The zone is an argument now, so the
 * answer belongs to whoever the caller names and a test can name one.
 *
 * Exported for `tests/team-home-week.spec.ts` only — the page reads it through
 * `getTeamHomeData` below.
 */
export function localDay(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((piece) => piece.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/**
 * The week `now` falls in, Monday to Sunday, as read in `timeZone`.
 *
 * **Monday-start, and that is the whole point.** A dual is played on a Friday or
 * a Saturday and read about for the rest of the weekend; under the US
 * Sunday-start week, Saturday's dual falls into *last* week the moment Sunday
 * begins, and the sheet naming it would vanish overnight while the coach was
 * still looking for it. Monday-start keeps Friday, Saturday and Sunday on one
 * side of the boundary, which is what makes "this weekend" a single object.
 *
 * Which instant "the moment Sunday begins" names is the zone's business, not
 * the server's — see `PROGRAM_TIME_ZONE`, whose comment says what today's
 * pinned value costs.
 *
 * Both ends are YYYY-MM-DD because `program_events.starts_on` is a date, not an
 * instant — the same reason `localDay` exists.
 *
 * Exported for `tests/team-home-week.spec.ts` only, for the same reason
 * `localDay` is: the zone this computes in is the thing worth pinning down.
 */
export function weekBounds(now: Date, timeZone: string): { start: string; end: string } {
  // Take the calendar day in `timeZone`, then step days on a UTC-midnight
  // anchor for it. Stepping on a zoned Date walks through DST twice a year and
  // a week built across that boundary is six days or eight; no UTC day is
  // shorter or longer than another.
  const [year, month, day] = localDay(now, timeZone).split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, day));
  // getUTCDay() is 0 for Sunday, so Sunday is six days into a Monday-start week.
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));

  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);

  // Both anchors are UTC midnights by construction, so UTC is the zone that
  // reads them back as the days they were built to be — passing `timeZone`
  // here would shift them off by one for anyone behind Greenwich.
  return { start: localDay(start, "UTC"), end: localDay(end, "UTC") };
}

export interface TeamMatchRow {
  id: string;
  /**
   * "M. Reid vs J. Park" — the program's side named FIRST wherever the row
   * establishes one, so the names, the score and the mark all read from the
   * same point of view. See `programSide()`.
   */
  title: string;
  /** "Big Sky dual · away", or the match type when there is no event. */
  context: string;
  status: AnalysisStatus;
  /** The product's own word for the status — never a second vocabulary. */
  label: string;
  /** "Aug 8" */
  date: string;
  /**
   * The set scores, oriented so `player1` is the side `title` names first.
   *
   * Resolved here rather than in the row, because `<ScoreLine>` takes
   * pre-oriented sets and deliberately never asks who is looking. Empty when
   * nobody has recorded a score — the row falls back to its status dot then.
   */
  sets: ScoreLineSet[];
  /**
   * Did the PROGRAM's side win?
   *
   * `null` covers three different silences, and all three must render the same
   * way — without a `<ResultMark>`: no score recorded, a score that decides
   * nothing (level sets), and a row whose side `programSide()` cannot
   * establish. A row with no glyph is honest; a green check on a match the
   * program lost is the silent misattribution `docs/ui-revamp-guardrails.md`
   * exists to prevent, and nothing on screen would look broken.
   */
  won: boolean | null;
  /**
   * When the job row was created, ISO — absent for an import, which never had
   * one. Carried so a surface showing an in-flight match can say how long it
   * has been going; `loadMatchAnalysis` already reads it, so this costs no
   * query.
   */
  startedAt?: string;
}

/**
 * The soonest event the program has not finished yet.
 *
 * Upcoming only, and deliberately so: a program whose schedule holds nothing
 * but last season has the same next action as one holding nothing at all.
 *
 * Read off `getProgramSchedule()`, which the KPI strip's dual record makes an
 * unconditional cost of this page anyway. It used to have its own narrow
 * `program_events` query, windowed to a dozen rows from this week's Monday and
 * ordered ascending — a fourth round trip for four fields the schedule read
 * already carries, plus a second ordering of `program_events` that had to stay
 * in step with the schedule page's. Both are gone: this and the weekend dual
 * are two reads off the one list, and there is no longer a second ordering to
 * keep in agreement.
 *
 * The window went with the query, and that is a strict gain rather than a
 * trade: a limit of twelve could in principle hide the next event behind a
 * program that had finished a dozen since Monday, and the whole list cannot.
 */
export interface TeamNextEvent {
  id: string;
  /** Opponent school for a dual, the tournament's own name for a tournament. */
  name: string;
  /**
   * Which of those two the name above is, because they are read differently: a
   * dual's `name` is the opponent and wants a "vs" in front of it, a
   * tournament's is the event's own title and stands alone. Off the row the
   * query already selects — `kind` is what tells the sheet which of these
   * events is a dual — so this is a field, not a column and not a read.
   */
  kind: EventKind;
  /** YYYY-MM-DD. */
  startsOn: string;
}

/**
 * One line of the dual sheet — a court, who stood on it, and how it went.
 *
 * **`player1` is our side, and nothing here asks a second time.** Every row on
 * this card is by definition a line off this program's schedule, and
 * `lib/schedule/entry-state.ts` states the convention the whole schedule is
 * read under: a match tied to an entry has us in `player1`. So the sets are
 * taken unswapped and `won` comes from the shared `matchWon`, which counts
 * `score.player1` as ours. `programSide()` above answers the same question for
 * the matches list, where a row may be nobody's line and the answer can be
 * genuinely unknown; here it cannot, so a third rule would only be a chance to
 * disagree with the two that exist.
 *
 * `won` is still nullable, for the two silences that survive that convention:
 * no score recorded, and a score that decides nothing. Both render without a
 * `<ResultMark>` — a glyph on the wrong side of a line is the silent wrong
 * result `docs/ui-revamp-guardrails.md` exists to prevent.
 */
export interface DualSheetLine {
  /** The entry's id. The line is the thing that persists; a match may not exist. */
  id: string;
  /** "S1"…"S6", "D1"…"D3". */
  slot: string;
  /** "Reid", or "Brooks / Reid" on a doubles line. */
  ours: string;
  theirs: string;
  /** Empty when nobody has recorded a score — the row shows its state instead. */
  sets: ScoreLineSet[];
  won: boolean | null;
  /** What this line is waiting for, in the schedule's own vocabulary. */
  state: EntryState;
  /** The match to read a report on — set only where analysis produced one. */
  reportId: string | null;
}

/**
 * This week's dual, as the home page's sheet.
 *
 * Assembled from the page's one `getProgramSchedule()` read — the same loader
 * the event page and the schedule page read through, and the same
 * `EventDetail` the event page is built from — rather than from a second query
 * set of its own, or a second trip for an event already in hand. Everything counted
 * here is counted by `lib/schedule/entry-state.ts`: a dual's team score is
 * never stored, because a stored one stops agreeing with the lines above it the
 * first time a result is corrected.
 */
export interface WeekendDual {
  id: string;
  /** The opponent school. `program_events.name` is the opponent on a dual. */
  opponent: string;
  site: EventSite;
  surface: string | null;
  /** YYYY-MM-DD. */
  startsOn: string;
  /** Position order: S1–S6, then D1–D3. */
  lines: DualSheetLine[];
  /** Team points, from `dualScore` — six singles and one doubles point. */
  us: number;
  them: number;
  /**
   * Every line is in.
   *
   * The same rule `getScheduleRows` prints a team score under, and it is here
   * for the same reason: a partial tally presented as a final one is a result
   * the page invented. The card shows its running tally either way — it is a
   * live sheet — and says "final" only when this is true.
   */
  decided: boolean;
  /** Lines with a decided match under them, for "3 of 9 in". */
  playedLines: number;
  /** The tally's two halves, and they add up to it — see `dualBreakdown`. */
  singles: { us: number; them: number };
  doubles: { us: number; them: number };
  /**
   * Who has taken more points than the dual has left to give, or null.
   *
   * Named only when the lines actually clinch it: a majority of the points this
   * dual can award, which for a full nine-line dual is 4 of 7. Never inferred
   * from `decided` — a dual can be over without either side having clinched
   * (an abandoned card), and clinched long before it is over.
   */
  clinchedBy: "us" | "them" | null;
}

/**
 * The roster, as the right column reads it.
 *
 * **The Roster page's own vocabulary, not a second set of words for it.** The
 * rows are `RosterInvite` — the very type `getRosterData` hands its table —
 * built the same way, `shortDate` included, so "Invited Aug 4" means the same
 * thing and is spelled the same way on both screens. The claimed-today names
 * come through `claimedTodayNames()`, which is where the pill's rule about what
 * "today" means already lives.
 *
 * Null when the program has nobody, nothing outstanding and no news: the card
 * renders nothing at all rather than a heading over an empty list. On day zero
 * that is the whole card — the checklist in the main column is what a program
 * with no roster is looking at.
 */
export interface TeamRosterCard {
  /**
   * Players on the roster, counted the way the Roster page counts them.
   *
   * **The same number as `RosterProgress.players`, off the same rows and the
   * same predicate** — both go through `playerCount()`. That was not always
   * true: `RosterProgress` used to count SEATS, people who had accepted an
   * invitation, so a squad a coach had built by hand read "8 players" in this
   * card while the checklist beside it was still asking them to invite
   * somebody. Two numbers behind one sentence, on one page.
   */
  players: number;
  /**
   * Every outstanding invitation, staff included, exactly as the Roster page
   * lists them. Not filtered to players the way `RosterProgress` is: this card
   * is the list of open invitations, and an assistant coach who has not
   * accepted is one of them.
   */
  invites: RosterInvite[];
  /** Who bound a login to a profile today, by name. */
  claimedToday: string[];
}

/**
 * One thing on the page that is waiting for somebody.
 *
 * **Every row here is a fact the loader already holds.** No alert is
 * manufactured to make the list look fuller and no query was added to find one:
 * a failed job and a job that has been running too long come off the same
 * `matches` rows the list below renders, and the invite clock is the one
 * `rosterProgress()` already reads. Two rows is the right length when two
 * things need attention.
 *
 * Deliberately NOT here: "stats did not reconcile". `processed` is what a
 * completed vendor job sits in until Phase 2 derivation runs, and derivation is
 * gated (`docs/ui-revamp-guardrails.md` §5) — so every analysed match in the
 * product today is in that state, and an alert on it would fire on all of them
 * and mean nothing. There is no reconciliation signal to read yet.
 */
export interface TeamAlert {
  id: string;
  /** What kind of thing this is. The list picks its icon from it. */
  kind: "match-failed" | "match-slow" | "invite-expiring";
  /** What it is about — a match by its title, or the invitations. */
  subject: string;
  /**
   * Why it needs attention, in the product's own vocabulary: a match's line is
   * built from `ANALYSIS_LABEL`, never from a second word for the same state.
   */
  detail: string;
  href: string;
}

export interface RosterProgress {
  /**
   * Players on the roster — the Roster page's own count, `playerCount()`.
   *
   * Coach-managed profiles included, because they are how most of these
   * rosters are built: a program can have a full squad, a season of matches
   * and not one login among them.
   */
  players: number;
  /**
   * Player invitations sent and not yet accepted.
   *
   * Every one of them, whether or not its link still works — the same set the
   * roster card lists and calls "N invites pending". See `rosterProgress()`
   * for why a lapsed invitation is still counted here.
   */
  outstanding: number;
  /**
   * Outstanding invites still live and falling due inside a week.
   *
   * **Live.** An invitation whose TTL has already run out is not in this count:
   * it is not expiring, it has expired, and the two are different facts. The
   * filter used to be `expiry <= horizon`, which a lapsed expiry satisfies as
   * readily as a near-future one.
   */
  expiringSoon: number;
  /**
   * Whole calendar days until the soonest of those, or null when there are
   * none. Never negative — `rosterProgress()` counts nothing that has already
   * expired, so 0 means the soonest one dies today and says so truthfully.
   */
  expiringInDays: number | null;
}

export interface TeamHomeData {
  usage: ProgramUsage;
  matches: TeamMatchRow[];
  /**
   * The strip — **zero to four tiles**, and empty is the day-zero answer rather
   * than a shape to draw placeholders from.
   *
   * The page renders nothing at all for an empty array: no skeleton, no zeroed
   * tiles. `0–0`, `—%`, `—%`, `0` on a coach's first morning teaches them the
   * product is broken, which is the one lesson a first visit must not carry.
   *
   * Any count in between is deliberate too: a figure with no rows behind it is
   * dropped rather than filled in. A program that has never decided a dual has
   * no dual record, and printing "0–0" for it would be inventing a season; a
   * program that has never uploaded video has no team first serve. Same
   * precedent as a match row whose side cannot be established going without
   * its `<ResultMark>`. `teamKpis()` lists every tile that can go missing and
   * exactly when — read it there, not here.
   */
  kpis: TeamKpiTile[];
  /**
   * The setup checklist's first card, already answered — see
   * `teamFirstReport()`. Null when nothing has been sent yet.
   *
   * Here rather than derived in the card from `matches`, because it is a
   * question about the whole program and `matches` is the six rows the list
   * renders. Same rule as the strip beside it: this loader reduces the season
   * to the answer, and hands a component the answer rather than a collection to
   * search.
   */
  firstReport: TeamFirstReport | null;
  roster: RosterProgress;
  /** Null when the program has nothing on the schedule from today onwards. */
  nextEvent: TeamNextEvent | null;
  /**
   * The right column's roster card, or null when there is nothing to say — see
   * `TeamRosterCard`. Staff read it; the page never renders the right column
   * for a player, whose `program_roster` line is their own and whose
   * `program_invites` policy returns them nothing anyway.
   */
  rosterCard: TeamRosterCard | null;
  /**
   * The right column's "Needs attention" list, and an empty array is the
   * ordinary case. Nothing renders for it — no empty card, no "all clear".
   */
  attention: TeamAlert[];
  /**
   * This week's dual, or null — and null is the common case. The card that
   * renders this renders nothing at all when it is null: no empty sheet, no
   * placeholder, no line explaining that there is no dual.
   */
  weekendDual: WeekendDual | null;
}

/**
 * What the row says about itself besides the names.
 *
 * The event first, then the round, because a coach scanning the list is looking
 * for a dual rather than for a quarter-final. When a match has neither, the
 * type is the only true thing left to say.
 */
function matchContext(row: {
  tournament_name: string | null;
  round: string | null;
  match_type: string | null;
}): string {
  const parts = [row.tournament_name, row.round].filter(
    (part): part is string => Boolean(part?.trim())
  );
  if (parts.length > 0) return parts.join(" · ");
  return row.match_type?.trim() || "Match";
}

/**
 * Which side of a match row is the program's — and `null` when nothing says.
 *
 * Team Home's rows are name-based: `player1_name vs player2_name`, with no
 * "us" anywhere in them. `<ResultMark>` draws a green check or a red cross, so
 * an answer guessed here shows a coach a win where they lost with nothing on
 * screen looking wrong. Two things establish the side; where neither does, the
 * row goes without a mark rather than with a coin flip.
 *
 * 1. **An id on this program's roster.** `program_roster_full.player_id` is
 *    documented as "the id their matches carry" (`roster-server.ts`), and it is
 *    what both writers of a program match put in `player1_id`: the upload
 *    wizard from the roster pick (`useUploadMatchWizard.ts` — "whose match this
 *    is, which in a team workspace is not the uploader"), and `recordResult`
 *    from the event entry's player (`lib/schedule/actions.ts`). An opponent
 *    cannot collide with it: opponent identities are written to
 *    `matches.opponent_player_id`, deliberately NOT to `player2_id`
 *    (`opponents-server.ts`), so a roster id in either column is one of ours.
 * 2. **The row is a line off this program's schedule.** `event_entry_id` says
 *    so, and what makes it evidence is a convention rather than a single
 *    writer — do not "verify" this clause by reading one function and stopping.
 *    **Two places write the column, and both write our side into `player1`:**
 *    - `recordResult` (`lib/schedule/actions.ts`) inserts `event_entry_id:
 *      entry.id` alongside `player1_name: ourLabel` / `player1_id:
 *      playerUserId`, having first refused an entry belonging to another
 *      program.
 *    - the upload wizard (`useUploadMatchWizard.ts:1130`) inserts
 *      `event_entry_id: preset?.entryId ?? null`, so the column is non-null
 *      exactly when the coach opened the wizard from a schedule preset — and
 *      that same preset supplies `playerName`/`playerUserId`, which
 *      `buildMatchData` puts in `player1_name`/`player1_id`. The roster pick a
 *      preset implies and the id `recordResult` would have written are the same
 *      person. (Its other branch fills a row that already carries the column
 *      rather than setting it, and writes `player1_name` the same way round.)
 *
 *    So the invariant is the convention `lib/schedule/entry-state.ts` reads the
 *    whole schedule under — a match tied to an entry has us in `player1` — not
 *    a property of one function. This clause is what covers a DOUBLES line,
 *    whose `player1_id` is deliberately null because two accounts do not fit
 *    one column. Should a third writer ever appear, it has to honour the same
 *    convention or this clause stops being true.
 *
 * Both clauses answer `player1` in every case they overlap on, which is the
 * point: they are two readings of one convention, not two rules. The id test
 * runs first because an id is evidence about THIS row, where the entry test is
 * evidence about how the row was written.
 */
function programSide(
  row: {
    player1_id: string | null;
    player2_id: string | null;
    event_entry_id: string | null;
  },
  rosterIds: ReadonlySet<string>
): "player1" | "player2" | null {
  if (row.player1_id && rosterIds.has(row.player1_id)) return "player1";
  if (row.player2_id && rosterIds.has(row.player2_id)) return "player2";
  if (row.event_entry_id) return "player1";
  return null;
}

/**
 * A match named our side first, and the flip that named it.
 *
 * **One rule, one place, because two spellings of it is the quiet failure.**
 * `programSide` decides WHICH side is ours; this decides what that means for
 * everything a row shows. The two consumers below need different parts of the
 * answer — the list rows want `swap` for `scoreSetsFrom` and `side` for
 * `matchOutcome` as well as the title, the checklist receipt wants the title
 * alone — but they must not each derive it. Names read one way and games the
 * other is the same wrong answer as a wrong outcome glyph, told more quietly,
 * and the receipt links to the very row it would be disagreeing with.
 *
 * With no side established nothing flips: the row keeps its stored order, and
 * callers that draw an outcome leave it null rather than guess. See
 * `programSide` for when that happens and why an empty slot is the honest
 * answer.
 */
function oursFirst(
  row: {
    player1_id: string | null;
    player2_id: string | null;
    event_entry_id: string | null;
    player1_name: string | null;
    player2_name: string | null;
  },
  rosterIds: ReadonlySet<string>
): {
  side: "player1" | "player2" | null;
  swap: boolean;
  title: string;
} {
  const side = programSide(row, rosterIds);
  const swap = side === "player2";
  const ourName = swap ? row.player2_name : row.player1_name;
  const theirName = swap ? row.player1_name : row.player2_name;
  return { side, swap, title: `${ourName} vs ${theirName}` };
}

/**
 * One discipline's lines, in position order, labelled the way the event page
 * labels them.
 *
 * `entry.slot ?? prefix + n` is `dual-detail.tsx`'s own fallback, kept so a
 * line missing its slot is called the same thing on both screens. `matches[0]`
 * is likewise the dual's shape rather than a shortcut: a dual line holds one
 * match, where a tournament entry holds a whole run.
 */
function dualLines(
  entries: EventEntry[],
  discipline: "singles" | "doubles",
  prefix: "S" | "D"
): DualSheetLine[] {
  return entries
    .filter((entry) => entry.discipline === discipline)
    .map((entry, index) => {
      const match = entry.matches[0] ?? null;
      // This row's own match where there is one. `entryState` is right only for
      // the line nobody has recorded yet, which has no match to ask.
      const state = match ? matchState(match) : entryState(entry);

      return {
        id: entry.id,
        slot: entry.slot ?? `${prefix}${index + 1}`,
        ours: entry.playerLabels.join(" / "),
        // The match's opponent where it was recorded — a lineup can be written
        // days before anyone knows who they are actually playing.
        theirs:
          match?.opponentLabels.join(" / ") || entry.opponentLabels.join(" / "),
        // No `swap`. See `DualSheetLine` — on an entry line our side is
        // `player1`, which is the convention the whole schedule is read under.
        sets: scoreSetsFrom(match?.score),
        won: match ? matchWon(match) : null,
        state,
        // A report exists only where analysis produced one. `matchState`
        // returns "ready" for exactly that — analysis ready AND video actually
        // sent — so a hand-scored line offers no link to a page of zeroes.
        reportId: state === "ready" && match ? match.id : null,
      };
    });
}

/**
 * The tally's two halves — and they add up to it.
 *
 * Both are `dualScore` over a subset, never a second counting rule: run over
 * the singles alone it returns the singles points, and over the doubles alone
 * it returns the one folded doubles point, so the two sum to `dualScore` over
 * the whole card by construction. Counting doubles COURTS here instead would
 * print "S 3–3 · D 1–2" beside a 4–3 that does not follow from it.
 */
function dualBreakdown(entries: EventEntry[]): {
  singles: { us: number; them: number };
  doubles: { us: number; them: number };
} {
  const singles = dualScore(
    entries.filter((entry) => entry.discipline === "singles")
  );
  const doubles = dualScore(
    entries.filter((entry) => entry.discipline === "doubles")
  );

  return {
    singles: { us: singles.us, them: singles.them },
    doubles: { us: doubles.us, them: doubles.them },
  };
}

/**
 * Which dual this week the sheet is about, or null.
 *
 * The next one first, then the one just played: on Thursday a coach is
 * preparing for Saturday, and on Sunday morning they are reading Saturday's
 * card. `events` must be ordered by start date ASCENDING — the caller reverses
 * the schedule read's newest-first list — so "first from today onwards" and
 * "the last one before that" are both reads off the front and back of the same
 * list.
 *
 * Exported for `tests/team-home-schedule-reads.spec.ts` only — the page reads
 * it through `getTeamHomeData` below, for the same reason `localDay` and
 * `weekBounds` are exported: which dual this is, is the thing worth pinning.
 */
export function weekendDualRow<T extends { kind: string; startsOn: string }>(
  events: T[],
  week: { start: string; end: string },
  today: string
): T | null {
  // Both ends tested here, and now that the list is the whole season there is
  // no query floor to lean on at all. There never should have been: the old
  // floor was on `ends_on`, and a dual's two dates are equal only because
  // `createDual` writes them that way — a row that ever disagreed would put
  // last week's dual under a card headed "this weekend". Dates are YYYY-MM-DD,
  // so a string comparison IS a date comparison.
  const duals = events.filter(
    (event) =>
      event.kind === "dual" &&
      event.startsOn >= week.start &&
      event.startsOn <= week.end
  );
  return duals.find((event) => event.startsOn >= today) ?? duals.at(-1) ?? null;
}

/**
 * The dual sheet, off the `EventDetail` the event page is built from.
 *
 * Synchronous, and that is the point: `detail` comes out of the schedule read
 * this page has already paid for, via `eventDetailFrom`. It used to call
 * `getEventDetail`, which is RLS-scoped and refuses another program's event —
 * both of which the read that produced `detail` has already done — at the cost
 * of reading the same three tables a second time in the same render.
 */
function buildWeekendDual(detail: EventDetail | null): WeekendDual | null {
  // A dual with no lines is not a sheet with nothing in it — it is not a sheet.
  // `createDual` rolls the event back if its lines fail to write, so this is a
  // shape the product does not produce; it renders nothing rather than a header
  // over an empty list.
  if (!detail || detail.entries.length === 0) return null;

  const { event, entries } = detail;
  const score = dualScore(entries);

  // What this dual can award: one point per singles court, plus the single
  // point the three doubles courts add up to. Read off the lines rather than
  // assumed to be seven, because a card can be shortened.
  const points =
    entries.filter((entry) => entry.discipline === "singles").length +
    (entries.some((entry) => entry.discipline === "doubles") ? 1 : 0);
  const clinchedBy =
    points === 0
      ? null
      : // Doubled rather than halved: a majority of an odd number of points is
        // not an integer, and `us > points / 2` invites a rounding argument
        // nobody should have to have about a dual score.
        score.us * 2 > points
        ? "us"
        : score.them * 2 > points
          ? "them"
          : null;

  return {
    id: event.id,
    opponent: event.name,
    site: event.site,
    surface: event.surface,
    startsOn: event.startsOn,
    lines: [
      ...dualLines(entries, "singles", "S"),
      ...dualLines(entries, "doubles", "D"),
    ],
    us: score.us,
    them: score.them,
    decided: score.decided,
    playedLines: entries.filter(entryPlayed).length,
    ...dualBreakdown(entries),
    clinchedBy,
  };
}

/**
 * How many players are on this roster — the page's one answer, used twice.
 *
 * `program_roster_full` rows carrying the player role, which is exactly the
 * predicate `/dashboard/team/roster` counts its "8 players" with
 * (`roster/page.tsx` — `roster.members.filter((m) => m.role === "player")`).
 * Both readers on this page go through here so the checklist's receipt and the
 * right column's card cannot start reporting different squads.
 *
 * **Staff are excluded and stay excluded.** The RPC returns coach and staff
 * seats too — they are kept in `rosterIds` because a coach who uploads without
 * a lineup preset lands their own id on the match — but a program with four
 * coaches and no players has no roster yet, and counting the coaching staff
 * into it would report a program as set up on the strength of the people who
 * set it up.
 */
function playerCount(rosterRows: { role: string }[]): number {
  return rosterRows.filter((row) => row.role === "player").length;
}

/**
 * The roster, as the checklist reads it: who is on it, and who is still coming.
 *
 * **Counted off `program_roster_full`, not off `program_members`.** The seat
 * list cannot answer this question: a coach-managed player is a
 * `program_players` row with no login and therefore no seat, and a program can
 * be built entirely out of them — squad, season and all. Counting seats told
 * such a coach they had nobody, and the "Your team" card went on asking them to
 * send invitations for a team they had already finished building. The same rows
 * `rosterIds` is reduced from, so this is not a second read and not a second
 * answer to who is on this team.
 *
 * `outstanding` counts PLAYER invitations only. Staff invites are a different
 * question with a different answer, and merging them made "6 of 10 joined" mean
 * nothing in particular.
 *
 * **A lapsed invitation stays in `outstanding` and leaves `expiringSoon`,** and
 * that split is the point rather than an oversight. The two counts answer to
 * two different surfaces, and each has to say what its surface already says:
 *
 * - `outstanding` is the roster card's list. That card, and the Roster page it
 *   shares `roster-vocabulary.tsx` with, draw every unaccepted invitation the
 *   same way — dashed ring, "Invited Aug 4 as player", Resend beside it — and
 *   count them all into "N invites pending". Neither screen has a word for an
 *   expired invitation; the only place in the product that does is
 *   `/join/[token]`, which says it to the invitee. Dropping a lapsed row from
 *   this count would leave the card listing a person the checklist had stopped
 *   counting.
 * - `expiringSoon` is the alert list, which is explicitly the *urgent half* —
 *   the card already says "there are invites out", and the alert exists for
 *   when the clock has become the point. A dead invitation has no clock left,
 *   so it has nothing to say there.
 *
 * The alternative was a second alert kind announcing the expiry. It was not
 * taken because it would put "expired" on a page whose roster card calls the
 * same row "pending", and a coach reading both has to work out whether they are
 * two invitations. Teaching the roster its first word for "expired" means
 * teaching it to `roster-vocabulary.tsx`, which Team Home AND
 * `/dashboard/team/roster` render from — a design round on two screens, not a
 * countdown fix. Until that round happens the honest arrangement is the one
 * below: one voice, the card's, and no alert claiming a future for a link that
 * no longer opens.
 *
 * **Exported only so that `tests/team-roster-progress.spec.ts` can call it** —
 * the same arrangement, and the same reasoning, as `teamKpis` below: it takes
 * this loader's own row shapes, it should acquire no caller outside this file,
 * and the spec can import the module safely because nothing here runs at module
 * scope.
 */
export function rosterProgress(
  rosterRows: { role: string }[],
  invites: { role: string; createdAt: string }[],
  now: number
): RosterProgress {
  const players = playerCount(rosterRows);
  const outstanding = invites.filter((invite) => invite.role === "player");

  // `created_at + INVITE_TTL_HOURS` rather than a second read of
  // `program_invites.expires_at`, and it is not an approximation of it:
  // `create_program_invite` is the only writer, `team-actions.ts` passes it
  // `now + INVITE_TTL_HOURS`, and the upsert that a resend runs through sets
  // `created_at = now()` alongside the new `expires_at`. The two columns move
  // together, so the row this loader already has in hand answers the question.
  const ttlMs = INVITE_TTL_HOURS * 60 * 60 * 1000;
  const horizon = now + EXPIRING_SOON_DAYS * DAY_MS;

  // `expiry > now` is the half of this that was missing. A lapsed invitation
  // satisfies `expiry <= horizon` exactly as well as a near-future one, so one
  // that died last month was counted as expiring — and the countdown below,
  // handed a negative, clamped it to 0 and printed "One invite expires today"
  // every morning for the rest of the season. `>` and not `>=` because that is
  // where the database draws the line: `accept_program_invite` refuses on
  // `expires_at <= now()` — and `resolveJoinState` shows the invitee "That
  // invitation has expired" on the same comparison — so an invitation reaching
  // its instant is already dead, not expiring.
  const soon = outstanding
    .map((invite) => new Date(invite.createdAt).getTime() + ttlMs)
    .filter(
      (expiry) => Number.isFinite(expiry) && expiry > now && expiry <= horizon
    )
    .sort((a, b) => a - b);

  return {
    players,
    outstanding: outstanding.length,
    expiringSoon: soon.length,
    expiringInDays: soon.length > 0 ? wholeDaysUntil(soon[0], now) : null,
  };
}

/**
 * Whole days from `now` to `expiry`, counted in calendar days rather than in
 * elapsed 24-hour blocks.
 *
 * The alert this feeds spells 0 "today" and 1 "tomorrow", and those two words
 * are about the calendar, not about a duration. Elapsed thirds of a day put an
 * invitation dying at 10am on Tuesday inside "today" when a coach reads the
 * page at 11pm on Monday — eleven hours away, and on a day that is not today.
 * Anchoring both ends to their day in `PROGRAM_TIME_ZONE` makes the two words
 * mean what they say.
 *
 * Both anchors are UTC midnights built from a zoned calendar day, so the
 * subtraction never walks through a DST transition — the same construction, and
 * the same reason, as `weekBounds`.
 *
 * The caller has already dropped everything at or before `now`, so this cannot
 * return a negative and there is nothing to clamp: `expiry > now` puts the
 * expiry on `now`'s day or a later one.
 */
function wholeDaysUntil(expiry: number, now: number): number {
  const midnight = (ms: number) =>
    Date.parse(`${localDay(new Date(ms), PROGRAM_TIME_ZONE)}T00:00:00.000Z`);
  return Math.round((midnight(expiry) - midnight(now)) / DAY_MS);
}

/**
 * The roster card, or null when there is nothing on it to say.
 *
 * Built entirely from rows this loader has already fetched — `getTeamSettings`
 * for the open invitations, and the `program_roster_full` rows the match
 * attribution already needed — so the card costs no query of its own. The
 * invitations are mapped exactly as `getRosterData` maps them, into the same
 * `RosterInvite`, because the Roster page is where these rows have their
 * vocabulary and this is that same list seen from the home page.
 */
function rosterCard(
  invites: TeamInvite[],
  rosterRows: {
    role: string;
    display_name: string | null;
    email: string | null;
    claimed_at: string | null;
  }[]
): TeamRosterCard | null {
  // The Roster page's own count, off the same RPC and the same predicate — see
  // `TeamRosterCard.players` for why this and the checklist's receipt have to
  // be one number rather than two.
  const players = playerCount(rosterRows);
  const claimedToday = claimedTodayNames(rosterRows);
  const open: RosterInvite[] = invites.map((invite) => ({
    id: invite.id,
    email: invite.email,
    role: invite.role,
    invitedOn: shortDate(invite.createdAt),
  }));

  // Nobody, nothing outstanding, no news: the card is absent rather than empty.
  if (players === 0 && open.length === 0 && claimedToday.length === 0) {
    return null;
  }

  return { players, invites: open, claimedToday };
}

/**
 * How long a job may be expected to change before the page says something.
 *
 * The one full-length job on record turned round in 75 minutes for 86 minutes
 * of video (`docs/ui-revamp-guardrails.md` §1), and the monthly cap is two
 * hours of billable footage, so nothing legitimate is much longer than that.
 * Six hours is comfortably past both — late enough that a coach reading this
 * row is being told something true, rather than made anxious about a job that
 * is simply running.
 */
const SLOW_ANALYSIS_HOURS = 6;

/**
 * Whole hours since a job row was created, or null when there is no clock.
 *
 * An imported match never had a job and so has no `startedAt`; inventing one
 * would put a fabricated elapsed time beside a real status, which is what
 * `first-steps.tsx`'s `Elapsed` refuses for the same reason.
 */
function hoursSince(
  startedAt: string | undefined,
  nowMs: number
): number | null {
  if (!startedAt) return null;
  const started = Date.parse(startedAt);
  if (!Number.isFinite(started)) return null;
  return Math.floor((nowMs - started) / (60 * 60 * 1000));
}

/**
 * What is waiting for somebody, in the order a coach would deal with it.
 *
 * Broken first, then slow, then the clock on the invitations — three facts this
 * loader already holds, and nothing else. See `TeamAlert` for what is
 * deliberately absent from it.
 *
 * **Exported only so that `tests/team-roster-progress.spec.ts` can call it** —
 * the same arrangement, and the same reasoning, as `rosterProgress` above. The
 * invite row it builds is the ONLY reader of `expiringSoon` and
 * `expiringInDays`, so the countdown's contract cannot be tested anywhere else.
 */
export function teamAttention(
  matches: TeamMatchRow[],
  roster: RosterProgress,
  nowMs: number
): TeamAlert[] {
  const alerts: TeamAlert[] = [];

  for (const match of matches) {
    if (isAnalysisFailed(match.status)) {
      alerts.push({
        id: `failed-${match.id}`,
        kind: "match-failed",
        subject: match.title,
        // The row's own word for its state — `ANALYSIS_LABEL`, the same one the
        // list below prints beside its dot.
        detail: match.label,
        href: `/dashboard/matches/${match.id}`,
      });
      continue;
    }

    // `isLiveUpdating`, not `isInFlight`: a `processed` match is waiting on
    // Phase 2 shipping rather than on anything running, and counting it here
    // would report every analysed match in the program as overdue. This is the
    // set where a database update is genuinely coming — so one that has not
    // arrived in six hours is a fact worth a row.
    const hours = hoursSince(match.startedAt, nowMs);
    if (
      isLiveUpdating(match.status) &&
      hours !== null &&
      hours >= SLOW_ANALYSIS_HOURS
    ) {
      alerts.push({
        id: `slow-${match.id}`,
        kind: "match-slow",
        subject: match.title,
        // The status word and how long it has been true. "Uploaded · 8h" is a
        // job whose auto-submit never fired; "Processing · 9h" is one the
        // vendor has not come back on. Both are the row's own label — never a
        // second word for the state — with the clock beside it.
        detail: `${match.label} · ${hours}h`,
        href: `/dashboard/matches/${match.id}`,
      });
    }
  }

  // The urgent half of the invitations, and only that half. The roster card
  // above lists every open one with a Resend beside it, so "there are invites
  // out" is already on screen; this row appears when the clock has become the
  // point, which is what an alert list is for. It counts PLAYER invites —
  // `rosterProgress()` is what holds the expiry, and staff invitations are a
  // different question with a different answer.
  //
  // Only invitations that are still LIVE reach this. One whose TTL has run out
  // has no clock to be the point, so it stays on the roster card with its
  // Resend and says nothing here — see `rosterProgress()` for why the alert
  // list does not get its own word for it. That is what keeps every `when`
  // below in the future tense: `expiringInDays` cannot be negative, and 0 is a
  // calendar day on which the invitation really does die.
  if (roster.expiringSoon > 0 && roster.expiringInDays !== null) {
    const when =
      roster.expiringInDays === 0
        ? "today"
        : roster.expiringInDays === 1
          ? "tomorrow"
          : `in ${roster.expiringInDays} days`;

    alerts.push({
      id: "invites-expiring",
      kind: "invite-expiring",
      subject:
        roster.expiringSoon === 1
          ? `One invite expires ${when}`
          : `${roster.expiringSoon} invites expire ${when}`,
      // Round 44 sends this at Roster, where the dashed rows and their Resend
      // live — the same instruction the line this replaces carried.
      detail: "Resend from Roster",
      href: "/dashboard/team/roster",
    });
  }

  return alerts;
}

/**
 * Every match the program has recorded, as the strip reads it.
 *
 * Deliberately a SECOND read rather than a widening of the list's six-row
 * query. The list's ordering — `date` descending, PostgreSQL's own null
 * placement, `limit 6` — is what T8's rows are built on, and re-planning that
 * query to serve a different question is how a committed surface changes
 * quietly. This one asks for the whole history and orders it for itself.
 *
 * The three id columns are here for the same reason they are on the list's
 * row: they are the only evidence of which side of a match is the program's.
 * See `programSide()`.
 *
 * Exported with `teamKpis` below, so its spec builds fixtures in the shape the
 * `select()` actually returns rather than a hand-typed approximation of it.
 */
export interface DbSeasonMatch {
  id: string;
  /**
   * Both names, because `teamFirstReport()` prints one of these rows and the
   * receipt it prints names the players — the same "ours first" title the
   * matches list gives the row. Two `text NOT NULL` columns on a read that was
   * already happening; the alternative was a second query for one match.
   */
  player1_name: string;
  player2_name: string;
  player1_id: string | null;
  player2_id: string | null;
  event_entry_id: string | null;
  score: MatchScore | null;
  date: string;
  source_provider: string | null;
  verified: boolean | null;
}

/** One side of one match, from `match_stats_with_percentages`. */
export interface DbTeamStat {
  match_id: string;
  is_player1: boolean;
  /** A `numeric` column: PostgREST hands it over as a string. */
  first_serve_pct: string | number | null;
}

/**
 * What state a match row is in — a job's, or the state implied by having no job.
 *
 * Two callers now ask (the list's rows and the strip's counts), and they have
 * to agree: a match the list marks "Imported" and the strip does not count as
 * analyzed would be two answers about one row on one screen. The fallbacks are
 * the shared ones — `importedAnalysis` for a file that arrived complete,
 * `manualAnalysis` for a score somebody typed.
 */
function analysisOf(
  row: { id: string; source_provider: string | null; verified: boolean | null },
  jobs: Map<string, MatchAnalysis>
): MatchAnalysis {
  return (
    jobs.get(row.id) ??
    (row.source_provider
      ? importedAnalysis(row.source_provider, Boolean(row.verified))
      : manualAnalysis())
  );
}

/**
 * One row of the matches list's read, in the shape the `select()` returns.
 *
 * The three id columns are not display data — they are the only evidence of
 * which side is the program's. See `programSide()`.
 */
/**
 * The season row plus the three columns only `matchContext` prints.
 *
 * Written as an extension rather than a second field list on purpose. The
 * recent-matches select IS the season select plus these three, so two
 * independent declarations of the same table's columns would be free to drift
 * — and the first draft of this one already had, declaring `player1_name` and
 * `player2_name` nullable where `DbSeasonMatch` documents them as the `text
 * NOT NULL` columns they are. Extending makes that impossible and leaves the
 * id columns' warning stated once, on `DbSeasonMatch`, where it belongs.
 */
export interface DbRecentMatch extends DbSeasonMatch {
  tournament_name: string | null;
  round: string | null;
  match_type: string | null;
}

/**
 * One match, as the page's list renders it.
 *
 * Lifted out of `getTeamHomeData` so the row a coach actually sees can be
 * asserted on: `won` here IS the outcome mark, and it is the one thing on the
 * row that fails silently — a row whose side nothing established still prints
 * correct names, a real date and a real score, with only an empty glyph slot
 * to say that the program was never attributed to it.
 *
 * Both halves of the flip travel together, and they have to: names read one
 * way and games the other is the same wrong answer as a wrong glyph, told more
 * quietly. `oursFirst` is where that rule lives — the checklist receipt reads
 * the same call, so the two cannot drift. With no side established nothing
 * flips: the row keeps the stored order, and `won` stays null so no mark is
 * drawn.
 */
export function teamMatchRow(
  row: DbRecentMatch,
  jobs: Map<string, MatchAnalysis>,
  rosterIds: ReadonlySet<string>
): TeamMatchRow {
  const analysis = analysisOf(row, jobs);
  const { side, swap, title } = oursFirst(row, rosterIds);
  const score = row.score;

  return {
    id: row.id,
    title,
    context: matchContext(row),
    status: analysis.status,
    label: ANALYSIS_LABEL[analysis.status],
    date: shortDate(row.date),
    // Sets counted, never a stored outcome: `matches.result` holds a CONTEXT
    // string ("Final Score"), so `matchOutcome` is the shared rule the matches
    // list, the schedule and every player profile already ask.
    sets: scoreSetsFrom(score, { swap }),
    won: side === null ? null : matchOutcome(score, side === "player1"),
    startedAt: analysis.startedAt,
  };
}

/**
 * The checklist's first card, decided here rather than in the card.
 *
 * Null is "nothing has been sent yet" — the card asks for a match. Otherwise
 * one of two receipts, each carrying only what it prints:
 *
 * - **`done`** names the match whose report came back, in the matches list's
 *   own words: our side first, its short date, and the id the "View report"
 *   link points at.
 * - **`progress`** carries the state of the one match on its way, because the
 *   card prints a `StatusChip` for it and — while something is actually
 *   running — how long it has been going. `stalled` is derived from `status`
 *   in the card, where the copy that turns on it lives.
 *
 * A discriminated union rather than two nullable fields, because "a report is
 * back AND one is on its way" is not a state the card can render: it shows one
 * receipt, and `done` outranks `progress`. Two fields would let a caller build
 * the pair the card has no branch for.
 */
export type TeamFirstReport =
  | { state: "done"; id: string; title: string; date: string }
  | { state: "progress"; status: AnalysisStatus; startedAt?: string };

/**
 * Has a first report ever come back for this program, and is one on its way?
 *
 * **Both are season questions**, and they were being asked of the six rows the
 * matches list renders. Six recent rows cannot answer "ever": a program whose
 * only analysed match is the seventh most recent was shown "Send your first
 * match", asking a coach to redo work they had already done — and the older a
 * program's history gets, the further out of that window its first report
 * falls. So this reads the season rows the strip already has, with `analysisOf`
 * and the same two predicates the matches list and the match page ask.
 *
 * Newest first, as the read hands them over, so the receipt names the most
 * recent report — which is the match the six-row version named too whenever it
 * could see one at all.
 *
 * **A FAILED match is neither**, and falls through to null. That leaves the
 * card active, which is right: after a failure the next thing to do really is
 * to send a match, and the row in the list below says what happened to the last
 * one.
 *
 * One pass, not two `find`s: `analysisOf` resolves a row's state and there is
 * no reason to resolve any row's twice. `done` short-circuits wherever it is
 * found, because it outranks an in-flight match however recent that one is.
 */
export function teamFirstReport(
  rows: DbSeasonMatch[],
  jobs: Map<string, MatchAnalysis>,
  rosterIds: ReadonlySet<string>
): TeamFirstReport | null {
  let inFlight: TeamFirstReport | null = null;

  for (const row of rows) {
    const analysis = analysisOf(row, jobs);

    if (isAnalysisReady(analysis.status)) {
      // Our side named first, by the same call the list's rows are named by —
      // the receipt and the row it points at are one match, on one page, read
      // one way, and now by construction rather than by transcription.
      return {
        state: "done",
        id: row.id,
        title: oursFirst(row, rosterIds).title,
        date: shortDate(row.date),
      };
    }

    if (inFlight === null && isInFlight(analysis.status)) {
      inFlight = {
        state: "progress",
        status: analysis.status,
        startedAt: analysis.startedAt,
      };
    }
  }

  return inFlight;
}

/**
 * The strip's figures — up to four of them, and sometimes none.
 *
 * **None until a match has actually been analyzed.** That is the gate round 45
 * states as "never a skeleton strip on day zero", and it is `isAnalysisReady`,
 * the same predicate the greeting line above counts with and the matches list
 * offers a report on. A program with a schedule full of hand-scored duals and
 * no analysis has plenty of rows and nothing this strip was built to say.
 *
 * **Past that gate, every tile is conditional but one.** A tile is pushed only
 * when rows exist behind it, so a figure that cannot be computed honestly is
 * ABSENT — never `0–0`, never `—%`, never a zero standing in for a number
 * nobody has earned yet. Same rule as a match row whose side cannot be
 * established going without its outcome glyph: silence beats a plausible wrong
 * answer. Which tile can go missing, and exactly when:
 *
 * - **`dual-record`** — absent until some dual has a DECIDED team score.
 *   That covers three separate cases: no dual played; a dual played but not
 *   finished (`teamScore` is null until every line is in); and a dual that
 *   ended level, which belongs in neither column. Present from the first dual
 *   the program wins or loses.
 * - **`sets-won`** — absent while no match this program can be attributed to
 *   carries a readable set score: `programSide` null on every row (nobody on
 *   the roster in either id column and no `event_entry_id`), or `setTally`
 *   null / every set level. Present from the first attributable match with a
 *   set somebody took.
 * - **`first-serve`** — absent while no attributable match has a
 *   `first_serve_pct` row in `match_stats_with_percentages`. A program
 *   importing scores without video sits here indefinitely, and that is the
 *   correct answer rather than a `0%` team serve. Present from the first
 *   attributable match that measured it.
 * - **`matches-analyzed`** — never absent. It is the count the day-zero gate
 *   is itself drawn from, so past that gate it is at least 1 by construction.
 *
 * So the strip renders one, two, three or four tiles and the component lays out
 * however many arrive. The two shapes worth picturing: a program's first
 * analyzed upload, before any dual is decided, gets `sets-won` +
 * `first-serve` + `matches-analyzed`; a program importing scores without video
 * gets everything but `first-serve`.
 *
 * Nothing here is a new source of truth:
 * - **Dual record** is `teamScore` off `scheduleRowsFrom()` — the very mapping
 *   `/dashboard/team/schedule` renders its rows from — which is `dualScore`
 *   over the lines and is present only once every line is in. The season
 *   aggregate of the rule the dual sheet above prints, not a second one.
 * - **Sets won** counts games with `setTally`, the function `matchOutcome`
 *   itself now reads, and orients the count with `programSide` — never a
 *   second answer to which side is ours.
 * - **Team first serve** reads `match_stats_with_percentages`, keyed by
 *   `statKey(match_id, is_player1)` exactly as the roster page keys it, and
 *   `is_player1` is matched against the side `programSide` established.
 * - **Matches analyzed** is `isAnalysisReady` over the same rows.
 *
 * Both percentage tiles are means of PER-MATCH percentages, via
 * `meanOfPresent` — the app's established rule for aggregating this view, and
 * the one that keeps an unmeasured match out of the average instead of
 * entering it as a zero.
 *
 * It also makes the headline the mean of the series the sparkline draws. That
 * only holds while the tile makes ONE window's worth of claims, and for a
 * while it did not: `seriesTile` drew a trailing slice of the series it was
 * handed, so the headline averaged a season, the change split that season in
 * half, and the line showed the last few weeks — three answers, three
 * stretches of calendar, one tile. The array passed below is now the array
 * drawn, so the headline is the mean of the line and the change is the line's
 * halves, and none of the three can point a different way from the others. If
 * this ever starts averaging over a window, `seriesTile` has to be handed that
 * same window rather than the whole season.
 *
 * **Exported only so that `tests/team-kpi.spec.ts` can call it.** It has no
 * caller outside this file and should not acquire one — it takes this loader's
 * private row shapes. It is exported here rather than moved next to the
 * thresholds in `lib/data/team-kpi.ts` because it could not travel alone:
 * `programSide` and `analysisOf` are the two refusals it is made of, and both
 * are read by the match rows below as well, so moving it would carry a
 * team-home-wide attribution rule into a file named for one strip. The spec
 * therefore imports this module, Supabase client and all — which is safe
 * because nothing here runs at module scope: `createClient()` is called inside
 * `getTeamHomeData`, and `teamKpis` itself performs no I/O. Should that ever
 * stop being true, move the function and its two refusals out together rather
 * than giving the test a copy of the logic.
 */
export function teamKpis(
  rows: DbSeasonMatch[],
  jobs: Map<string, MatchAnalysis>,
  stats: DbTeamStat[],
  schedule: ScheduleRow[],
  rosterIds: ReadonlySet<string>
): TeamKpiTile[] {
  // Oldest first. The read arrives newest-first, like the list's, and every
  // series below is chronological by definition — a sparkline drawn backwards
  // is a trend reported in reverse.
  const chronological = [...rows].reverse();

  const analyzed = chronological.filter((row) =>
    isAnalysisReady(analysisOf(row, jobs).status)
  );
  if (analyzed.length === 0) return [];

  const tiles: TeamKpiTile[] = [];

  // A dual that ended level is in neither column and so is in no sample: it is
  // not a win, not a loss, and counting it under a "9–4" would make the record
  // stop adding up to the number of duals beside it. A seven-point card cannot
  // tie; a shortened one can.
  const decisiveDuals = schedule
    .filter((row) => row.kind === "dual")
    .map((row) => ({ startsOn: row.startsOn, score: row.teamScore }))
    .filter(
      (row): row is { startsOn: string; score: { us: number; them: number } } =>
        row.score !== null && row.score.us !== row.score.them
    );
  if (decisiveDuals.length > 0) {
    const wins = decisiveDuals.filter((row) => row.score.us > row.score.them);
    tiles.push(
      countTile(
        "dual-record",
        "Dual record",
        "dual",
        `${wins.length}–${decisiveDuals.length - wins.length}`,
        decisiveDuals.map((row) => row.startsOn)
      )
    );
  }

  const setsWon: TeamKpiObservation[] = [];
  const firstServe: TeamKpiObservation[] = [];

  const serveBySide = new Map<string, number | null>();
  for (const stat of stats) {
    serveBySide.set(
      statKey(stat.match_id, stat.is_player1),
      pct(stat.first_serve_pct)
    );
  }

  for (const row of chronological) {
    // No side, no figure. A row nothing attributes to this program contributes
    // to neither average rather than contributing the stored order's guess —
    // the same refusal the row itself makes when it draws no outcome mark.
    const side = programSide(row, rosterIds);
    if (side === null) continue;

    const sets = setTally(row.score);
    const setsPlayed = sets ? sets.player1 + sets.player2 : 0;
    if (sets && setsPlayed > 0) {
      const ours = side === "player1" ? sets.player1 : sets.player2;
      setsWon.push({ value: (ours / setsPlayed) * 100, date: row.date });
    }

    const serve = serveBySide.get(statKey(row.id, side === "player1"));
    // `null` is a match that did not measure it, and it is dropped rather than
    // averaged as a zero — `lib/data/aggregate.ts` exists for that distinction.
    if (serve !== null && serve !== undefined) {
      firstServe.push({ value: serve, date: row.date });
    }
  }

  const setsMean = meanOfPresent(setsWon.map((observation) => observation.value));
  if (setsMean !== null) {
    tiles.push(
      seriesTile("sets-won", "Sets won", "match", `${Math.round(setsMean)}%`, setsWon)
    );
  }

  const serveMean = meanOfPresent(
    firstServe.map((observation) => observation.value)
  );
  if (serveMean !== null) {
    tiles.push(
      seriesTile(
        "first-serve",
        "Team 1st serve",
        "match",
        `${Math.round(serveMean)}%`,
        firstServe
      )
    );
  }

  tiles.push(
    countTile(
      "matches-analyzed",
      "Matches analyzed",
      "match",
      `${analyzed.length}`,
      analyzed.map((row) => row.date)
    )
  );

  return tiles;
}

export async function getTeamHomeData(
  programId: string,
  billingMonth: string
): Promise<TeamHomeData> {
  const supabase = await createClient();

  // One clock AND one zone for the whole read. The greeting, the schedule
  // window, the dual sheet and the invite expiry below all have to agree about
  // what day it is: a request that straddles midnight would otherwise answer
  // two different questions, and a day read in one zone against a week read in
  // another would put "this weekend" outside "this week". `now` is the single
  // instant, `PROGRAM_TIME_ZONE` the single zone it is read in — neither is
  // taken from the process.
  const now = new Date();
  const today = localDay(now, PROGRAM_TIME_ZONE);
  const week = weekBounds(now, PROGRAM_TIME_ZONE);

  const [
    usage,
    team,
    { data: rows },
    { data: rosterRows },
    { data: seasonRows },
    programSchedule,
  ] = await Promise.all([
      getProgramUsage(programId, billingMonth),
      getTeamSettings(programId),
      supabase
        .from("matches")
        // `score` carries the games AND both tiebreak arrays, which is what lets
        // the row print "6-7³" rather than a set that looks decided 7-6 the same
        // as one decided 7-5. The three id columns are not display data: they are
        // the only evidence of which side is the program's — see `programSide()`.
        .select(
          "id, player1_id, player2_id, event_entry_id, player1_name, player2_name, score, tournament_name, round, date, match_type, source_provider, verified"
        )
        .eq("program_id", programId)
        .order("date", { ascending: false })
        .limit(RECENT_MATCH_LIMIT),
      // Every id that means "us" on a match row. The same SECURITY DEFINER
      // function Roster and the lineup builder read (`roster-server.ts`,
      // `team-roster-server.ts`) — not a second answer to who is on this team,
      // and the only one that includes a coach-managed player, whose profile id
      // is precisely what their matches carry. Staff seats come back from it too
      // and are kept: a coach uploading without a schedule preset lands their own
      // user id in `player1_id`, and that is still our side of the net.
      supabase.rpc("program_roster_full", { p_program_id: programId }),
      // The season read: every match the program has recorded, not the six the
      // list shows. Six rows cannot answer "sets won" or "matches analyzed" —
      // a strip built from the page's most recent handful would report a season
      // it never looked at. Nor can they answer the checklist's "has a first
      // report ever come back?", which is why `teamFirstReport()` reads this
      // too and why the names are in the select: it prints one of these rows.
      //
      // Unbounded on purpose, and precedented: `team-roster-server.ts` reads
      // exactly this way for the same reason, because every per-player
      // aggregate on the roster is over the whole history too. `nullsFirst:
      // false` is not a detail — Postgres puts NULLs FIRST on a DESC sort, and
      // an undated row taking the front of a chronological reversal would be
      // reported as the oldest match of the season.
      supabase
        .from("matches")
        .select(
          "id, player1_name, player2_name, player1_id, player2_id, event_entry_id, score, date, source_provider, verified"
        )
        .eq("program_id", programId)
        .order("date", { ascending: false, nullsFirst: false }),
      // The schedule, through the schedule's own loader, and the page's ONLY
      // read of `program_events`. Three questions come off this one call: the
      // dual record in the KPI strip, the next event on the checklist card, and
      // this week's dual sheet. `dualScore` over the lines is what the sheet
      // prints and what the schedule list prints; a season record assembled
      // from a second query set would be a fifth place that decides who won a
      // dual, and a next event read separately would be a second ordering of
      // `program_events` that has to agree with this one.
      //
      // It costs its own round trips — this is the one card on the page that
      // reads the whole season — and it is `cache()`d on the read itself, so a
      // later reader on the same request pays nothing.
      getProgramSchedule(programId),
    ]);

  const season = (seasonRows ?? []) as DbSeasonMatch[];
  const seasonIds = season.map((row) => row.id);
  // One analysis read for both consumers. The list's six rows are a subset of
  // the season read, but the union is taken rather than assumed: two queries
  // against a table that can be written between them is not somewhere to save
  // a `Set`.
  const analysisIds = Array.from(
    new Set([...(rows ?? []).map((row) => row.id as string), ...seasonIds])
  );

  const [jobs, stats] = await Promise.all([
    // `reap: true` is deliberately NOT passed. It is a write, and it belongs to
    // the two surfaces that draw a progress bar big enough for a frozen one to
    // mislead — the matches list and match detail. This page shows a dot.
    loadMatchAnalysis(supabase, analysisIds),
    // The same view, the same three columns and the same natural key the
    // roster page reads (`team-roster-server.ts`) — including how it decides
    // which side of a match a stat row belongs to. A second way to attribute a
    // statistic to a side is a serve percentage printed under the wrong
    // player's name, with nothing on screen looking wrong.
    (async (): Promise<DbTeamStat[]> => {
      if (seasonIds.length === 0) return [];
      const { data } = await supabase
        .from("match_stats_with_percentages")
        .select("match_id, is_player1, first_serve_pct")
        .in("match_id", seasonIds);
      return (data ?? []) as DbTeamStat[];
    })(),
  ]);

  // One RPC, four questions off it: which ids mean "us" on a match row, how
  // many players the roster holds, how far along the setup checklist that
  // makes the program, and who claimed a profile today. Neither the roster
  // card nor the checklist adds a read of its own.
  const people = (rosterRows ?? []) as {
    player_id: string | null;
    // Not display data and not redundant with `player_id`: for a CLAIMED
    // player the two differ, and a match recorded before they claimed carries
    // this one. See `rosterMatchIds`.
    user_id: string | null;
    role: string;
    display_name: string | null;
    email: string | null;
    claimed_at: string | null;
  }[];

  // Both ids the RPC returns per person, through the one rule the Roster page
  // resolves by (`lib/data/roster-ids.ts`). This was `player_id` alone, and the
  // miss was invisible on every seat it was ever read against — staff and
  // unclaimed players carry the same value in both columns. A claimed player's
  // pre-claim match was the one row it dropped: correct names, a real score,
  // and no outcome mark, missing from the sets-won and first-serve tiles.
  const rosterIds = rosterMatchIds(people);

  const matches: TeamMatchRow[] = ((rows ?? []) as DbRecentMatch[]).map((row) =>
    teamMatchRow(row, jobs, rosterIds)
  );

  // `readSchedule` returns events newest first, which is the order the schedule
  // page renders them in. Both questions below are asked forwards in time, so
  // they are asked of that one list reversed — never of a second query with an
  // ordering of its own to keep in step.
  const upcoming = [...programSchedule.events].reverse();

  // The schedule page's own rows, off the schedule page's own mapping. The KPI
  // strip's dual record is `teamScore` on these, so "did we win that dual" is
  // one answer read twice rather than two answers that can drift.
  const scheduleRows = scheduleRowsFrom(programSchedule);

  // Still "the soonest event the program has not finished yet". `ends_on`, not
  // `starts_on`: a tournament that began on Thursday is still the next thing on
  // the schedule on Saturday morning.
  const nextEventRow = upcoming.find((event) => event.endsOn >= today);

  // No round trip left in this card: the dual, if there is one, is already in
  // `programSchedule` with its lines under it.
  const dualRow = weekendDualRow(upcoming, week, today);
  const weekendDual = dualRow
    ? buildWeekendDual(eventDetailFrom(programSchedule, dualRow.id))
    : null;

  // `people`, not `team?.members`: the seat list has no row for a
  // coach-managed player, so a hand-built squad counted zero here and the
  // checklist kept asking for invitations that were not needed. These are the
  // same rows `rosterIds` and the roster card above are built from — one read,
  // one answer to who is on this team.
  //
  // `now`, not a second `Date.now()`: the invite clock, the greeting, the
  // schedule window and the dual sheet are all answered on this read's one
  // clock, and the alert list below reads the expiry this returns.
  const progress = rosterProgress(people, team?.invites ?? [], now.getTime());

  return {
    usage,
    matches,
    kpis: teamKpis(season, jobs, stats, scheduleRows, rosterIds),
    // Same three inputs the strip is built from, and deliberately the same
    // `jobs` map: the checklist saying a report is back while the strip counts
    // no analyzed match would be two answers about one program, on one screen.
    firstReport: teamFirstReport(season, jobs, rosterIds),
    roster: progress,
    nextEvent: nextEventRow
      ? {
          id: nextEventRow.id,
          name: nextEventRow.name,
          // Already an `EventKind` off the schedule loader, which narrows the
          // column once for every surface — no second string test here.
          kind: nextEventRow.kind,
          startsOn: nextEventRow.startsOn,
        }
      : null,
    rosterCard: rosterCard(team?.invites ?? [], people),
    attention: teamAttention(matches, progress, now.getTime()),
    weekendDual,
  };
}
