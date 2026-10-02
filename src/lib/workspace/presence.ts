/**
 * Whether the active workspace holds anything yet, per kind of thing.
 *
 * It exists for one job: letting a route's loading fallback draw a page's day
 * zero instead of a skeleton shaped like rows that will never arrive. The
 * fallback renders before the page has fetched anything, so it cannot learn
 * the answer from the page — the dashboard layout reads it once per request
 * (`getWorkspacePresence`) and each page corrects it as it renders
 * (`PresenceReport`), so a client navigation after the first upload does not
 * keep offering the empty state.
 *
 * It is a hint for the fallback, never the decision. Every page still decides
 * day zero from its own data; when the two disagree the page wins and the
 * fallback was merely the wrong placeholder for a moment.
 */
export interface WorkspacePresence {
  /** The workspace these flags describe — reports for another are ignored. */
  workspaceId: string;
  /** Any match in scope (personal: own, program-less; team: the program's). */
  matches: boolean;
  /** Any wizard draft the viewer left in this scope. */
  drafts: boolean;
  /** Team: any player on the roster. */
  roster: boolean;
  /** Team: an open invite or a pending join request — a person in flight. */
  rosterInFlight: boolean;
  /** Team: any dual on the schedule. */
  duals: boolean;
  /** Team: any event at all on the schedule. */
  events: boolean;
}

export type PresenceSurface =
  "home" | "matches" | "teamHome" | "roster" | "schedule";

/**
 * Each page's own day-zero rule, restated over presence flags. Keep these in
 * step with the page named beside each — they are the fallback's copy of it.
 */
const DAY_ZERO: Record<PresenceSurface, (p: WorkspacePresence) => boolean> = {
  // `(home)/page.tsx` — no personal match. Drafts do not count on Home.
  home: (p) => !p.matches,
  // `matches/(list)/page.tsx` — no match and no draft in flight.
  matches: (p) => !p.matches && !p.drafts,
  // `team/page.tsx` via `getTeamHomePresence`.
  teamHome: (p) => !p.matches && !p.roster && !p.duals,
  // `team/roster/page.tsx` — no player, no invite, no join request.
  roster: (p) => !p.roster && !p.rosterInFlight,
  // `static-schedule.tsx` — no schedule row, and a row is an event.
  schedule: (p) => !p.events,
};

export function isDayZero(
  surface: PresenceSurface,
  presence: WorkspacePresence,
): boolean {
  return DAY_ZERO[surface](presence);
}

/** What a failed read resolves to: "has data", so the skeleton shows. */
export function presentEverywhere(workspaceId: string): WorkspacePresence {
  return {
    workspaceId,
    matches: true,
    drafts: true,
    roster: true,
    rosterInFlight: true,
    duals: true,
    events: true,
  };
}
