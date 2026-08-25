import { formatScoreText, scoreSetsFrom } from "@/lib/ui/score-format";

/**
 * Extract initials from a player name
 * Handles both single names and "Name & Partner" formats
 */
export function getInitials(name: string): string {
  // Handle "Player & Partner" format
  if (name.includes("&")) {
    const parts = name.split("&").map((p) => p.trim());
    return parts
      .map((p) => p.charAt(0).toUpperCase())
      .join("")
      .slice(0, 2);
  }

  // Handle regular names
  const words = name.trim().split(/\s+/);
  if (words.length === 1) {
    return words[0].charAt(0).toUpperCase();
  }

  // Return first and last initials
  return (
    words[0].charAt(0).toUpperCase() +
    words[words.length - 1].charAt(0).toUpperCase()
  );
}

/**
 * Abbreviate a player name to fit within maxLen characters.
 * Shortens middle names first, then the first name.
 */
export function shortName(name: string, maxLen = 14): string {
  if (name.length <= maxLen) return name;

  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name;

  const last = parts[parts.length - 1];

  // Abbreviate middle names first
  if (parts.length > 2) {
    const midInitials = parts.slice(1, -1).map((m) => `${m[0]}.`);
    const result = [parts[0], ...midInitials, last].join(" ");
    if (result.length <= maxLen) return result;
  }

  // Then abbreviate first name too
  const midInitials = parts.slice(1, -1).map((m) => `${m[0]}.`);
  return [`${parts[0][0]}.`, ...midInitials, last].join(" ");
}

/**
 * Format duration in minutes to "XHR YMIN" format
 */
export function formatDuration(
  minutes: number
): { hours: number; mins: number } {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return { hours, mins };
}

/**
 * Format raw hand/backhand values into the display strings used in the
 * scoreboard and upload preview. Unknown values are dropped, not echoed —
 * protects the UI from schema drift.
 */
export function formatPlayerStyle(
  hand: string | undefined,
  backhand: string | undefined,
): string[] {
  const parts: string[] = [];

  const h = hand?.trim().toLowerCase();
  if (h === "right" || h === "right-handed" || h === "right handed") {
    parts.push("RIGHT HANDED");
  } else if (h === "left" || h === "left-handed" || h === "left handed") {
    parts.push("LEFT HANDED");
  }

  const b = backhand?.trim().toLowerCase();
  if (b === "one-handed" || b === "one handed" || b === "1-handed" || b === "1 handed") {
    parts.push("1-HANDED BACKHAND");
  } else if (b === "two-handed" || b === "two handed" || b === "2-handed" || b === "2 handed") {
    parts.push("2-HANDED BACKHAND");
  }

  return parts;
}

/**
 * Map a match's raw `result` / `matchContext` string into the uppercase eyebrow
 * label shown in the scoreboard rail ("FINAL", "UNFINISHED", etc.).
 */
export function formatScoreboardStatus(matchContext: string | undefined): string {
  if (!matchContext) return "FINAL";
  const c = matchContext.toLowerCase();
  if (c.includes("unfinished")) return "UNFINISHED";
  if (c.includes("withdrew") || c.includes("withdrawn")) return "WITHDREW";
  if (c.includes("default")) return "DEFAULTED";
  return "FINAL";
}

/**
 * Shape of a match's `score` JSONB column. Per-set games for each player, with
 * optional tiebreak detail.
 */
export interface MatchScore {
  player1: number[];
  player2: number[];
  player1_tiebreaks?: (number | null)[];
  player2_tiebreaks?: (number | null)[];
}

