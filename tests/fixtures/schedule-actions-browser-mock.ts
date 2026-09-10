type Call = { action: string; input: unknown };

declare global {
  interface Window {
    actionCalls: Call[];
    failNextScore?: string;
  }
}

export async function setOutcome(input: unknown) {
  window.actionCalls.push({ action: "setOutcome", input });
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
