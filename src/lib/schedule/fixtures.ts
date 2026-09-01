/**
 * The schedule design's own sample content, as data.
 *
 * `Events & Lineups.dc.html` draws its screens against one invented season —
 * Meridian State, Elena Vasquez, a Ridgeline University dual that has not been
 * played, a Fairmont A&M dual that has, and the Buckeye Fall Classic being
 * created. This module is that content and nothing else: the static rebuild of
 * those artboards renders from here instead of from `getProgramSchedule()`.
 *
 * ── Everything is typed against `./types` ───────────────────────────────────
 * `ScheduleRow`, `EventDetail`, `ProgramEvent`, `EventEntry`, `EntryMatch` and
 * `EventFormat` are the shapes the real loaders already return. That is the
 * whole point, and the whole concession to the re-wiring that has been
 * deferred: when the schedule goes back on the database, the change is swapping
 * a fixture import for the loader call — not rewriting every component's props.
 * No `as`, no `Partial<>`, no locally redeclared row shape. If something the
 * design draws cannot be said in these types, that is a finding, not a licence
 * to widen them.
 *
 * The school directory at the foot of this file is the same bargain one module
 * over: `DirectorySchool` pairs `ProgramSearchResult` (`lib/data/programs-server`)
 * with `OpponentDualHistory` (`lib/schedule/opponent-history`) — the two shapes
 * `SchoolSearch` already takes — and adds one documented field for the single
 * figure on `2c` that neither can hold. Both are `import type`, so nothing
 * server-side follows them into a client bundle.
 *
 * ── `format.adScoring` is the one live guardrail seam in here ───────────────
 * `EventFormat.adScoring` is `boolean | null` and null is a real state, not a
 * missing one: the vision pipeline refuses a job without it, and
 * `tournament-form.tsx`'s header records the outage that followed the last
 * time format arrived as `{}`. Every event below therefore carries an explicit
 * boolean — never omitted, never left to a default. See
 * `docs/ui-revamp-guardrails.md` §3.1 and §4.
 *
 * The `"3|false"` string the dormant forms use is the *form control's* value
 * encoding (`dual-form.tsx:52`, `tournament-form.tsx:40`). It is not this type,
 * and nothing here should produce it.
 *
 * ── Nothing here is invented ────────────────────────────────────────────────
 * Every name, score, date and status below is drawn on an artboard. Where the
 * design's own summary copy cannot be derived from the rows it draws — the
 * "6 events · 2 upcoming · 4 completed" header, `SEASON_FACTS`, and 7d's
 * "8 of 9 lines analyzed" — that copy is exported as the literal string the
 * design wrote, and the gap is reported rather than papered over with events
 * the design never named.
 */

import type {
  EntryMatch,
  EventDetail,
  EventEntry,
  EventFormat,
  ProgramEvent,
  ScheduleRow,
} from "./types";
import type { OpponentDualHistory } from "@/lib/schedule/opponent-history";
import type { ProgramSearchResult } from "@/lib/data/programs-server";
import type { LadderPlayer } from "@/lib/data/roster-server";

/* ── Who the design is signed in as ─────────────────────────────────────── */

/** The workspace, from every artboard's `<dc-import name="Sidebar" ws=…>`. */
export const PROGRAM_NAME = "Meridian State";

/** The signed-in user, from the same import's `user=` — the topbar's "EV". */
export const USER_NAME = "Elena Vasquez";

/** 7e's header: "0 events · nothing scheduled for 2026–27". En dash. */
export const SEASON_LABEL = "2026–27";

/**
 * 7d's season line, verbatim — en dash between the figures, `·` between the
 * clauses.
 *
 * A literal rather than a derivation on purpose. It claims a fourth completed
 * dual, lost, that no artboard names; deriving it would mean inventing that
 * event. Reproduced as drawn, and flagged.
 */
export const SEASON_FACTS = "3–1 in duals · 31 of 36 lines analyzed";

const PROGRAM_ID = "fixture-program-meridian-state";

/* ── Formats ────────────────────────────────────────────────────────────── */

/**
 * The duals' format.
 *
 * `2b` draws it as "Best of 3 sets · No-ad scoring", which is `FORMATS`' first
 * entry in both dormant forms. `adScoring: false` is the *drawn* answer, not a
 * default standing in for a missing one.
 */
