/**
 * How the schedule words things.
 *
 * Shared because the list, the event hero and the upload wizard's group headers
 * all print the same span and the same site, and three spellings of "4–6 Sep"
 * is three chances to drift.
 */

import type { Discipline, EventFormat, EventSite } from "./types";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Parse a YYYY-MM-DD as a LOCAL date.
 *
 * `new Date("2026-09-26")` is parsed as UTC midnight and then rendered in local
 * time, which puts it on the 25th for anyone west of Greenwich. These columns
 * are dates, not instants — the day a dual was played does not move with the
 * reader.
 */
function localDate(iso: string): Date {
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

/** "26 Sep", or "4–6 Sep" when a tournament runs across days. */
export function formatEventSpan(startsOn: string, endsOn: string): string {
  const start = localDate(startsOn);
  const end = localDate(endsOn);

  const startMonth = MONTHS[start.getMonth()];
  const endMonth = MONTHS[end.getMonth()];

  if (startsOn === endsOn) return `${start.getDate()} ${startMonth}`;
  if (startMonth === endMonth) {
    return `${start.getDate()}–${end.getDate()} ${startMonth}`;
  }
  return `${start.getDate()} ${startMonth} – ${end.getDate()} ${endMonth}`;
}

/**
 * "Aug 8" — a schedule date in the matches list's own short form.
 *
 * Parsed as a local calendar day, like everything else in this file. Not
 * `shortDate()` from `match-utils.ts`: that takes an instant, and a bare
 * YYYY-MM-DD handed to it is read as UTC midnight, which west of Greenwich is
 * the evening before — Team Home's dual history printed every dual a day
 * early until this existed.
 */
export function formatEventShortDay(iso: string): string {
  const date = localDate(iso);
  return `${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

/**
 * "3/14" — a column header on Team Home's court-record mosaic.
 *
 * The narrowest true date: 9px is the type scale's floor and "Mar 14" at 9px
 * is wider than the 24px column it heads, so the month goes numeric. Month
 * first because the program is a US collegiate one, and every other date on
 * the page ("Aug 8", "Sat, Aug 8") already leads with the month.
 */
export function formatEventNumericDay(iso: string): string {
  const date = localDate(iso);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

/** "Fri 26 Sep" — the hero's longer form. */
export function formatEventDay(iso: string): string {
  const date = localDate(iso);
  return `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

/** "4–6 Sep 2026" — the tournament eyebrow, which carries the year. */
export function formatEventSpanWithYear(
  startsOn: string,
  endsOn: string,
): string {
  return `${formatEventSpan(startsOn, endsOn)} ${localDate(endsOn).getFullYear()}`;
}

export function siteLabel(site: EventSite): string {
  if (site === "home") return "home";
  if (site === "away") return "away";
  return "neutral";
}

/** Sentence-cased, for the hero's facts line rather than a row's sub-label. */
export function siteTitle(site: EventSite): string {
  return siteLabel(site).charAt(0).toUpperCase() + siteLabel(site).slice(1);
}

/**
 * Today, as YYYY-MM-DD in the reader's own zone.
 *
 * Built from local components, never `toISOString().slice(0, 10)` — that is
 * UTC, and it opens a coach's evening on tomorrow's date. Shared because both
 * builders default a date field to today and two copies of this is two chances
 * to reach for the UTC form.
 */
export function todayISO(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/** The month a college season turns over — fall play starts in August. */
const SEASON_START_MONTH = 8;

/**
 * The academic-year season a date falls in: `"2026–27"` from Aug 1, 2026
 * through Jul 31, 2027. En dash, two-digit second year.
 *
 * Derived, never stored. A season a coach typed went stale every August and
 * nothing read it; the calendar can't disagree with itself.
 */
export function academicSeason(isoDate: string): string {
  const year = Number(isoDate.slice(0, 4));
  const month = Number(isoDate.slice(5, 7));
  const start = month >= SEASON_START_MONTH ? year : year - 1;
  return `${start}–${String(start + 1).slice(2)}`;
}

/**
 * The four match formats, as the pair of values that actually reaches the
 * database — and nothing else.
 *
 * ── Why this is shared and the labels are not ──────────────────────────────
 * `2b` and `3c` word this cell differently ("Best of 3 sets · no-ad" against
 * "Bo3 · no-ad"), so each builder keeps its own labels. What they must never
 * word differently is `bestOf` and `adScoring`: those are the values
 * `createDual` and `createTournament` store as `program_events.format`, which
 * `docs/ui-revamp-guardrails.md` §3.1 and §4 govern, and which caused a real
 * outage the last time a format reached the vendor wrong. Two hand-written
 * copies of four boolean pairs is exactly the drift those sections warn about.
 *
 * `adScoring` is `boolean` here, never `boolean | null`: a null is a compile
 * error rather than a convention, which is the whole reason the old
 * `"<bestOf>|<adScoring>"` string encoding was removed from both screens.
 */
export type EventFormatValue =
  "bo3-no-ad" | "bo3-ad" | "one-set-no-ad" | "one-set-ad";

export const EVENT_FORMATS: readonly {
  value: EventFormatValue;
  bestOf: number;
  adScoring: boolean;
}[] = [
  { value: "bo3-no-ad", bestOf: 3, adScoring: false },
  { value: "bo3-ad", bestOf: 3, adScoring: true },
  { value: "one-set-no-ad", bestOf: 1, adScoring: false },
  { value: "one-set-ad", bestOf: 1, adScoring: true },
];

/**
 * A saved event's format as the option name the builders select by, or
 * `undefined` when no row states that pair.
 *
 * A lookup over the table above, never a parse: `EVENT_FORMATS` states each
 * pair as literals, so this either finds the row or finds nothing. Nothing is
 * the honest answer for an event whose `ad_scoring` is null — the state
 * `docs/ui-revamp-guardrails.md` §3.1 and §4 exist about — and the draft hook
 * then opens on its own default rather than on a `false` invented here to make
 * the lookup succeed.
 *
 * Lives here rather than in either edit flow because both need it and a second
 * copy is a second place for the encoding to come back.
 */
export function formatValueOf(format: {
  bestOf: number;
  adScoring: boolean | null;
}): EventFormatValue | undefined {
  return EVENT_FORMATS.find(
    (option) =>
      option.bestOf === format.bestOf && option.adScoring === format.adScoring,
  )?.value;
}

/**
 * How long a doubles set runs: one set to 6 (tiebreak at 6-6) or an 8-game
 * pro-set (tiebreak at 8-8). College doubles is one set either way, so the
 * set length is the only thing a program actually chooses.
 */
export type DoublesGamesTo = 6 | 8;

export type DoublesFormatValue =
  "set-to-6-no-ad" | "set-to-6-ad" | "pro-set-8-no-ad" | "pro-set-8-ad";

/**
 * The four doubles formats, as `program_events.format.doubles` stores them
 * (`{ games_to, ad_scoring }`). Same rule as `EVENT_FORMATS`: an option name
 * looked up, never parsed, with both values stated as literals.
 *
 * Doubles carries its own ad/no-ad because it is not always the singles
 * answer — high-school doubles is often played with ad scoring.
 */
export const EVENT_DOUBLES_FORMATS: readonly {
  value: DoublesFormatValue;
  gamesTo: DoublesGamesTo;
  adScoring: boolean;
}[] = [
  { value: "set-to-6-no-ad", gamesTo: 6, adScoring: false },
  { value: "set-to-6-ad", gamesTo: 6, adScoring: true },
  { value: "pro-set-8-no-ad", gamesTo: 8, adScoring: false },
  { value: "pro-set-8-ad", gamesTo: 8, adScoring: true },
];

/**
 * What a doubles line plays when its event never recorded a doubles format —
 * every dual saved before the field existed. One set to 6 is the NCAA default.
 */
export const DEFAULT_DOUBLES_GAMES_TO: DoublesGamesTo = 6;

/**
 * A saved event's doubles format as an option name, or `undefined` — for an
 * event with no doubles format, or one whose `adScoring` is null. Nothing is
 * the honest answer there, as in `formatValueOf`: the draft opens on its own
 * default rather than a `false` invented to make the lookup succeed.
 */
export function doublesFormatValueOf(
  doubles: EventFormat["doubles"],
): DoublesFormatValue | undefined {
  if (!doubles) return undefined;
  return EVENT_DOUBLES_FORMATS.find(
    (option) =>
      option.gamesTo === doubles.gamesTo &&
      option.adScoring === doubles.adScoring,
  )?.value;
}

/**
 * The format ONE line plays, from its event's format and its discipline.
 *
 * Singles lines play the event's `bestOf` in 6-game sets. A doubles line plays
 * one set of `doubles.gamesTo` with `doubles.adScoring` — or, for an event
 * that predates the field, the default length and the singles `adScoring`,
 * null included. The one place the split is decided, so the score page, the
 * preset and the saved match agree.
 */
export function lineFormat(
  format: EventFormat,
  discipline: Discipline | undefined,
): { bestOf: number; adScoring: boolean | null; gamesTo: number } {
  if (discipline !== "doubles") {
    return { bestOf: format.bestOf, adScoring: format.adScoring, gamesTo: 6 };
  }
  return {
    bestOf: 1,
    adScoring: format.doubles ? format.doubles.adScoring : format.adScoring,
    gamesTo: format.doubles?.gamesTo ?? DEFAULT_DOUBLES_GAMES_TO,
  };
}

/** The label both the wizard and the event page print for a set length. */
export function doublesSetLabel(gamesTo: DoublesGamesTo): string {
  return gamesTo === 8 ? "8-Game Pro-Set" : "One Set to 6";
}

/**
 * "Brooks / Reid" → ["Brooks", "Reid"].
 *
 * Applied at the BOUNDARIES — on submit, and when comparing against the roster
 * — never on every keystroke. Trimming as the user types eats the space they
 * just pressed, so "Dana Brooks" can only ever be typed as "DanaBrooks": the
 * field looks broken and there is no error to explain it.
 */
export function splitNames(text: string): string[] {
  return text
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * Tournament rounds, in the order a weekend is played.
 *
 * Five draws, laid end to end in the order a player can pass through them —
 * the flights of the ITA's own draws page (2026 ITA Men's All-American):
 *
 * - `PQ1`–`PQ4` **Prequalifying** — the site's R256→F flight
 * - `PC1`–`PC4` **PQ Consolation** — its R128→F flight, entered on a
 *   prequalifying loss
 * - `Q1`–`Q3`   **Qualifying** — one draw here; the site's regional sections
 *   are not modelled
 * - `R256`–`F`  **Main draw**
 * - `C1`–`C5`   **Consolation** — the main draw's consolation stage
 *
 * The non-main draws keep ORDINAL codes (Q1, C1, PQ1) rather than the site's
 * sized ones, matching the `Q*` and `C*` convention every stored round already uses.
 * Each consolation sits after the draw that feeds it because it is entered
 * after the loss that sent a player there — a run reads Q1, Q2, R32, R16,
 * then C1, which is the sequence the matches actually happened in.
 *
 * Shared by the round picker and the run's sort. `matches` has no `created_at`,
 * so this ladder IS the chronology; without it a run renders in whatever order
 * Postgres returned, and Osei's weekend read R32, Q1, Q2.
 *
 * `matches.round` and `program_event_entries.draw` are free text, so adding a
 * code here needs no migration. `program_event_outcomes.round` is NOT: its
 * check constraint still names the older thirteen codes — `OUTCOME_ROUNDS`
 * below (mirrored in `tests/database/fixtures/admin-schedule-harness.mjs`).
 */
export const ROUND_ORDER = [
  "PQ1",
  "PQ2",
  "PQ3",
  "PQ4",
  "PC1",
  "PC2",
  "PC3",
  "PC4",
  "Q1",
  "Q2",
  "Q3",
  "R256",
  "R128",
  "R64",
  "R32",
  "R16",
  "QF",
  "SF",
  "F",
  "C1",
  "C2",
  "C3",
  "C4",
  "C5",
];

/**
 * The rounds `program_event_outcomes.round`'s check constraint accepts — the
 * thirteen-code ladder from before Prequalifying, PQ Consolation, R256, C4 and
 * C5 were added. A subset of `ROUND_ORDER`, in its order.
 *
 * The admin result form writes outcomes (forfeit, default, withdrawal), so it
 * offers and validates against this list, not the whole ladder: offering PQ1
 * there would let an admin pick a round the database then refuses. Widening it
 * takes a migration on that constraint, which T10 deliberately did not ship.
 */
export const OUTCOME_ROUNDS: readonly string[] = [
  "Q1",
  "Q2",
  "Q3",
  "R128",
  "R64",
  "R32",
  "R16",
  "QF",
  "SF",
  "F",
  "C1",
  "C2",
  "C3",
];

/** Sort key for a round, or a large number for one we do not recognise. */
export function roundRank(round: string | null): number {
  if (!round) return Number.MAX_SAFE_INTEGER;
  const index = ROUND_ORDER.indexOf(round.toUpperCase());
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

/**
 * A round code as a sentence says it — "QF" → "the quarter-final".
 *
 * The article is PART of the label, because every caller drops it straight into
 * a clause ("out in the quarter-final", "through the round of 16") and a
 * qualifying or consolation round takes no article at all. Splitting the two
 * apart would put the decision in each caller and give us "out in the
 * qualifying round 2" the first time one of them guessed.
 *
 * Covers `ROUND_ORDER` and nothing else: an unrecognised code comes back
 * verbatim rather than being dressed up, so a run built on a round we do not
 * know still prints an honest string.
 */
const ROUND_LONG: Record<string, string> = {
  PQ1: "prequalifying round 1",
  PQ2: "prequalifying round 2",
  PQ3: "prequalifying round 3",
  PQ4: "prequalifying round 4",
  PC1: "PQ consolation round 1",
  PC2: "PQ consolation round 2",
  PC3: "PQ consolation round 3",
  PC4: "PQ consolation round 4",
  Q1: "qualifying round 1",
  Q2: "qualifying round 2",
  Q3: "qualifying round 3",
  R256: "the round of 256",
  R128: "the round of 128",
  R64: "the round of 64",
  R32: "the round of 32",
  R16: "the round of 16",
  QF: "the quarter-final",
  SF: "the semi-final",
  F: "the final",
  C1: "consolation round 1",
  C2: "consolation round 2",
  C3: "consolation round 3",
  C4: "consolation round 4",
  C5: "consolation round 5",
};

export function roundLongLabel(code: string): string {
  return ROUND_LONG[code.toUpperCase()] ?? code;
}

/** The draw names `drawOfRound` answers with — and the stored values of
 *  `program_event_entries.draw` for the three a coach can enter a player in
 *  (the builder's `DRAWS`). */
export const PREQUALIFYING = "Prequalifying";
export const PQ_CONSOLATION = "PQ Consolation";
export const QUALIFYING = "Qualifying";
export const MAIN_DRAW = "Main draw";
export const CONSOLATION = "Consolation";

/**
 * Which draw a round belongs to — read from the ROUND, not from the entry.
 *
 * `PQ*` is prequalifying, `PC*` its consolation, `Q*` qualifying, `C*` the main
 * draw's consolation, and `R*`/`QF`/`SF`/`F` the main draw. The entry's `draw`
 * records where a player STARTED; using it to label their later rounds put a
 * qualifier's R32 under "Qualifying" and hid the fact they had come through,
 * which is the one thing the segments exist to show.
 */
export function drawOfRound(round: string | null): string | null {
  if (!round) return null;
  const upper = round.toUpperCase();
  if (/^PQ\d/.test(upper)) return PREQUALIFYING;
  if (/^PC\d/.test(upper)) return PQ_CONSOLATION;
  if (/^Q\d/.test(upper)) return QUALIFYING;
  if (/^C\d/.test(upper)) return CONSOLATION;
  if (/^(R\d+|QF|SF|F)$/.test(upper)) return MAIN_DRAW;
  return null;
}

/**
 * Which draw an entry STARTED in, read loosely from the free-text
 * `program_event_entries.draw` field: "prequal" and "qualif" rather than an
 * exact match, since older rows spell it their own way. Prequalifying is
 * tested first because the word contains "qualif". Anything else — empty,
 * "Main", or a custom flight name — is "main"; the caller decides what label
 * or starting round that maps to.
 */
export type StartingDrawKind = "prequalifying" | "qualifying" | "main";

export function classifyStartingDraw(
  draw: string | null | undefined,
): StartingDrawKind {
  const lower = (draw ?? "").toLowerCase();
  if (lower.includes("prequal")) return "prequalifying";
  if (lower.includes("qualif")) return "qualifying";
  return "main";
}

/**
 * "Sat, Sep 20" — the schedule drawer's date glyph (design `Tc2`), which
 * words the day differently from the row beside it ("Sat 20 Sep"). Both are
 * the design's; this one carries the comma and puts the month first.
 *
 * A tournament is a span, so it prints both ends: "Fri, Jan 16 – Sun, Jan 18".
 */
export function formatEventDayLong(iso: string): string {
  const date = localDate(iso);
  return `${WEEKDAYS[date.getDay()]}, ${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

export function formatEventDatesLong(startsOn: string, endsOn: string): string {
  if (startsOn === endsOn) return formatEventDayLong(startsOn);
  return `${formatEventDayLong(startsOn)} – ${formatEventDayLong(endsOn)}`;
}

/**
 * The start times the dual builder offers: every half hour from 6:00 AM to
 * 9:00 PM, as the "HH:MM" `program_events.starts_at_time` stores.
 */
export const EVENT_START_TIMES: readonly string[] = Array.from(
  { length: 31 },
  (_, index) => {
    const minutes = 6 * 60 + index * 30;
    const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
    const mm = String(minutes % 60).padStart(2, "0");
    return `${hh}:${mm}`;
  },
);

/**
 * "1:30 PM" from "13:30" (or Postgres's "13:30:00"). A wall-clock time, never
 * an instant — it is the time on the schedule, not shifted by the reader's zone.
 */
export function formatEventTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m ?? 0).padStart(2, "0")} ${suffix}`;
}

/**
 * "Hard" — a surface as the drawer prints it. The column holds whatever a
 * builder wrote ("hard", "Hard", "Indoor Hard"), so only the first letter is
 * touched: enough to read as a label, without re-casing a value someone typed.
 */
export function surfaceTitle(surface: string): string {
  return surface.charAt(0).toUpperCase() + surface.slice(1);
}

/**
 * "Best of 3 Sets · No-Ad Scoring" — the event page's format capsule.
 *
 * Two halves joined by a middot, and the SCORING half is dropped entirely when
 * `adScoring` is null. Null is a real state (`EventFormat.adScoring` says so:
 * the vision pipeline rejects a job without it), so the capsule must not print
 * a guess — "Best of 3 Sets" with nothing after it reads as "not chosen yet",
 * where "Best of 3 Sets · Ad Scoring" would be a wrong answer that looks like a
 * real one. `EVENT_FORMATS` above holds the four pairs a builder can WRITE;
 * this labels whatever a stored event turns out to carry, which is why it takes
 * `EventFormat` (nullable) and not `EventFormatValue`.
 *
 * Title Case is the design's, and it is the page's, not the row's — the
 * schedule table's cells stay sentence case.
 */
export function formatLabel(format: EventFormat): string {
  const sets =
    format.bestOf === 1 ? "One Set" : `Best of ${format.bestOf} Sets`;
  return withScoring(sets, format.adScoring);
}

/** "Ad Scoring" or "No-Ad Scoring" — the one spelling every label uses. */
export function scoringWords(adScoring: boolean): string {
  return adScoring ? "Ad Scoring" : "No-Ad Scoring";
}

/**
 * `sets · scoring`, or `sets` alone when the scoring is null — the rule
 * `formatLabel` documents, kept in one place so the singles and doubles
 * capsules cannot drift into guessing a null differently.
 */
function withScoring(sets: string, adScoring: boolean | null): string {
  return adScoring === null ? sets : `${sets} · ${scoringWords(adScoring)}`;
}

/**
 * "Doubles · 8-Game Pro-Set · Ad Scoring" — the second capsule on a dual, or null when the
 * event never recorded a doubles format (a tournament, or a dual saved before
 * the field existed). Null prints nothing rather than a guessed default.
 */
export function doublesFormatLabel(format: EventFormat): string | null {
  if (!format.doubles) return null;
  return withScoring(
    `Doubles · ${doublesSetLabel(format.doubles.gamesTo)}`,
    format.doubles.adScoring,
  );
}

/**
 * `formatLabel`, prefixed "Singles · " when a doubles label will print beside
 * it — so neither capsule leaves the reader guessing which lines it covers.
 * An event with no doubles format keeps the bare label it always had.
 */
export function singlesFormatLabel(format: EventFormat): string {
  return format.doubles
    ? `Singles · ${formatLabel(format)}`
    : formatLabel(format);
}
