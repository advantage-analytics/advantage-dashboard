type Call = { action: string; input: unknown };

declare global {
  interface Window {
    actionCalls: Call[];
    failNextOutcome?: string;
    failNextScore?: string;
  }
}

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