const DUAL_FORMAT: EventFormat = { bestOf: 3, adScoring: false };

/** `3c`'s Format field reads "Bo3 · ad" — so `true`, explicitly. */
const TOURNAMENT_FORMAT: EventFormat = { bestOf: 3, adScoring: true };

/* ── Builders ───────────────────────────────────────────────────────────── */

/**
 * One dual line and the match under it.
 *
 * `score.player1` is always our side and holds GAME counts — a 7-6 set is 7
 * here, never the tiebreak. Tiebreak POINTS ride in the same object against
 * whoever LOST the set, which is the digit `tiebreakOf()` raises.
 */
function dualLine(params: {
  eventId: string;
  key: string;
  slot: string;
  position: number;
  discipline: EventEntry["discipline"];
  playerLabels: string[];
  opponentLabels: string[];
  opponentSchool: string;
  score: EntryMatch["score"];
  status: EntryMatch["status"];
  hasVideo: boolean;
}): EventEntry {
  return {
    id: `${params.key}-entry`,
    eventId: params.eventId,
    discipline: params.discipline,
    slot: params.slot,
    position: params.position,
    // A dual line has a court, not a draw, and is never seeded.
    draw: null,
    seed: null,
    // No real users behind a fixture. `playerLabels` is what a lineup stores
    // anyway — written at create, never re-derived from the roster.
    playerUserIds: [],
    playerLabels: params.playerLabels,
    opponentLabels: params.opponentLabels,
    opponentSchool: params.opponentSchool,
    forfeit: null,
    matches: [
      {
        id: `${params.key}-match`,
        // Null on a dual line, whose slot is its round.
        round: null,
        status: params.status,
        score: params.score,
        opponentLabels: params.opponentLabels,
        hasVideo: params.hasVideo,
      },
    ],
  };
}

/** One tournament entry: a player in a draw, with no match until one is played. */
function tournamentEntry(params: {
  eventId: string;
  key: string;
  position: number;
  playerLabels: string[];
  draw: string;
  seed: number | null;
}): EventEntry {
  return {
    id: `${params.key}-entry`,
    eventId: params.eventId,
    discipline: "singles",
    // Null for a tournament entry, which has a draw rather than a court.
    slot: null,
    position: params.position,
    draw: params.draw,
    seed: params.seed,
    playerUserIds: [],
    playerLabels: params.playerLabels,
    opponentLabels: [],
    opponentSchool: null,
    forfeit: null,
    // 3c: "Creates 3 entries and no matches — a match exists once it's played".
    matches: [],
  };
}

/* ── The events ─────────────────────────────────────────────────────────── */

const RIDGELINE_ID = "fixture-event-ridgeline";
const FAIRMONT_ID = "fixture-event-fairmont";
const ASH_ID = "fixture-event-ash";
const HARLOW_ID = "fixture-event-harlow";
const BUCKEYE_ID = "fixture-event-buckeye";

/*
 * The calendar below is 2025, because the design's weekday labels are.
 *
 * 7d and 4c draw "Sat 6 Sep", "Sat 13 Sep", "Sat 20 Sep" and "Fri 26 Sep", and
 * 3c's tournament runs 10-03 to 10-05. All six land on exactly those weekdays
 * in 2025 and on none of them in 2026 or 2027, so `formatEventDay()` reproduces
 * the drawn strings only from these dates. `SEASON_LABEL` says "2026–27" over
 * the same set; that disagreement is the design's, and it is reported rather
 * than resolved here.
 */

/** 7d's next event: "Fri 26 Sep · Home · hard · lineup not set". */
const RIDGELINE_EVENT: ProgramEvent = {
  id: RIDGELINE_ID,
  programId: PROGRAM_ID,
  kind: "dual",
  name: "Ridgeline University",
  startsOn: "2025-09-26",
  endsOn: "2025-09-26",
  site: "home",
  surface: "hard",
  host: null,
  format: DUAL_FORMAT,
};

/** 4c's detail pane: "Sat 20 Sep · Away · hard", "vs Fairmont A&M", 5–2. */
const FAIRMONT_EVENT: ProgramEvent = {
  id: FAIRMONT_ID,
  programId: PROGRAM_ID,
  kind: "dual",
  name: "Fairmont A&M",
  startsOn: "2025-09-20",
  endsOn: "2025-09-20",
  site: "away",
  surface: "hard",
  host: null,
  format: DUAL_FORMAT,
};

