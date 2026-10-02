type Call = { action: string; input: unknown };

declare global {
  interface Window {
    actionCalls: Call[];
    failNextOutcome?: string;
    failNextScore?: string;
    failNextDelete?: string;
    opponentRoster?: string[];
    /** A roster per program key, for a flow that can change school. Falls
     *  back to `opponentRoster` for a key not listed. */
    opponentRosterByKey?: Record<string, string[]>;
    /** Every program key the roster was fetched for, in order. */
    rosterCalls: string[];
    /** Every "save to roster" the popup asked for, in order. */
    savedPlayers: { opponentProgramKey: string; name: string }[];
  }
}

window.rosterCalls = [];
window.savedPlayers = [];

export async function setOutcome(input: unknown) {
  window.actionCalls.push({ action: "setOutcome", input });
  if (window.failNextOutcome) {
    const error = window.failNextOutcome;
    window.failNextOutcome = undefined;
    return { error };
  }
  return { ok: true as const };
}

export async function recordResult(input: unknown) {
  window.actionCalls.push({ action: "recordResult", input });
  if (window.failNextScore) {
    const error = window.failNextScore;
    window.failNextScore = undefined;
    return { error };
  }
  return { matchId: "match-browser" };
}

export async function createTournament(input: unknown) {
  window.actionCalls.push({ action: "createTournament", input });
  return { eventId: "created-tournament" };
}

export async function updateTournament(input: unknown) {
  window.actionCalls.push({ action: "updateTournament", input });
  return { eventId: "event-browser" };
}

export async function deleteEvent(eventId: string) {
  window.actionCalls.push({ action: "deleteEvent", input: eventId });
  if (window.failNextDelete) {
    const error = window.failNextDelete;
    window.failNextDelete = undefined;
    return { error };
  }
  return { ok: true as const };
}

export async function opponentRosterForDual(opponentProgramKey: string) {
  window.rosterCalls.push(opponentProgramKey);
  const roster =
    window.opponentRosterByKey?.[opponentProgramKey] ??
    window.opponentRoster ??
    [];
  return {
    candidates: roster.map((name, index) => ({
      playerId: `roster-${index}`,
      name,
      lineupSpot: null,
      priorMeetings: 0,
    })),
  };
}

export async function saveOpponentPlayer(input: {
  opponentProgramKey: string;
  name: string;
}) {
  window.savedPlayers.push(input);
  return { saved: false };
}
