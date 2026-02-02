import mockData from "./mock.json";
import type { EventMatch, RecentEvent, MatchDetailedStats } from "./types";

interface MatchWithEvent extends EventMatch {
  tournamentName: string;
  date: string;
  matchType: string;
  courtType?: string;
  verificationStatus?: string;
}

/**
 * Fetch a match by ID with its parent event metadata
 */
export function getMatchById(matchId: string): MatchWithEvent | null {
  const events = mockData.recentEvents as RecentEvent[];

  for (const event of events) {
    const match = event.matches.find((m) => m.id === matchId);
    if (match) {
      return {
        ...match,
        tournamentName: event.tournamentName,
        date: event.date,
        matchType: event.matchType,
        courtType: event.courtType,
        verificationStatus: event.verificationStatus,
      };
    }
  }

  return null;
}

/**
 * Get statistics for a specific match
 */
export function getMatchStatistics(
  matchId: string
): MatchDetailedStats | null {
  const match = getMatchById(matchId);
  return match?.statistics || null;
}

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
 * Format duration in minutes to "XHR YMIN" format
 */
export function formatDuration(minutes: number): { hours: number; mins: number } {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return { hours, mins };
}

/**
 * Get all matches from all events
 */
export function getAllMatches(): MatchWithEvent[] {
  const events = mockData.recentEvents as RecentEvent[];
  const matches: MatchWithEvent[] = [];

  for (const event of events) {
    for (const match of event.matches) {
      matches.push({
        ...match,
        tournamentName: event.tournamentName,
        date: event.date,
        matchType: event.matchType,
        courtType: event.courtType,
        verificationStatus: event.verificationStatus,
      });
    }
  }

  return matches;
}