/** 3c's subject, as the event it would create. */
const BUCKEYE_EVENT: ProgramEvent = {
  id: BUCKEYE_ID,
  programId: PROGRAM_ID,
  kind: "tournament",
  name: "Buckeye Fall Classic",
  startsOn: "2025-10-03",
  endsOn: "2025-10-05",
  site: "neutral",
  // 3c draws Name, Starts, Ends, Site and Format, and no surface or host field.
  surface: null,
  host: null,
  format: TOURNAMENT_FORMAT,
};

/* ── 4c's nine lines ────────────────────────────────────────────────────── */

/**
 * The dual 4c resolves: six singles, three doubles, every line in.
 *
 * Statuses come from the affordance each row draws. Five singles carry
 * "View report" (`completed` with video, so `isAnalysisReady` — a report
 * exists); S2 carries the analyzing StatusChip (`processing`, the one status
 * `isWorking` lights); the three doubles carry "Coming soon" (`manual` and no
 * video, which is what the vendor's singles-only limit actually means for a
 * doubles line — see `supportsVideo`).
 *
 * The score reads 5–2 out of these rows under `dualScore()`: four singles to us
 * and two to them, plus the doubles point for taking two of three.
 */
const FAIRMONT_ENTRIES: EventEntry[] = [
  dualLine({
    eventId: FAIRMONT_ID,
    key: "fairmont-s1",
    slot: "S1",
    position: 0,
    discipline: "singles",
    playerLabels: ["D. Brooks"],
    opponentLabels: ["A. Castillo"],
    opponentSchool: "Fairmont A&M",
    // 6-4, 6-2
    score: { player1: [6, 6], player2: [4, 2] },
    status: "completed",
    hasVideo: true,
  }),
  dualLine({
    eventId: FAIRMONT_ID,
    key: "fairmont-s2",
    slot: "S2",
    position: 1,
    discipline: "singles",
    playerLabels: ["M. Reid"],
    opponentLabels: ["J. Park"],
    opponentSchool: "Fairmont A&M",
    // 4-6, 6-7³ — we lost the second set on the tiebreak, so the 3 sits in
    // OUR slot: the digit belongs to whoever lost the set.
    score: {
      player1: [4, 6],
      player2: [6, 7],
      player1_tiebreaks: [null, 3],
      player2_tiebreaks: [null, null],
    },
    status: "processing",
    hasVideo: true,
  }),
  dualLine({
    eventId: FAIRMONT_ID,
    key: "fairmont-s3",
    slot: "S3",
    position: 2,
    discipline: "singles",
    playerLabels: ["R. Osei"],
    opponentLabels: ["T. Nguyen"],
    opponentSchool: "Fairmont A&M",
    // 7-5, 6-4
    score: { player1: [7, 6], player2: [5, 4] },
    status: "completed",
    hasVideo: true,
  }),
  dualLine({
    eventId: FAIRMONT_ID,
    key: "fairmont-s4",
    slot: "S4",
    position: 3,
    discipline: "singles",
    playerLabels: ["L. Moreau"],
    opponentLabels: ["D. Ferro"],
    opponentSchool: "Fairmont A&M",
    // 6-3, 6-4
    score: { player1: [6, 6], player2: [3, 4] },
    status: "completed",
    hasVideo: true,
  }),
  dualLine({
    eventId: FAIRMONT_ID,
    key: "fairmont-s5",
    slot: "S5",
    position: 4,
    discipline: "singles",
    playerLabels: ["S. Tanaka"],
    opponentLabels: ["R. Alvarez"],
    opponentSchool: "Fairmont A&M",
    // 6-1, 6-2
    score: { player1: [6, 6], player2: [1, 2] },
    status: "completed",
    hasVideo: true,
  }),
  dualLine({
    eventId: FAIRMONT_ID,
    key: "fairmont-s6",
    slot: "S6",
    position: 5,
    discipline: "singles",
    playerLabels: ["K. Sato"],
    opponentLabels: ["J. Abara"],
    opponentSchool: "Fairmont A&M",
    // 3-6, 4-6 — lost, and still carries a report.
    score: { player1: [3, 4], player2: [6, 6] },
    status: "completed",
    hasVideo: true,
  }),
  dualLine({
    eventId: FAIRMONT_ID,
    key: "fairmont-d1",
    slot: "D1",
    position: 6,
    discipline: "doubles",
    // A pair is ONE entry whose labels carry both names — "Brooks / Osei" is
    // this array joined, and `splitNames()` is what takes it apart again.
    playerLabels: ["Brooks", "Osei"],
    opponentLabels: ["Castillo", "Ferro"],
    opponentSchool: "Fairmont A&M",
    // 6-3 — ITA doubles is one set.
    score: { player1: [6], player2: [3] },
    status: "manual",
    hasVideo: false,
  }),
  dualLine({
    eventId: FAIRMONT_ID,
    key: "fairmont-d2",
    slot: "D2",
    position: 7,
    discipline: "doubles",
    playerLabels: ["Reid", "Tanaka"],
    opponentLabels: ["Park", "Alvarez"],
    opponentSchool: "Fairmont A&M",
    // 4-6
    score: { player1: [4], player2: [6] },
    status: "manual",
    hasVideo: false,
  }),
  dualLine({
    eventId: FAIRMONT_ID,
    key: "fairmont-d3",
    slot: "D3",
    position: 8,
    discipline: "doubles",
    playerLabels: ["Moreau", "Sato"],
    opponentLabels: ["Ferro", "Nguyen"],
    opponentSchool: "Fairmont A&M",
    // 6-4
    score: { player1: [6], player2: [4] },
    status: "manual",
    hasVideo: false,
  }),
];

