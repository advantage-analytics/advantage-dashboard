/**
 * Every span of time the app writes as words, in one place.
 *
 * Three audiences, three functions. They used to share a name across three
 * files (`formatDuration` in the upload wizard, in `match-analysis.ts` and in
 * `match-utils.ts`) and disagreed on case, units and shape, so a match length
 * read "1H 34M" in a drawer and "1h 34m" in the stepper beside it.
 */

/**
 * A wait or an allowance, in whole minutes — "12 min", "1h", "1h 29m".
 * `formatEta`'s own arithmetic, shared so an estimate, an elapsed clock and a
 * reserved allowance ("1h 29m goes back…") cannot phrase the same span two
 * ways. Floors at one minute: a zero reads as nothing having happened.
 */
export function formatDuration(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/**
 * A span of SECONDS as "1h 47m", "35m", "2h" — the one for spans a person
 * reasons about in hours: a monthly allowance and a match length. Rounds to
 * the nearest minute, and carries into the hour so 59m 40s reads "1h".
 */
export function formatHoursMinutes(seconds: number): string {
  const totalMinutes = Math.round(Math.max(0, seconds) / 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/**
 * A recorded match length, from `matches.duration` (MILLISECONDS), as
 * "1h 34m". Empty when nobody recorded one, so a caller can `||` to a
 * placeholder. Floors to the whole minute, as the length always has.
 */
export function formatMatchDuration(ms: number | null | undefined): string {
  if (!ms || ms <= 0) return "";
  return formatHoursMinutes(Math.floor(ms / 60_000) * 60);
}

/** A length in whole minutes, split for a stat tile that sets its units apart. */
export function durationParts(minutes: number): {
  hours: number;
  mins: number;
} {
  return { hours: Math.floor(minutes / 60), mins: minutes % 60 };
}
