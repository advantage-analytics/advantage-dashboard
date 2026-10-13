/**
 * The one definition of **which day a match was played**, and how that day is
 * printed.
 *
 * ## The rule
 *
 * `matches.date` is a `timestamptz`, but it stores a CALENDAR DAY, not a
 * moment. Every writer puts the day the user picked in the value's UTC date
 * part:
 *
 * - the upload wizard writes `${pickedDay}T${HH:MM}:00` — zone-less, so
 *   Postgres (session zone UTC) reads it as UTC
 *   (`src/components/dashboard/matches/new-match-wizard/utils.ts`,
 *   `buildMatchData`'s `date`);
 * - the Edit Match dialog, schedule result recording and the admin tools write
 *   `${day}T12:00:00` ("It stores the day, not an instant" —
 *   `src/lib/matches/patch-match.ts`; `recordResult` in
 *   `src/lib/schedule/writes-server.ts`).
 *
 * So a match's day is the UTC date part of the stored value — equivalently the
 * leading `YYYY-MM-DD` of the ISO string PostgREST returns — and **the time
 * part is not a real time**. SQL says the same thing as
 * `(date at time zone 'utc')::date`.
 *
 * ## What that forbids
 *
 * `new Date(match.date)` followed by anything that reads the runtime's zone:
 * `getFullYear()` / `getMonth()` / `getDate()`, or `toLocaleDateString()`
 * without `timeZone: "UTC"`. On the server that is UTC on Vercel (right by
 * accident) and the developer's zone locally; in the browser it is the
 * viewer's zone, where a match stored at `00:00Z` prints as the previous day
 * for everyone west of Greenwich. One match then shows two different days on
 * two pages, and a server-rendered string disagrees with its client re-render.
 *
 * Everything here is zone-free: the day comes from the string, the labels are
 * built with `Date.UTC` and formatted with `timeZone: "UTC"` in a fixed
 * `en-US`. `tests/match-day.spec.ts` runs it under three process zones.
 *
 * ## "Today"
 *
 * The labels that compare against the present ("Today", "this year") take an
 * optional `today` — a `YYYY-MM-DD` or a `Date` — defaulting to the current
 * UTC day. That is deliberate and there is no zone setting: server and browser
 * must agree, and the server has only UTC.
 *
 * ## Labels read back
 *
 * Two server types (`DisplayMatch`, the match page's `Match`) carry the day
 * already printed — "September 28, 2026" — and client components shorten it.
 * `matchDay()` therefore also reads this module's own long and medium labels
 * ("September 28, 2026", "Sep 28, 2026"), by a month table rather than by
 * `new Date(label)`, so the short form of a label is the same day on every
 * machine and in every browser's date parser.
 *
 * Real moments (`created_at`, a job's `updated_at`, a membership's
 * `joined_at`) are NOT match days. They keep `shortDate()` /
 * `formatShortDate()`.
 *
 * Pure, no imports — safe in a client bundle and in a spec.
 */

/** Anything a match's date arrives as. */
export type MatchDateInput = string | Date | null | undefined;

/** A `YYYY-MM-DD`, or a `Date` whose UTC day is meant. */
export type TodayInput = string | Date;

const LEADING_DAY = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T ])/;
/** An explicit offset other than UTC at the end of a timestamp. */
const OFFSET = /([+-])(\d{2})(?::?(\d{2}))?$/;

/** This module's own long and medium labels: "September 28, 2026", "Sep 28, 2026". */
const LABEL = /^([A-Za-z]+) (\d{1,2}), (\d{4})$/;
const MONTH_NAMES = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

