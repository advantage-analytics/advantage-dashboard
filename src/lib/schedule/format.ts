/**
 * How the schedule words things.
 *
 * Shared because the list, the event hero and the upload wizard's group headers
 * all print the same span and the same site, and three spellings of "4–6 Sep"
 * is three chances to drift.
 */

import type { EventSite } from "./types";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
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

/** "Fri 26 Sep" — the hero's longer form. */
export function formatEventDay(iso: string): string {
  const date = localDate(iso);
  return `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

/** "4–6 Sep 2026" — the tournament eyebrow, which carries the year. */
export function formatEventSpanWithYear(
  startsOn: string,
  endsOn: string
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

/** "6–4 6–2", tiebreaks folded into the game count they belong to. */
export function formatScore(
  ours: number[] | undefined,
  theirs: number[] | undefined
): string {
  if (!ours?.length || !theirs?.length) return "";
  return ours
    .map((game, index) => `${game}–${theirs[index] ?? 0}`)
    .join(" ");
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
 * Consolation sits at the end because it is entered after the loss that sent a
 * player there — a run reads Q1, Q2, R32, R16, then C1, which is the sequence
 * the matches actually happened in.
 *
 * Shared by the round picker and the run's sort. `matches` has no `created_at`,
 * so this ladder IS the chronology; without it a run renders in whatever order
 * Postgres returned, and Osei's weekend read R32, Q1, Q2.
 */
export const ROUND_ORDER = [
  "Q1", "Q2", "Q3",
  "R128", "R64", "R32", "R16", "QF", "SF", "F",
  "C1", "C2", "C3",
];

/** Sort key for a round, or a large number for one we do not recognise. */
export function roundRank(round: string | null): number {
  if (!round) return Number.MAX_SAFE_INTEGER;
  const index = ROUND_ORDER.indexOf(round.toUpperCase());
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

/**
 * Which draw a round belongs to — read from the ROUND, not from the entry.
 *
 * `Q*` is qualifying, `C*` is consolation, anything else is the main draw. The
 * entry's `draw` records where a player STARTED; using it to label their later
 * rounds put a qualifier's R32 under "Qualifying" and hid the fact they had
 * come through, which is the one thing the segments exist to show.
 */
export function drawOfRound(round: string | null): string | null {
  if (!round) return null;
  const upper = round.toUpperCase();
  if (/^Q\d/.test(upper)) return "Qualifying";
  if (/^C\d/.test(upper)) return "Consolation";
  if (/^(R\d+|QF|SF|F)$/.test(upper)) return "Main draw";
  return null;
}
