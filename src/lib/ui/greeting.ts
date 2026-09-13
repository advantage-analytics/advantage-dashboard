/**
 * "Good morning" / "Good afternoon" / "Good evening", from an hour of the day.
 *
 * Takes the hour rather than reading a clock so the caller decides whose clock
 * it is. Every caller so far hands it the server's, computed once per request:
 * the word is rendered into the HTML, so a client-side answer would either
 * mismatch on hydration or flash in after first paint — and the header, where
 * Platform Audit Pa2 moved the personal Home greeting, is the most-looked-at
 * line on the page.
 */
export function timeOfDayGreeting(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}
