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
