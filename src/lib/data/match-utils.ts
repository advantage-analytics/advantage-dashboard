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
