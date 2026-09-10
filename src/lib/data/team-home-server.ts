import { createClient } from "@/lib/supabase/server";
import { getProgramUsage, type ProgramUsage } from "@/lib/data/usage-server";
import { loadMatchAnalysis } from "@/lib/data/match-analysis-server";
import { getRosterData } from "@/lib/data/team-roster-server";
import { topMovers, type TopMover } from "@/lib/data/team-movers";
import {
  courtRecordFrom,
  type CourtRecord,
} from "@/lib/data/team-court-record";
import {
  buildInsightEvidenceWithCaption,
  type InsightEvidence,
} from "@/lib/ui/insight-evidence";
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
  shortDate,
  zonedDayString,
  type MatchScore,
} from "@/lib/data/match-utils";
import { rosterMatchIds, type RosterIdRow } from "@/lib/data/roster-ids";
import {
  seasonStrip,
  statRowsByKey,
  STAT_COLUMNS,
  type DbStatRow,
  type ProfileKpi,
  type ProfileResult,
  type SeasonStrip,
} from "@/lib/data/player-profile";
import { statKey } from "@/lib/data/aggregate";
import type { EvidenceCard } from "@/lib/ui/insight-evidence";
import { scoreSetsFrom, type ScoreLineSet } from "@/lib/ui/score-format";
import {
  eventDetailFrom,
  getProgramSchedule,
  scheduleRowsFrom,
} from "@/lib/data/schedule-server";
import type {
  EventDetail,
  ProgramEvent,
  ScheduleRow,
} from "@/lib/schedule/types";
import { formatEventShortDay } from "@/lib/schedule/format";
import {
  dualScore,
  entryPlayed,
  entryState,
  lineWon,
  matchState,
  type EntryState,
} from "@/lib/schedule/entry-state";
import type { EventEntry, EventSite } from "@/lib/schedule/types";
import { INVITE_TTL_HOURS } from "@/lib/services/programs/tokens";
import type { ProgramOrgType } from "@/lib/workspace/types";

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

/** Decided duals in the rail — the frame draws four. */
const DUAL_HISTORY_LIMIT = 4;
/** Results in a form strip — the DS's "last five". */
const FORM_LIMIT = 5;

/** Invites close enough to expiry to be worth naming on the home page. */
const EXPIRING_SOON_DAYS = 7;

/** One day. The horizon above is measured in these, and so is the countdown. */
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The zone Team Home falls back to when a program has none of its own.
 *
 * Every program has a real zone now — `programs.time_zone`, `not null
 * default 'UTC'`, read by `getTeamHomeData` as the one column it needs from
 * the program row — so this is no longer THE zone the page computes in, only
 * the one it uses when that row did not come back (the `programs` row is
 * publicly readable, so that should not happen, but the loader fails closed
 * rather than crash on it).
 *
 * `programs.state` was considered and rejected as a substitute for a real
 * zone column: Arizona keeps no DST and nine states are split across two
 * zones, so a state-to-zone table would be a guess wearing a schema's
 * clothes.
 */
const DEFAULT_TIME_ZONE = "UTC";

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
 * `getTeamHomeData` below. A thin re-export of `zonedDayString`
 * (`match-utils.ts`), which `team-roster-server.ts`'s `isToday` reads through
 * too — one implementation, kept under this name here because it is what the
 * spec imports.
 */