/** 3c's field: three entries, added from the roster rail, no matches yet. */
const BUCKEYE_ENTRIES: EventEntry[] = [
  tournamentEntry({
    eventId: BUCKEYE_ID,
    key: "buckeye-brooks",
    position: 0,
    playerLabels: ["Dana Brooks"],
    // "Main draw" and "Qualifying" are the stored values, not just labels —
    // `entry-editor.tsx:27`'s DRAWS, and what `rosterSubline()` reads to print
    // "S1 · entered · seed 3".
    draw: "Main draw",
    seed: 3,
  }),
  tournamentEntry({
    eventId: BUCKEYE_ID,
    key: "buckeye-reid",
    position: 1,
    playerLabels: ["Marcus Reid"],
    draw: "Main draw",
    // 3c draws "Unseeded".
    seed: null,
  }),
  tournamentEntry({
    eventId: BUCKEYE_ID,
    key: "buckeye-osei",
    position: 2,
    playerLabels: ["Rafael Osei"],
    draw: "Qualifying",
    // 3c draws an em dash: a qualifier holds no seed.
    seed: null,
  }),
];

/* ── The drawer's rows ──────────────────────────────────────────────────── */

/**
 * The four events 7d and 4c actually draw, newest first.
 *
 * The drawer's own header claims six ("6 events · 2 upcoming · 4 completed"),
 * so two rows sit below the fold and the design never names them. They are not
 * here: an invented event is invented copy. See the report for the gap.
 *
 * `entryCount` / `playedCount` / `workingCount` are what `scheduleRowsFrom()`
 * would compute over each dual's nine lines; the two events with no detail pane
 * carry the completed shape their drawn team score implies.
 */
export const SCHEDULE_ROWS: ScheduleRow[] = [
  {
    id: RIDGELINE_ID,
    kind: "dual",
    name: "Ridgeline University",
    startsOn: "2025-09-26",
    endsOn: "2025-09-26",
    site: "home",
    // "lineup not set" — 7d says so in as many words.
    entryCount: 0,
    playedCount: 0,
    workingCount: 0,
    teamScore: null,
  },
  {
    id: FAIRMONT_ID,
    kind: "dual",
    name: "Fairmont A&M",
    startsOn: "2025-09-20",
    endsOn: "2025-09-20",
    site: "away",
    entryCount: 9,
    playedCount: 9,
    // S2 is analyzing.
    workingCount: 1,
    teamScore: { us: 5, them: 2 },
  },
  {
    id: ASH_ID,
    kind: "dual",
    name: "State College of Ash",
    startsOn: "2025-09-13",
    endsOn: "2025-09-13",
    site: "home",
    entryCount: 9,
    playedCount: 9,
    workingCount: 0,
    teamScore: { us: 6, them: 1 },
  },
  {
    id: HARLOW_ID,
    kind: "dual",
    name: "Harlow Valley",
    startsOn: "2025-09-06",
    endsOn: "2025-09-06",
    site: "away",
    entryCount: 9,
    playedCount: 9,
    workingCount: 0,
    teamScore: { us: 4, them: 3 },
  },
];