function utcDayOf(date: Date): string | null {
  const time = date.getTime();
  if (Number.isNaN(time)) return null;
  return `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** Whether y-m-d names a day that exists (no Feb 30, no month 13). */
function isRealDay(y: number, m: number, d: number): boolean {
  const probe = new Date(Date.UTC(y, m - 1, d));
  return (
    probe.getUTCFullYear() === y &&
    probe.getUTCMonth() === m - 1 &&
    probe.getUTCDate() === d
  );
}

/**
 * The day a match was played, as `YYYY-MM-DD` — or `null` when there is no
 * date or it cannot be read.
 *
 * A string gives up its leading date part: `2026-09-28T00:18:18.803+00:00`,
 * a zone-less `2026-09-28T12:00:00` and a bare `2026-09-28` are all the 28th.
 * A `Date` gives its UTC day. The one string that is not read off its front
 * is a timestamp carrying an explicit non-UTC offset (`…T23:30:00-07:00`),
 * which PostgREST never returns; it is converted, so the answer is still the
 * UTC day Postgres would store.
 *
 * It also reads back this module's own long and medium labels — see "Labels
 * read back" above.
 */
export function matchDay(date: MatchDateInput): string | null {
  if (date === null || date === undefined) return null;
  if (date instanceof Date) return utcDayOf(date);
  if (typeof date !== "string") return null;

  const lead = LEADING_DAY.exec(date);
  if (!lead) return dayOfLabel(date);
  const [y, m, d] = [Number(lead[1]), Number(lead[2]), Number(lead[3])];
  if (!isRealDay(y, m, d)) return null;

  if (date.length > 10) {
    const offset = OFFSET.exec(date.slice(10));
    if (offset && (Number(offset[2]) !== 0 || Number(offset[3] ?? 0) !== 0)) {
      // An absolute instant: parsing it does not consult the runtime's zone.
      return utcDayOf(new Date(date)) ?? `${lead[1]}-${lead[2]}-${lead[3]}`;
    }
  }
  return `${lead[1]}-${lead[2]}-${lead[3]}`;
}

/** "September 28, 2026" or "Sep 28, 2026" → "2026-09-28"; anything else → null. */
function dayOfLabel(text: string): string | null {
  const parts = LABEL.exec(text.trim());
  if (!parts) return null;
  const name = parts[1].toLowerCase();
  const month =
    MONTH_NAMES.findIndex(
      (full) => full === name || full.slice(0, 3) === name,
    ) + 1;
  const [y, d] = [Number(parts[3]), Number(parts[2])];
  if (month === 0 || !isRealDay(y, month, d)) return null;
  return `${pad(y, 4)}-${pad(month)}-${pad(d)}`;
}

/** The current UTC day — what every "today" below defaults to. */
export function utcToday(now: Date = new Date()): string {
  return utcDayOf(now) ?? "1970-01-01";
}

function resolveToday(today: TodayInput | undefined): string {
  if (today === undefined) return utcToday();
  return matchDay(today) ?? utcToday();
}

interface DayParts {
  year: number;
  month: number;
  day: number;
  /** UTC midnight of the day, in ms. Only ever formatted with `timeZone: "UTC"`. */
  utc: number;
}

function partsOf(day: string): DayParts {
  const year = Number(day.slice(0, 4));
  const month = Number(day.slice(5, 7));
  const dayOfMonth = Number(day.slice(8, 10));
  return {
    year,
    month,
    day: dayOfMonth,
    utc: Date.UTC(year, month - 1, dayOfMonth),
  };
}

/** The year a match was played in, or `null`. */
export function matchDayYear(date: MatchDateInput): number | null {
  const day = matchDay(date);
  return day ? Number(day.slice(0, 4)) : null;
}

/** UTC midnight of the match's day in ms — a chart's x value, never a time. */
export function matchDayTime(date: MatchDateInput): number | null {
  const day = matchDay(date);
  return day ? partsOf(day).utc : null;
}

/**
 * Whole days from the match's day to `today` — 0 today, 1 yesterday, negative
 * for a day still to come. `null` when the date cannot be read.
 */
export function matchDaysAgo(
  date: MatchDateInput,
  today?: TodayInput,
): number | null {
  const day = matchDay(date);
  if (!day) return null;
  return Math.round(
    (partsOf(resolveToday(today)).utc - partsOf(day).utc) / 86_400_000,
  );
}

/**
 * Oldest day first; a missing or unreadable date sorts last. Negate it for
 * newest-first. Two matches on one day compare equal — a caller that needs an
 * order within the day breaks the tie itself (the stored string still sorts).
 */
export function compareMatchDays(a: MatchDateInput, b: MatchDateInput): number {
  const dayA = matchDay(a);
  const dayB = matchDay(b);
  if (dayA === dayB) return 0;
  if (dayA === null) return 1;
  if (dayB === null) return -1;
  return dayA < dayB ? -1 : 1;
}

const formatter = (options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" });

const SHORT = formatter({ month: "short", day: "numeric" });
const SHORT_WITH_YEAR = formatter({
  month: "short",
  day: "numeric",
  year: "numeric",
});
const LONG = formatter({ month: "long", day: "numeric", year: "numeric" });
const MONTH = formatter({ month: "short" });

/** What a label prints for a date it cannot read: the text as given, or "". */
function unreadable(date: MatchDateInput): string {
  return typeof date === "string" ? date : "";
}

function label(date: MatchDateInput, format: Intl.DateTimeFormat): string {
  const day = matchDay(date);
  return day ? format.format(partsOf(day).utc) : unreadable(date);
}

/** "Sep 28". */
export function formatMatchDayShort(date: MatchDateInput): string {
  return label(date, SHORT);
}

/** "Sep 28, 2026" — the match page's short-month form. */
export function formatMatchDayMedium(date: MatchDateInput): string {
  return label(date, SHORT_WITH_YEAR);
}

/** "September 28, 2026". */
export function formatMatchDayLong(date: MatchDateInput): string {
  return label(date, LONG);
}

/** "Sep 28", or "Sep 28, 2025" once the match is not from this year. */
export function formatMatchDayShortYear(
  date: MatchDateInput,
  today?: TodayInput,
): string {
  const day = matchDay(date);
  if (!day) return unreadable(date);
  const sameYear = day.slice(0, 4) === resolveToday(today).slice(0, 4);
  return (sameYear ? SHORT : SHORT_WITH_YEAR).format(partsOf(day).utc);
}

/**
 * "Sep 14" this year, "Sep ’25" once it is not — the drawers' 40px mono track,
 * where "Sep 14, 2025" would run under the score.
 */
export function formatMatchDayCompact(
  date: MatchDateInput,
  today?: TodayInput,
): string {
  const day = matchDay(date);
  if (!day) return unreadable(date);
  const { utc } = partsOf(day);
  if (day.slice(0, 4) === resolveToday(today).slice(0, 4)) {
    return SHORT.format(utc);
  }
  return `${MONTH.format(utc)} ’${day.slice(2, 4)}`;
}

/**
 * "Today", "Yesterday", "N days ago", "Last week", then
 * `formatMatchDayShortYear`. A day still to come prints as its date.
 */
export function formatMatchDayRelative(
  date: MatchDateInput,
  today?: TodayInput,
): string {
  const ago = matchDaysAgo(date, today);
  if (ago === null) return unreadable(date);
  if (ago === 0) return "Today";
  if (ago === 1) return "Yesterday";
  if (ago > 1 && ago <= 6) return `${ago} days ago`;
  if (ago > 6 && ago <= 13) return "Last week";
  return formatMatchDayShortYear(date, today);
}