/**
 * A per-set score from the user's perspective, as plain text — "6-4, 3-6, 7-5".
 * Returns "" when the score is missing or malformed.
 *
 * The spelling is not this function's to decide: it is `formatScoreText`'s, in
 * `@/lib/ui/score-format`, which is the one place the product's score notation
 * lives. All this adds is the shape the loaders actually hold — a raw
 * `matches.score` row plus "is the user player 1" — so that the
 * perspective-flip is spelled `swap: !isUserPlayer1` once here rather than at
 * every call site.
 *
 * Tiebreaks are deliberately absent. A superscript cannot survive a plain
 * string, and `formatScoreText` drops it rather than inventing a second
 * notation; render `<ScoreLine>` wherever markup is allowed.
 *
 * Until round 44 this returned a LEGACY space-joined form ("6-4 3-6 7-5") that
 * two of its three callers patched back with `.replaceAll(" ", ", ")`, while
 * the third rendered the old spacing on screen. Both the downgrade and the
 * patches are gone — do not add either back.
 */
export function buildScoreString(
  score: MatchScore | null,
  isUserPlayer1: boolean,
): string {
  if (!score?.player1?.length || !score?.player2?.length) return "";
  return formatScoreText(scoreSetsFrom(score, { swap: !isUserPlayer1 }));
}

/**
 * Who took the match, by counting sets — or null where the score cannot say.
 *
 * Null and false are different answers and some callers need them apart. A
 * scoreboard has already decided to show a result, so "no score" and "lost"
 * both render as a loss and `didUserWin` below is the right shape for it. A
 * strip of form ticks has not decided anything, and collapsing the two would
 * draw a red tick for a match nobody scored.
 */
export function matchOutcome(
  score: MatchScore | null,
  isUserPlayer1: boolean,
): boolean | null {
  if (!score?.player1?.length || !score?.player2?.length) return null;
  let p1Sets = 0;
  let p2Sets = 0;
  score.player1.forEach((s, i) => {
    if (s > (score.player2[i] ?? 0)) p1Sets++;
    else if ((score.player2[i] ?? 0) > s) p2Sets++;
  });
  if (p1Sets === p2Sets) return null;
  return isUserPlayer1 ? p1Sets > p2Sets : p2Sets > p1Sets;
}

/**
 * Determine whether the user won, by counting sets taken on each side.
 * Returns false for missing/malformed scores or ties.
 */
export function didUserWin(
  score: MatchScore | null,
  isUserPlayer1: boolean,
): boolean {
  return matchOutcome(score, isUserPlayer1) === true;
}

/**
 * A signed change, as the product draws it: an arrow, a magnitude and a colour.
 *
 * Colour is not decoration here. A bare "↓ 5" beside a percentage is a fact
 * whose direction a reader has to parse from a glyph; green and red say it
 * before they read anything. Green/red is reserved for outcome elsewhere in
 * this app, and a trend IS an outcome — the rate got better or it got worse.
 *
 * Zero is neither, and gets the neutral ink rather than a colour it has not
 * earned.
 */
export function formatDelta(delta: number): { label: string; color: string } {
  const rounded = Math.round(delta);
  if (rounded > 0) return { label: `↑ ${rounded}`, color: "var(--viz-good)" };
  if (rounded < 0) {
    return { label: `↓ ${Math.abs(rounded)}`, color: "var(--viz-bad)" };
  }
  return { label: "→ 0", color: "var(--ink-500)" };
}

/** "2026-08-08T…" → "Aug 8". */
export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/**
 * Format an ISO date into a relative/short label: "Today", "Yesterday",
 * "N days ago", "Last week", then a locale date ("May 1", "May 1, 2024").
 */
export function formatDisplayDate(isoDate: string): string {
  try {
    const d = new Date(isoDate);
    if (Number.isNaN(d.getTime())) return isoDate;
    const now = new Date();
    const dDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diffDays = Math.round(
      (nowDay.getTime() - dDay.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays > 1 && diffDays <= 6) return `${diffDays} days ago`;
    if (diffDays > 6 && diffDays <= 13) return "Last week";

    const sameYear = d.getFullYear() === now.getFullYear();
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      ...(sameYear ? {} : { year: "numeric" }),
    });
  } catch {
    return isoDate;
  }
}