/**
 * Details for the events the design draws a pane for, keyed by event id.
 *
 * Deliberately partial — the same shape the live route builds, and the same
 * lookup that can miss. Only two of the four rows have a designed pane: 4c
 * resolves the Fairmont dual, and 7d describes the Ridgeline one as having no
 * lineup at all. Selecting a row with no entry here has a designed answer
 * already — 7d's prompt pane.
 */
export const EVENT_DETAILS: Record<string, EventDetail> = {
  [RIDGELINE_ID]: {
    event: RIDGELINE_EVENT,
    // "lineup not set".
    entries: [],
  },
  [FAIRMONT_ID]: {
    event: FAIRMONT_EVENT,
    entries: FAIRMONT_ENTRIES,
  },
};

/**
 * 3c's tournament, as the `EventDetail` it would become.
 *
 * Not on `SCHEDULE_ROWS`: 3c is the screen that *creates* it, so the schedule
 * has not got it yet. Listing a tournament the coach is still filling in would
 * contradict the artboard it comes from.
 */
export const TOURNAMENT_DETAIL: EventDetail = {
  event: BUCKEYE_EVENT,
  entries: BUCKEYE_ENTRIES,
};

/* ── The two schedule states ────────────────────────────────────────────── */

/**
 * One schedule's worth of fixture data.
 *
 * Composed from `ScheduleRow` and `EventDetail` — it redeclares neither, and it
 * is the same pair the live route already hands `ScheduleList`, so a component
 * taking this takes the loader's output unchanged later.
 */
export interface StaticSchedule {
  rows: ScheduleRow[];
  details: Record<string, EventDetail>;
}

/** 7d and 4c: four events, one of them resolved down to its nine lines. */
export const POPULATED_SCHEDULE: StaticSchedule = {
  rows: SCHEDULE_ROWS,
  details: EVENT_DETAILS,
};

/**
 * 7e: day zero.
 *
 * Two sets rather than one set behind a flag, because 7e is not 7d with the
 * rows removed — its header, its drawer sections and its pane are different
 * copy over a nine-line scaffold. A component that takes a `StaticSchedule`
 * renders either one through the same branch it already needs for an empty
 * list, and no boolean can drift out of step with `rows.length`.
 */
export const EMPTY_SCHEDULE: StaticSchedule = {
  rows: [],
  details: {},
};

/* ── The program directory, as 2c draws it ──────────────────────────────── */

/**
 * One row of `2c`'s school list.
 *
 * A pair of shapes the dormant code already uses, plus the one cell neither
 * of them holds — not a third row type:
 *
 *   `program`  `ProgramSearchResult`, exactly what `SchoolSearch` takes for
 *              both of its lists and what the dual route's `toDirectoryRow()`
 *              built a conference row into. `programKey` is the aggregation
 *              handle a chosen opponent is recorded by, so it is carried here
 *              rather than dropped for a name.
 *   `history`  `opponentDualHistory()`'s value type — the "you lead 2–1" half
 *              of every subline, and the last-played cell beside it. Rendered
 *              through `formatOpponentRecord()`, so the four phrases `2c`
 *              draws are the app's own vocabulary and not a second copy of it.
 *
 * ── `seasonRecord` is the one figure this app does not have ────────────────
 * `2c` draws an opponent's OWN season record ("18–4") as the third slot of
 * every subline. It comes from matches this program never played and never
 * saw, and `opponent-history.ts`'s header says so in as many words: "that
 * figure … does not exist anywhere in this app, so nothing below invents one."
 * The dormant `SchoolSearch` therefore omits it. The rebuild draws it, because
 * the artboard draws it — as the literal string the design wrote, the same
 * treatment `SEASON_FACTS` above gets, and reported rather than approximated.
 *
 * ── The one field below that is set and never rendered ─────────────────────
 * `history.lastPlayedOn` is documented as YYYY-MM-DD; `2c`'s mono cell is
 * MM-DD. The component slices the month and day off, so the year is chosen
 * here and appears nowhere on screen — the same class of unrendered required
 * value as `programKey` and `status`. Note this is NOT `formatLastPlayed()`,
 * which renders "12 Apr": `2c` draws "04-12", and the artboard wins.
 */