export function localDay(now: Date, timeZone: string): string {
  return zonedDayString(now, timeZone);
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
 * the server's — `getTeamHomeData` passes the program's own `time_zone`, not
 * a pinned constant, and `DEFAULT_TIME_ZONE` is only what a program with none
 * set falls back to.
 *
 * Both ends are YYYY-MM-DD because `program_events.starts_on` is a date, not an
 * instant — the same reason `localDay` exists.
 *
 * Exported for `tests/team-home-week.spec.ts` only, for the same reason
 * `localDay` is: the zone this computes in is the thing worth pinning down.
 */
/** `day` (YYYY-MM-DD) moved by `delta` calendar days, on the same UTC-midnight ruler `weekBounds` steps on. */
export function shiftDay(day: string, delta: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

export function weekBounds(
  now: Date,
  timeZone: string,
): { start: string; end: string } {
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
  /**
   * Which dual the card is about. `"weekend"` is one inside this week's
   * window — the card the page was built for. `"next"` is the soonest dual
   * still ahead when this week holds none: the lineup is on the schedule
   * before anybody has played it, and Platform Audit Ta3 keeps the card on
   * the page in every state rather than mounting it only on dual weeks.
   */
  mode: "weekend" | "next";
  /** The opponent school. `program_events.name` is the opponent on a dual. */
  opponent: string;
  site: EventSite;
  surface: string | null;
  /** YYYY-MM-DD. */
  startsOn: string;
  /** Position order: S1–S6, then D1–D3. */
  lines: DualSheetLine[];
  tally: DualTally;
}

/**
 * A dual's score and everything that follows from it.
 *
 * One object rather than seven fields on `WeekendDual`, so "we cannot count
 * this honestly" is a single null the type system makes the card handle,
 * instead of seven zeroes that render as a result.
 */
export interface DualTally {
  /** Team points, from `dualScore` — six singles and one doubles point. */
  us: number;
  them: number;
  /**
   * Every line is in.
   *
   * The same rule `scheduleRowsFrom` prints a team score under, and it is here
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
  /**
   * The slot whose result clinched it — "S6", "D1" — or null when nobody has.
   *
   * Read off the lines in order of play — doubles, then singles — naming
   * the first line after which `clinchedBy` would have been set; see
   * `clinchedAtSlot` for why that is a convention rather than a clock. Null
   * whenever `clinchedBy` is — the two are one fact.
   */
  clinchedAt: string | null;
}

/**
 * One thing on the page that is waiting for somebody.
 *
 * **Nothing renders this today.** Platform Audit Ta3 retired Team Home's
 * right-hand alerts column, and no other surface has picked the list up, so
 * `teamAttention` and `rosterProgress` below are exported, specified and
 * uncalled. They are kept rather than deleted because the invitation countdown
 * they hold is the product's only expiry warning and the next roster surface
 * will want it — but until something mounts them, a lapsing invitation is
 * visible nowhere.
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
  /**
   * Every match the program has filed, video still in flight included.
   *
   * A count rather than the rows: Ta3 has no matches list — `/dashboard/matches`
   * is where they are read — and the page asks only whether there are any.
   */
  matchCount: number;
  /**
   * Matches a report has come back for. The same number the strip's "Matches
   * analyzed" tile prints, returned in its own right rather than parsed back
   * out of that tile's formatted string.
   */
  analyzedCount: number;
  /**
   * The strip's tiles — the season strip's catalogue, built by the season
   * strip's own builder over the program's side of every analyzed **dual**
   * match. Every statistic gets a tile even when nothing measured it yet
   * ("—"), which is what keeps the picker's default set intact; the page
   * draws the empty strip instead while `kpiHasStats` is false.
   */
  kpiCards: ProfileKpi[];
  /** Any stats row on the program's side — what turns the empty strip real. */
  kpiHasStats: boolean;
  /**
   * How many matches the strip is averaging — analyzed, attributed, and on a
   * dual's lineup. Not `analyzedCount`: that counts every report the program
   * has back, and the strip deliberately reads fewer (see `teamSeasonKpis`).
   * The strip's trend gate, its empty state, the Focus card's footer and its
   * evidence all take this one, so nothing on the page describes the strip
   * with a number the strip did not use.
   */
  kpiMatchCount: number;
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
  /**
   * This week's dual, else the next one ahead (`WeekendDual.mode`), else null
   * — and null now means "no dual on the schedule at all", which is the
   * day-zero case the sheet draws its ghost rows for.
   */
  weekendDual: WeekendDual | null;
  /**
   * Decided duals, newest first, for the rail — see `DualHistoryRow`.
   */
  dualHistory: DualHistoryRow[];
  /** The rail's footer: the season's dual form and record. */
  dualForm: { form: ("win" | "loss")[]; wins: number; losses: number };
  /**
   * Reports that landed since the most recent Friday — the title row's
   * "4 new results since Friday →". Counted on the server so the number is in
   * the HTML and the same for every member; the personal Home's equivalent is
   * per-viewer localStorage and reads `program_id IS NULL`, which is the wrong
   * question here twice over.
   */
  newResults: { count: number; since: string };
  /** Top movers, off the Roster page's own per-player measures. */
  movers: TopMover[];
  /**
   * The rail's mosaic — singles results by court and dual, windowed. Off
   * `programSchedule`, through the same `lineWon` the dual sheet decides by.
   */
  courtRecord: CourtRecord;
  /**
   * The Focus card's evidence line, composed from `kpiCards` by the personal
   * Home's own builder — computed here, never written by the model. Null when
   * no card holds a figure, which keeps the card's body empty rather than
   * reaching for something to say.
   */
  insight: InsightEvidence | null;
  /** How many players the roster holds — the movers card's "Full roster — 8". */
  rosterSize: number;
  /** The quiet setup line's three facts. */
  setup: TeamSetupProgress;
}

/** One decided dual in the rail's history list (Platform Audit Ta3). */
export interface DualHistoryRow {
  id: string;
  opponent: string;
  site: EventSite;
  /** "Aug 8" */
  date: string;
  /** The program's points, then the opponent's. Who won follows from the pair. */
  us: number;
  them: number;
}

/**
 * What the quiet "Getting set up" line reads (Platform Audit Ta3, in the
 * personal Home's `SetupLine` register). Three facts this loader already
 * holds; nothing is read to answer them.
 */
export interface TeamSetupProgress {
  /** Somebody is on the roster (`playerCount`). */
  roster: boolean;
  /** A dual is on the schedule, past or future. */
  schedule: boolean;
  /** A match has been sent — analyzing counts, `teamFirstReport` non-null. */
  report: boolean;
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
    (part): part is string => Boolean(part?.trim()),
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
  rosterIds: ReadonlySet<string>,
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
  rosterIds: ReadonlySet<string>,
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
  prefix: "S" | "D",
): DualSheetLine[] {
  return entries
    .filter((entry) => entry.discipline === discipline)
    .map((entry, index) => {
      const match = entry.matches[0] ?? null;
      // Forfeit first, for the same reason `lineWon` below puts it first: a
      // forfeited line is not waiting on an analysis, whatever a match sitting
      // under it says. Reading the match here while `won` reads the forfeit
      // would render "we won" beside "Analyzing" on one row.
      const state =
        entry.forfeit !== null
          ? entryState(entry)
          : match
            ? matchState(match)
            : entryState(entry);

      return {
        id: entry.id,
        slot: entry.slot ?? `${prefix}${index + 1}`,
        ours: entry.playerLabels.join(" / "),
        theirs:
          match?.opponentLabels.join(" / ") || entry.opponentLabels.join(" / "),
        sets: scoreSetsFrom(match?.score),
        // `lineWon`, not a local ternary: this line used to read
        // `match ? matchWon(match) : forfeitWon(entry)`, which put the forfeit
        // LAST and so disagreed with every other surface on a line carrying
        // both. One spelling, one answer.
        won: lineWon(entry, match),
        state,
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
    entries.filter((entry) => entry.discipline === "singles"),
  );
  const doubles = dualScore(
    entries.filter((entry) => entry.discipline === "doubles"),
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
  today: string,
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
      event.startsOn <= week.end,
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
 *
 * **Exported for `tests/weekend-dual-reads.spec.ts` only**, on the same terms as
 * `weekendDualRow` above: the page reaches it through `getTeamHomeData`, and
 * what is worth pinning is the shape a dual takes. Nothing here performs I/O.
 */
export function buildWeekendDual(
  detail: EventDetail | null,
  mode: WeekendDual["mode"] = "weekend",
): WeekendDual | null {
  if (!detail || detail.entries.length === 0) return null;

  const { event, entries } = detail;

  return {
    id: event.id,
    mode,
    opponent: event.name,
    site: event.site,
    surface: event.surface,
    startsOn: event.startsOn,
    lines: [
      ...dualLines(entries, "singles", "S"),
      ...dualLines(entries, "doubles", "D"),
    ],
    tally: dualTally(entries),
  };
}

/**
 * The tally, once we know it can be counted.
 *
 * Split out of `buildWeekendDual` so the arithmetic sits behind the one gate
 * that decides whether it may run at all — a `dualScore()` computed and then
 * discarded is a number waiting for somebody to notice it is already there.
 */
function dualTally(entries: EventEntry[]): DualTally {
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
    us: score.us,
    them: score.them,
    decided: score.decided,
    playedLines: entries.filter(entryPlayed).length,
    ...dualBreakdown(entries),
    clinchedBy,
    clinchedAt: clinchedBy ? clinchedAtSlot(entries, points) : null,
  };
}

/**
 * The line after which one side held a majority of the points — see
 * `DualTally.clinchedAt`.
 *
 * **One fold, not a second one.** The walk hands a growing prefix of played
 * lines to `dualScore` — the same function that produced the tally printed
 * beside it — and returns the first slot at which that score crosses the
 * majority. An earlier draft re-implemented the doubles fold here with its own
 * accumulators and decided each line with the one-argument `lineWon`, which
 * returns `false` (never `null`) for a line nobody has played: every unplayed
 * court was scored as a point for the opponent, so a dual still in progress
 * could name a court its opponent had not won. Asking `dualScore` makes
 * `clinchedBy` and `clinchedAt` one computation by construction.
 *
 * **Order of play, not timestamps.** An entry carries no completion time, so
 * the walk follows the order a collegiate dual is played in: doubles first,
 * then singles S1–S6. That is a convention, and the label reads as one —
 * "clinched at S5" means that, taken in playing order, S5 is the line that put
 * the dual out of reach, not that S5 was the last court still playing.
 */
function clinchedAtSlot(entries: EventEntry[], points: number): string | null {
  const doubles = entries.filter((entry) => entry.discipline === "doubles");
  const singles = entries.filter((entry) => entry.discipline === "singles");
  const ordered = [
    ...doubles.map((entry, i) => ({ entry, slot: entry.slot ?? `D${i + 1}` })),
    ...singles.map((entry, i) => ({ entry, slot: entry.slot ?? `S${i + 1}` })),
  ];

  const played: EventEntry[] = [];
  for (const { entry, slot } of ordered) {
    // An unplayed line awards nothing and cannot clinch anything. `dualScore`
    // makes the same refusal per line; this keeps it out of the prefix so the
    // running score is only ever over lines that are in.
    if (!entryPlayed(entry)) continue;
    played.push(entry);
    const score = dualScore(played);
    if (score.us * 2 > points || score.them * 2 > points) return slot;
  }

  return null;
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
 * the same arrangement, and the same reasoning, as `teamSeasonKpis` below: it takes
 * this loader's own row shapes, it should acquire no caller outside this file,
 * and the spec can import the module safely because nothing here runs at module
 * scope.
 */
export function rosterProgress(
  rosterRows: { role: string }[],
  invites: { role: string; createdAt: string }[],
  now: number,
  timeZone: string = DEFAULT_TIME_ZONE,
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
      (expiry) => Number.isFinite(expiry) && expiry > now && expiry <= horizon,
    )
    .sort((a, b) => a - b);

  return {
    players,
    outstanding: outstanding.length,
    expiringSoon: soon.length,
    expiringInDays:
      soon.length > 0 ? wholeDaysUntil(soon[0], now, timeZone) : null,
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
 * Anchoring both ends to their day in `timeZone` makes the two words mean
 * what they say.
 *
 * `timeZone` is the program's own zone now, threaded in from `rosterProgress`
 * — this used to reach for the module constant directly, which is exactly the
 * bug this file's single-clock comment warns about: the weekend sheet honoring
 * the program's zone while "One invite expires tomorrow" stayed on UTC, one
 * page, two zones.
 *
 * Both anchors are UTC midnights built from a zoned calendar day, so the
 * subtraction never walks through a DST transition — the same construction, and
 * the same reason, as `weekBounds`.
 *
 * The caller has already dropped everything at or before `now`, so this cannot
 * return a negative and there is nothing to clamp: `expiry > now` puts the
 * expiry on `now`'s day or a later one.
 */
function wholeDaysUntil(expiry: number, now: number, timeZone: string): number {
  const midnight = (ms: number) =>
    Date.parse(`${localDay(new Date(ms), timeZone)}T00:00:00.000Z`);
  return Math.round((midnight(expiry) - midnight(now)) / DAY_MS);
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
  nowMs: number,
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
  nowMs: number,
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
 * Exported with `teamSeasonKpis` below, so its spec builds fixtures in the shape the
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
  jobs: Map<string, MatchAnalysis>,
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
  rosterIds: ReadonlySet<string>,
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
  rosterIds: ReadonlySet<string>,
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
 * The strip's tiles, through the season strip both Homes now draw.
 *
 * `seasonKpis()` is the personal Home's and a player profile's own builder
 * (`lib/data/player-profile.ts`), and this hands it the program's side of
 * each match rather than one player's. That is the whole difference: the
 * arithmetic, the catalogue, the picker and the hover chart are the ones a
 * coach already reads on their own Home, so a squad average and a personal
 * average cannot disagree about what "1st serve won" counts.
 *
 * All this decides is attribution: which side of each analyzed match is the
 * program's (`programSide`, off `rosterIds`), and which dual it belongs to
 * (`eventByEntryId`). **Dual matches only** (CJ, 2026-09-07): a match feeds a
 * tile only when it sits on a dual's lineup — a tournament run, or a match
 * recorded under the program with no schedule entry, is the program's match
 * but not the team's result. A match nothing attributes to the program is
 * left out too, the same refusal the matches list makes when it draws no
 * outcome mark.
 *
 * The opponent a point is named after is the DUAL and our player — "Pacific
 * Ridge · D. Brooks" — not the player across the net, because a coach reads
 * the season by its Saturdays.
 *
 * Exported for the attribution specs (`tests/team-roster-ids.spec.ts`).
 * Pure: no I/O.
 */
export function teamSeasonKpis(
  rows: DbSeasonMatch[],
  jobs: Map<string, MatchAnalysis>,
  statRows: DbStatRow[],
  rosterIds: ReadonlySet<string>,
  eventByEntryId: ReadonlyMap<
    string,
    { event: ProgramEvent; entry: EventEntry }
  >,
  /** The program's dual record, for the Record tile's "6–2 in duals" line. */
  duals: { wins: number; losses: number },
): SeasonStrip {
  const statsByKey = statRowsByKey(statRows);

  // Newest first, which is the order `seasonKpis` reads in. Sorted here
  // rather than assumed: the loader hands this a DESC read, but a window that
  // silently depends on its caller's ordering draws the season backwards the
  // first time anybody passes it the other way — the specs do. `id` breaks a
  // date tie: six courts of one Saturday share a date, and a series that
  // reorders between page loads draws a different trend each time.
  const newestFirst = [...rows].sort(
    (left, right) =>
      (right.date ?? "").localeCompare(left.date ?? "") ||
      left.id.localeCompare(right.id),
  );

  const results: ProfileResult[] = [];
  for (const row of newestFirst) {
    if (!isAnalysisReady(analysisOf(row, jobs).status)) continue;
    const side = programSide(row, rosterIds);
    if (side === null) continue;
    const hung = row.event_entry_id
      ? eventByEntryId.get(row.event_entry_id)
      : undefined;
    if (!hung || hung.event.kind !== "dual") continue;
    const isPlayer1 = side === "player1";
    const ours = isPlayer1 ? row.player1_name : row.player2_name;
    results.push({
      id: row.id,
      date: row.date,
      isPlayer1,
      won: matchOutcome(row.score, isPlayer1),
      entryId: row.event_entry_id,
      opponentName: `${hung.event.name} · ${
        ours?.trim() || hung.entry.playerLabels.join(" / ") || "—"
      }`,
      score: row.score,
      tournamentName: null,
      stats: statsByKey.get(statKey(row.id, isPlayer1)) ?? null,
    });
  }

  // The Record tile reads the DUAL record, not a tally of the matches this
  // strip averaged: those are the analyzed dual matches, and headlining
  // "3–1" for a squad that is 6–2 in duals would print a denominator of
  // "matches we filmed" with nothing on the tile saying so. `duals` is also
  // passed as the record itself, so the tile draws no redundant subtext.
  return seasonStrip(results, { wins: 0, losses: 0 }, duals);
}

/**
 * The season tiles as the insight layer reads them.
 *
 * `buildInsightEvidenceWithCaption` and `getTopKpiMovers` read five fields —
 * `EvidenceCard` — while the strip's tile nests its trend. Adapting here
 * rather than widening either data type keeps the personal Home's path
 * untouched: its `KpiCardData` already satisfies the reader structurally.
 * A tile with no trend reads as a zero change, which is what
 * `getTopKpiMovers` already filters on.
 *
 * `record` is dropped: "12–4" is not a figure the evidence line can compare
 * or sign, and a claim built on it would read as a rate.
 */
export function insightCardsFrom(kpis: readonly ProfileKpi[]): EvidenceCard[] {
  return kpis
    .filter((kpi) => kpi.key !== "record")
    .map((kpi) => ({
      label: kpi.label,
      value: kpi.value,
      change: kpi.trend?.change ?? 0,
      changeLabel: kpi.trend?.changeLabel ?? "",
    }));
}

/**
 * Everything Team Home draws, in one read.
 *
 * It used to take the caller's role as well, to decide whether the `matches`
 * rows it was about to reduce were the program's or one player's. Since
 * `20260830120000_matches_visible_to_members` there is only one answer —
 * every member reads the program's matches — so the rows no longer need a
 * question asked about them, and the parameter went with the branch.
 */
export async function getTeamHomeData(
  programId: string,
  billingMonth: string,
  /**
   * The workspace's `programs.org_type`, for the budget meter's cap figure
   * only — a custom org shows (and is enforced) the reduced tier, a verified
   * collegiate program the 75h one. See `getProgramUsage()` / `quotaTierFor()`.
   */
  orgType: ProgramOrgType | null,
): Promise<TeamHomeData> {
  const supabase = await createClient();

  // One clock for the whole read. The greeting, the schedule window, the dual
  // sheet and the invite expiry below all have to agree about what day it is:
  // a request that straddles midnight would otherwise answer two different
  // questions. `now` is the single instant — taken here, once, rather than
  // from the process, and never re-read below.
  const now = new Date();

  const [
    usage,
    { data: programRow },
    { data: rosterRows },
    { data: seasonRows },
    programSchedule,
    rosterData,
  ] = await Promise.all([
    getProgramUsage(programId, billingMonth, orgType),
    // The one column this page needs from the program row. This was
    // `getTeamSettings()` — three reads, two of them for an invite-expiry
    // alert Ta3 retired — kept for a time zone.
    supabase
      .from("programs")
      .select("time_zone")
      .eq("id", programId)
      .maybeSingle(),
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
        "id, player1_name, player2_name, player1_id, player2_id, event_entry_id, score, date, source_provider, verified",
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
    // The Roster page's own read, for the movers card. Every figure the
    // movers list prints is one the roster drawer prints for the same
    // player; see `lib/data/team-movers.ts`.
    //
    // **It is not free, and it is not deduplicated with the read above.**
    // `getRosterData` is `cache()`d per REQUEST, so it collapses with a
    // second call in this render and not with the Roster page's own call in
    // the next navigation; and its first statement is `program_roster_full`,
    // the same RPC this `Promise.all` already runs. So Team Home asks for
    // the roster twice and additionally pays for seat usage, invitations and
    // a second season stats scan, to rank seven players. The honest fix is to
    // widen the `match_stats_with_percentages` select below to the four
    // `ROSTER_DRAWER_MEASURES` columns and fold the trends here — worth doing
    // before this page is on anyone's critical path.
    getRosterData(programId),
  ]);

  // **The single zone the rest of this read's calendar arithmetic runs in** —
  // the program's own (`programs.time_zone`, read above), falling back to
  // `DEFAULT_TIME_ZONE` when the `programs` row itself did not come back.
  // The schedule window, the dual sheet and the invite countdown all have to
  // agree about what zone they are reading in, for the same reason they have
  // to agree about `now`: a day read in one zone against a week read in
  // another would put "this weekend" outside "this week", and a coach reading
  // the dual sheet in their own zone while the invite alert still spoke UTC
  // was exactly this bug.
  const timeZone = programRow?.time_zone ?? DEFAULT_TIME_ZONE;
  const today = localDay(now, timeZone);
  const week = weekBounds(now, timeZone);

  const season = (seasonRows ?? []) as DbSeasonMatch[];
  const seasonIds = season.map((row) => row.id);

  const [jobs, stats] = await Promise.all([
    // `reap: true` is deliberately NOT passed. It is a write, and it belongs to
    // the two surfaces that draw a progress bar big enough for a frozen one to
    // mislead — the matches list and match detail. This page shows a dot.
    loadMatchAnalysis(supabase, seasonIds),
    // The same view, the same three columns and the same natural key the
    // roster page reads (`team-roster-server.ts`) — including how it decides
    // which side of a match a stat row belongs to. A second way to attribute a
    // statistic to a side is a serve percentage printed under the wrong
    // player's name, with nothing on screen looking wrong.
    (async (): Promise<DbStatRow[]> => {
      if (seasonIds.length === 0) return [];
      const { data } = await supabase
        .from("match_stats_with_percentages")
        .select(STAT_COLUMNS)
        .in("match_id", seasonIds);
      return (data ?? []) as unknown as DbStatRow[];
    })(),
  ]);

  // Both ids the RPC returns per person, through the one rule the Roster page
  // resolves by (`lib/data/roster-ids.ts`). This was `player_id` alone, and the
  // miss was invisible on every seat it was ever read against — staff and
  // unclaimed players carry the same value in both columns. A claimed player's
  // pre-claim match was the one row it dropped: correct names, a real score,
  // and no outcome mark, missing from every card on the KPI strip. Nothing
  // else is read off these rows — the squad's size and the setup line come
  // off `rosterData`.
  const rosterIds = rosterMatchIds((rosterRows ?? []) as RosterIdRow[]);

  // `readSchedule` returns events newest first, which is the order the schedule
  // page renders them in. Both questions below are asked forwards in time, so
  // they are asked of that one list reversed — never of a second query with an
  // ordering of its own to keep in step.
  const upcoming = [...programSchedule.events].reverse();

  // The schedule page's own rows, off the schedule page's own mapping. The KPI
  // strip's dual record is `teamScore` on these, so "did we win that dual" is
  // one answer read twice rather than two answers that can drift.
  const scheduleRows = scheduleRowsFrom(programSchedule);

  // No round trip left in this card: the dual, if there is one, is already in
  // `programSchedule` with its lines under it.
  const dualRow = weekendDualRow(upcoming, week, today);
  // No dual this week: the next one ahead, so the card can show the lineup a
  // coach is preparing. Still null when the schedule holds no dual ahead at
  // all — the sheet then draws the day-zero shape rather than last month's
  // card under a heading that says "this weekend".
  // No dual this week, but one in the last seven days still has lines open —
  // Sunday's dual read on Monday, the common case, since the week rolls on
  // Monday and the rail lists decided duals only. It stays on the card, as
  // "this weekend", until every line is in; only then does the card look
  // ahead. Newest first, so `.find` is the most recent such dual.
  const openRecentDual =
    dualRow ??
    programSchedule.events.find(
      (event) =>
        event.kind === "dual" &&
        event.startsOn < today &&
        event.startsOn >= shiftDay(today, -7) &&
        !dualScore(programSchedule.entriesByEvent.get(event.id) ?? []).decided,
    ) ??
    null;
  const nextDualRow = openRecentDual
    ? null
    : (upcoming.find(
        (event) => event.kind === "dual" && event.startsOn >= today,
      ) ?? null);
  const weekendDual = openRecentDual
    ? buildWeekendDual(eventDetailFrom(programSchedule, openRecentDual.id))
    : nextDualRow
      ? buildWeekendDual(
          eventDetailFrom(programSchedule, nextDualRow.id),
          "next",
        )
      : null;

  // The rail: every dual with a full card in, newest first — `teamScore` is
  // null until every line is decided, which is the schedule page's own rule
  // for printing one. `scheduleRows` is newest-first already.
  const decidedDuals = scheduleRows.filter(
    (row): row is ScheduleRow & { teamScore: { us: number; them: number } } =>
      row.kind === "dual" &&
      row.teamScore !== null &&
      row.teamScore.us !== row.teamScore.them,
  );
  let dualWins = 0;
  const dualHistory: DualHistoryRow[] = [];
  const dualForm: ("win" | "loss")[] = [];
  for (const row of decidedDuals) {
    const won = row.teamScore.us > row.teamScore.them;
    if (won) dualWins += 1;
    if (dualHistory.length < DUAL_HISTORY_LIMIT) {
      dualHistory.push({
        id: row.id,
        opponent: row.name,
        site: row.site,
        date: formatEventShortDay(row.startsOn),
        us: row.teamScore.us,
        them: row.teamScore.them,
      });
    }
    // Oldest at the left, like every form strip in the product — the source is
    // newest-first, so the strip is unshifted rather than reversed at the end.
    if (dualForm.length < FORM_LIMIT) dualForm.unshift(won ? "win" : "loss");
  }

  // "4 new results since Friday": reports whose job last moved on or after
  // the most recent Friday midnight, program time. A ready job's `updatedAt`
  // is when it finished — the pipeline writes nothing to a finished row. An
  // import has no job row and no timestamp to read, so it is not counted;
  // that is a silence, not a zero.
  const friday = lastFriday(today);
  // Both counts come off one walk of the season, and both ask when the REPORT
  // landed rather than when the match was played: `updatedAt` on a ready job is
  // when it finished, because the pipeline writes nothing to a finished row. An
  // import has no job row and no timestamp, so it is in neither count — a
  // silence, not a zero. `localDay` runs last, after three cheap tests, so the
  // per-row Intl cost is paid only for rows that could qualify.
  let newResultsCount = 0;
  // The title row's figure: every report the program has back, off the same
  // `jobs` map `teamSeasonKpis` reads. Deliberately wider than the strip's own
  // count — `kpiMatchCount` — which drops matches nothing attributes to the
  // program and matches on no dual lineup; the title says what came back,
  // the strip says what it averaged, and the page reads both.
  let analyzedCount = 0;
  for (const row of season) {
    // `analysisOf`, not `jobs.get` — an import has no job row, and reading the
    // map directly counted the product's primary ingest path as nothing at
    // all: a program that only imports would watch "matches analyzed" climb
    // every weekend while the "N new results" link never once appeared.
    const analysis = analysisOf(row, jobs);
    if (!isAnalysisReady(analysis.status)) continue;
    analyzedCount += 1;
    // When the report landed. A job's `updatedAt` is exactly that, because the
    // pipeline writes nothing to a finished row. An import never had a job and
    // so has no arrival time; its match date stands in, which is the closest
    // true thing about it — an imported file is filed for a match just played.
    const stamp = analysis.updatedAt ?? row.date;
    if (!stamp) continue;
    // A job's `updatedAt` is an instant and is read in the program's zone. A
    // match date is already a calendar day (`matches.date` is a `date`
    // column; a bare YYYY-MM-DD), and putting one through `new Date()` reads
    // it as UTC midnight — west of Greenwich, the evening before — so every
    // Friday import fell out of "since Friday". The same trap `format.ts`
    // documents for the schedule; here it is a comparison, not a print.
    const day = /^\d{4}-\d{2}-\d{2}$/.test(stamp)
      ? stamp
      : localDay(new Date(stamp), timeZone);
    if (day >= friday) newResultsCount += 1;
  }

  // The squad, off the same snapshot `movers` was ranked from — see the
  // `rosterSize` note below.
  const rosterPlayers = rosterData.members.filter(
    (member) => member.role === "player",
  ).length;

  // Same three inputs the strip is built from, and deliberately the same
  // `jobs` map: the setup line saying a report is back while the strip counts
  // no analyzed match would be two answers about one program, on one screen.
  const firstReport = teamFirstReport(season, jobs, rosterIds);

  // Which Saturday each match belongs to, for the strip's hover chart. One
  // walk of the schedule the page already holds; no read of its own.
  const eventByEntryId = new Map<
    string,
    { event: ProgramEvent; entry: EventEntry }
  >();
  for (const event of programSchedule.events) {
    for (const entry of programSchedule.entriesByEvent.get(event.id) ?? []) {
      eventByEntryId.set(entry.id, { event, entry });
    }
  }
  const {
    kpis: kpiCards,
    matchesPlayed: kpiMatchCount,
    hasStats: kpiHasStats,
  } = teamSeasonKpis(season, jobs, stats, rosterIds, eventByEntryId, {
    wins: dualWins,
    losses: decidedDuals.length - dualWins,
  });

  return {
    usage,
    matchCount: season.length,
    analyzedCount,
    kpiCards,
    kpiHasStats,
    kpiMatchCount,
    firstReport,
    weekendDual,
    dualHistory,
    dualForm: {
      form: dualForm,
      wins: dualWins,
      losses: decidedDuals.length - dualWins,
    },
    newResults: { count: newResultsCount, since: "Friday" },
    movers: topMovers(rosterData.members),
    courtRecord: courtRecordFrom(
      programSchedule.events,
      programSchedule.entriesByEvent,
    ),
    // The same cards the strip renders, through the same evidence builder the
    // personal Home reads — so a figure on the card is a figure on a tile.
    insight: buildInsightEvidenceWithCaption(
      insightCardsFrom(kpiCards),
      kpiMatchCount,
    ),
    // Off `rosterData`, the same snapshot `movers` was ranked from, so the
    // card's "Full roster — 8" and the eight rows it could show can never
    // disagree. `people` is a second read of the same RPC (see the note on the
    // `getRosterData` call above) and could observe a different squad.
    rosterSize: rosterPlayers,
    setup: {
      roster: rosterPlayers > 0,
      schedule: scheduleRows.some((row) => row.kind === "dual"),
      // A match SENT, which is what the step asks for — `teamFirstReport`
      // returns a row for one still analyzing too. Gating on "done" told a
      // coach who had uploaded that morning to "Send a match", pointing at the
      // wizard for the match then running.
      report: firstReport !== null,
    },
  };
}

/**
 * The most recent Friday on or before `today` (YYYY-MM-DD), for the title
 * row's "since Friday". Friday because that is when a dual weekend's video
 * starts arriving; on a Friday it is today.
 */
function lastFriday(today: string): string {
  const [year, month, day] = today.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  // getUTCDay: Sunday 0 … Friday 5.
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 2) % 7));
  return date.toISOString().slice(0, 10);
}
