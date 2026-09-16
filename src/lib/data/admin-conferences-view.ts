import { divisionLongLabel } from "@/lib/data/programs-server";

/**
 * The client-safe half of the Admin › Conferences data layer — the row types
 * and the pure view/sort/meta helpers, with no server import anywhere in the
 * graph.
 *
 * Split out of `admin-conferences-server.ts` because that module imports
 * `@/lib/supabase/server` (and through it `next/headers`) at top level, so a
 * client component importing `applyConferenceView` from it would pull the
 * server client into the browser bundle. `ConferencesPageContent` filters and
 * sorts on the client (all 137 rows load once, the view and sort are URL
 * state), so it imports from here; the server module re-exports everything
 * below so existing server-side imports keep working.
 *
 * `programs-server.ts` is client-safe despite its name — a type import and
 * pure label helpers — and client components already import from it.
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type AdminConferencesView = "all" | "on_advantage" | "missing";

export type AdminConferencesSort = "most_teams" | "name_asc";

export type ConferenceSquads = "mens" | "womens" | "both" | null;

export interface AdminConferenceRow {
  id: string;
  name: string;
  shortName: string | null;
  /** Raw column value — `'D1'`, not `'D-I'`. */
  division: string | null;
  website: string | null;
  /** "Ivy League (IVY)" — what `programs.conference` mirrors. */
  label: string;
  /** Every program pointing here. */
  teams: number;
  /** Programs in `active` or `claim_pending`. */
  onAdvantage: number;
  /** Programs in `active`. */
  pilot: number;
  /** Distinct `school_group`s — a school with both squads counts once. */
  schools: number;
  squads: ConferenceSquads;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * The three pills. "Missing details" is any of the three optional fields the
 * drawer can fill in still being empty.
 */
export function applyConferenceView(
  rows: readonly AdminConferenceRow[],
  view: AdminConferencesView,
): AdminConferenceRow[] {
  switch (view) {
    case "on_advantage":
      return rows.filter((row) => row.onAdvantage > 0);
    case "missing":
      return rows.filter(
        (row) =>
          row.shortName === null ||
          row.website === null ||
          row.division === null,
      );
    case "all":
    default:
      return [...rows];
  }
}

/** Never mutates its input. Ties in `most_teams` break by name. */
export function sortConferences(
  rows: readonly AdminConferenceRow[],
  sort: AdminConferencesSort,
): AdminConferenceRow[] {
  const byName = (a: AdminConferenceRow, b: AdminConferenceRow) =>
    a.name.localeCompare(b.name);

  if (sort === "most_teams") {
    return [...rows].sort((a, b) => b.teams - a.teams || byName(a, b));
  }
  return [...rows].sort(byName);
}

const SQUADS_PHRASE: Record<Exclude<ConferenceSquads, null>, string> = {
  both: "men's and women's",
  mens: "men's only",
  womens: "women's only",
};

/**
 * "Division I · 8 schools, men's and women's". Each half is dropped when it
 * has nothing to say: no division, or no programs (0 schools, no squads).
 */
export function conferenceMeta(
  row: Pick<AdminConferenceRow, "division" | "schools" | "squads">,
): string {
  const division = divisionLongLabel(row.division);

  const schoolsPart =
    row.schools > 0
      ? `${row.schools} ${row.schools === 1 ? "school" : "schools"}`
      : null;
  const squadsPart = row.squads ? SQUADS_PHRASE[row.squads] : null;
  const composition = [schoolsPart, squadsPart].filter(Boolean).join(", ");

  return [division, composition || null].filter(Boolean).join(" · ");
}