export interface DirectorySchool {
  program: ProgramSearchResult;
  history: OpponentDualHistory;
  /** "18–4" — the opponent's own season record. See above; literal as drawn. */
  seasonRecord: string;
}

/**
 * One directory row from what `2c` actually prints of it.
 *
 * `conference` and `division` are separate and both default to null because
 * the artboard prints only ONE of them per row — "Big Ten" on four rows and
 * "D-III" on the fifth — which is exactly `schoolRowSubline`'s
 * `conference ?? divisionLabel(division)`. Filling in the missing half would
 * be inventing a fact the design withheld.
 */
function directorySchool({
  schoolName,
  conference = null,
  division = null,
  seasonRecord,
  played = 0,
  us = 0,
  them = 0,
  lastPlayedOn = null,
}: {
  schoolName: string;
  conference?: string | null;
  division?: string | null;
  seasonRecord: string;
  played?: number;
  us?: number;
  them?: number;
  lastPlayedOn?: string | null;
}): DirectorySchool {
  return {
    program: {
      // Slugged from the drawn name, same `fixture-` convention as the event
      // ids above. `2c` draws no key; a row still needs the one field that
      // makes an opponent aggregatable across seasons.
      programKey: `fixture-program-${schoolName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")}-mens`,
      schoolName,
      // Every row's subline opens "Men's".
      team: "mens",
      division,
      conference,
      // `2c` prints no state and no claim state. `state` is nullable;
      // `ProgramStatus` is not, and "unclaimed" is what a directory row nobody
      // has claimed is. Neither reaches the screen.
      state: null,
      status: "unclaimed",
      // The owner projection belongs to the claim flow's definer RPC, and no
      // part of this screen shows who runs the other program — the same reason
      // the dual route's `toDirectoryRow()` gives for nulling it.
      ownerDisplay: null,
    },
    history: { played, us, them, lastPlayedOn },
    seasonRecord,
  };
}

/**
 * The viewer's conference, from `2c`'s first filter pill and the four rows
 * whose subline names it.
 *
 * Live, this is `getTeamSettings()`'s `program.conference`.
 */
export const OUR_CONFERENCE = "Big Ten";

/**
 * The viewer's division, from `2c`'s second pill — already label-formatted,
 * the way `divisionLabel()` hands it to `SchoolSearch`.
 */
export const OUR_DIVISION = "D-I";

/**
 * "5 of 1,940" — the search field's counter, and the run's copy for "all
 * programs".
 *
 * The 5 is derived (the two lists below hold five rows between them). The
 * total is this literal: `programs` has 1,940 rows — `ConferenceProgram`'s
 * `programKey` doc says so — but `/api/programs/search` answers with a capped
 * page of 8 and no total, so nothing this screen calls can produce it. Held as
 * a formatted string rather than a number so the comma is the design's and not
 * the render locale's.
 */
export const DIRECTORY_TOTAL = "1,940";

/** The term `2c` is mid-search on, in the field and in the free-text row. */
export const DIRECTORY_TERM = "Ridg";

/** `2c`'s "Your conference" section — two Big Ten rows, the first selected. */
export const CONFERENCE_SCHOOLS: DirectorySchool[] = [
  directorySchool({
    schoolName: "Ridgeline University",
    conference: OUR_CONFERENCE,
    seasonRecord: "18–4",
  }),
  directorySchool({
    schoolName: "Ridgemont Tech",
    conference: OUR_CONFERENCE,
    seasonRecord: "11–10",
    // "you lead 2–1", and a mono cell reading "04-12".
    played: 3,
    us: 2,
    them: 1,
    lastPlayedOn: "2025-04-12",
  }),
];

