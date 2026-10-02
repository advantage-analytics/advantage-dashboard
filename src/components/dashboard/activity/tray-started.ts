/**
 * When an in-flight tray row started, in the viewer's own words.
 *
 * The tray carries no elapsed clock — the mark says what is happening — but a
 * job that began yesterday is worth telling apart from one that began a minute
 * ago. So the row shows the day only ("Today", "Yesterday", "Sep 28") and the
 * exact time lives in the hover tooltip. Pure and clock-injected so a spec can
 * assert the strings; `timeZone` is the viewer's own unless a spec pins one.
 */

function dayKey(d: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function trayStartedDay(
  iso: string,
  now: Date = new Date(),
  timeZone?: string,
): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  const key = dayKey(at, timeZone);
  const today = dayKey(now, timeZone);
  if (key === today) return "Today";
  // Calendar arithmetic on the day string, not `now - 24h`: a daylight-saving
  // fall-back day is 25 hours long, and 24 hours earlier lands on the same day.
  const [y, m, d] = today.split("-").map(Number);
  const yesterday = new Date(Date.UTC(y, m - 1, d - 1))
    .toISOString()
    .slice(0, 10);
  if (key === yesterday) return "Yesterday";
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
  }).format(at);
}

/** "Started today at 2:41 PM" — the tooltip's sentence. */
export function trayStartedTitle(
  iso: string,
  now: Date = new Date(),
  timeZone?: string,
): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  const day = trayStartedDay(iso, now, timeZone);
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(at);
  const word =
    day === "Today" || day === "Yesterday" ? day.toLowerCase() : `on ${day}`;
  return `Started ${word} at ${time}`;
}