/**
 * `2c`'s "All programs" section — three rows.
 *
 * Ridgefield Academy is the row that carries a DIVISION where the other four
 * carry a conference. Reproduced as drawn; see the report.
 */
export const ALL_PROGRAM_SCHOOLS: DirectorySchool[] = [
  directorySchool({
    schoolName: "Ridgeway College",
    conference: "Coastal",
    seasonRecord: "14–7",
    // "you lead 1–0", and a mono cell reading "09-30".
    played: 1,
    us: 1,
    lastPlayedOn: "2024-09-30",
  }),
  directorySchool({
    schoolName: "Ridge Valley State",
    conference: "Mountain West",
    seasonRecord: "9–12",
  }),
  directorySchool({
    // "D-III" is `divisionLabel("D3")`, so the raw dataset value is what goes
    // in — the same string `programs.division` holds.
    schoolName: "Ridgefield Academy",
    division: "D3",
    seasonRecord: "16–5",
  }),
];

/* ── 3c's roster rail, and the field it feeds ───────────────────────────── */

/**
 * One row of `3c`'s left rail: a roster player, and the entry they are already
 * in — or null, meaning rostered and not entered.
 *
 * ── Why the pair is one row rather than two lists ──────────────────────────
 * `3c` is master–detail: the rail on the left and the entries list on the right
 * describe the same three people. Two parallel arrays joined by name or by
 * index is exactly how one player's seed ends up printed under another
 * player's name — the rail says "S1 · entered · seed 3" while the list says
 * "Marcus Reid · Seed 3" and nothing on screen looks broken. Pairing them here,
 * in one literal, means there is a single source per player and no join to get
 * wrong: `player.name` is the only name either pane renders, and `entry.draw` /
 * `entry.seed` are that same row's.
 *
 * `player` is `LadderPlayer` — what `getLadder()` returns and what the dormant
 * `RosterRail` already takes, so the re-wiring is the loader call coming back,
 * not a new prop shape. `entry` is an `EventEntry` out of `TOURNAMENT_DETAIL`
 * above, not a copy of one.
 *
 * ── The ladder positions are 3c's, not a derivation ────────────────────────
 * `3c` draws S1…S6 against the six names below, in that order. `ladderPosition`
 * is null in real data whenever a program never set a ladder; every row here
 * carries a number because the artboard prints one for every row.
 */
export interface TournamentFieldRow {
  player: LadderPlayer;
  /** The entry this player starts in, or null — rostered, not entered. */
  entry: EventEntry | null;
}

/**
 * The six names `3c` draws in the rail, in the order it draws them.
 *
 * The first three are the three `TOURNAMENT_DETAIL` entries, so the field the
 * right pane lists and the checked rows on the left are the same three rows of
 * this array. The last three are the rest of the roster, drawn with a `+`.
 *
 * `userId` is a fixture id in the shape a `program_players.id` occupies. It is
 * never rendered: it is the key the rail and the entries list agree on, which
 * is the whole point of it being here rather than a name.
 */
export const TOURNAMENT_FIELD: TournamentFieldRow[] = [
  {
    player: {
      userId: "fixture-player-brooks",
      name: "Dana Brooks",
      ladderPosition: 1,
    },
    // "S1 · entered · seed 3" on the rail, "Main draw · Seed 3" in the list.
    entry: BUCKEYE_ENTRIES[0],
  },
  {
    player: {
      userId: "fixture-player-reid",
      name: "Marcus Reid",
      ladderPosition: 2,
    },
    // "S2 · entered", "Main draw · Unseeded".
    entry: BUCKEYE_ENTRIES[1],
  },
  {
    player: {
      userId: "fixture-player-osei",
      name: "Rafael Osei",
      ladderPosition: 3,
    },
    // "S3 · qualifying", "Qualifying · —".
    entry: BUCKEYE_ENTRIES[2],
  },
  {
    player: {
      userId: "fixture-player-tanaka",
      name: "Sam Tanaka",
      ladderPosition: 4,
    },
    entry: null,
  },
  {
    player: {
      userId: "fixture-player-moreau",
      name: "Jules Moreau",
      ladderPosition: 5,
    },
    entry: null,
  },
  {
    player: {
      userId: "fixture-player-adeyemi",
      name: "Lena Adeyemi",
      ladderPosition: 6,
    },
    entry: null,
  },
];
