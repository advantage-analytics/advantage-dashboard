import { cache } from "react";

import { requireAdminOrNotFound } from "@/lib/services/programs/admin-guard";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  divisionLongLabel,
  programDisplayName,
} from "@/lib/data/programs-server";
import { crestUrl } from "@/lib/data/teams-server";

/**
 * The Admin › Conferences page — the 137 conferences the directory's programs
 * point at, with the counts the table draws.
 *
 * ── Session client vs. service role ─────────────────────────────────────────
 * The list comes from `admin_list_conferences()` through the SESSION client:
 * it is `security definer` and gates on `is_admin()` from `auth.uid()`, which
 * the service key would leave null. The service role is used only where an
 * admin has no membership path — the "teams with no conference" count and the
 * per-conference team listing (`programs` rows plus crests).
 *
 * The pure helpers below (`applyConferenceView`, `sortConferences`,
 * `conferenceMeta`) sit in this module the way `cursorFor`/`parseCursor` sit in
 * `admin-teams-server.ts`: nothing here runs at import time, so a pure spec can
 * import them directly.
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

export interface AdminConferencesData {
  rows: AdminConferenceRow[];
  /** Programs with no `conference_id` at all. */
  unplaced: number;
}

export interface AdminConferenceTeam {
  id: string;
  /** "Stanford Women's Tennis". */
  name: string;
  crestUrl: string | null;
  status: string;
}

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

/** One row of `admin_list_conferences()`'s `returns table`, column for column. */
interface RawConferenceRow {
  id: string;
  name: string;
  short_name: string | null;
  division: string | null;
  website: string | null;
  label: string;
  teams: number;
  on_advantage: number;
  pilot: number;
  schools: number;
  has_mens: boolean;
  has_womens: boolean;
  updated_at: string;
}

export function squadsFor(
  hasMens: boolean,
  hasWomens: boolean,
): ConferenceSquads {
  if (hasMens && hasWomens) return "both";
  if (hasMens) return "mens";
  if (hasWomens) return "womens";
  return null;
}

export function toAdminConferenceRow(
  raw: RawConferenceRow,
): AdminConferenceRow {
  return {
    id: raw.id,
    name: raw.name,
    shortName: raw.short_name,
    division: raw.division,
    website: raw.website,
    label: raw.label,
    teams: Number(raw.teams) || 0,
    onAdvantage: Number(raw.on_advantage) || 0,
    pilot: Number(raw.pilot) || 0,
    schools: Number(raw.schools) || 0,
    squads: squadsFor(Boolean(raw.has_mens), Boolean(raw.has_womens)),
    updatedAt: raw.updated_at,
  };
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

// ---------------------------------------------------------------------------
// Loaders
// ---------------------------------------------------------------------------

/**
 * Every conference with its counts, plus how many programs sit in none.
 *
 * `cache()`d so the page and anything nested under it share one pair of
 * round trips per render.
 */
export const listAdminConferences = cache(
  async (): Promise<AdminConferencesData> => {
    await requireAdminOrNotFound();

    // SESSION client: `admin_list_conferences` gates on `is_admin()`.
    const supabase = await createClient();
    const admin = createAdminClient();

    const [listResult, unplacedResult] = await Promise.all([
      supabase.rpc("admin_list_conferences"),
      admin
        .from("programs")
        .select("id", { count: "exact", head: true })
        .is("conference_id", null),
    ]);

    if (listResult.error) {
      console.error("[admin conferences] could not list conferences", {
        error: listResult.error.message,
      });
    }
    if (unplacedResult.error) {
      console.error("[admin conferences] could not count unplaced programs", {
        error: unplacedResult.error.message,
      });
    }

    const raw = (listResult.data ?? []) as unknown as RawConferenceRow[];

    return {
      rows: raw.map(toAdminConferenceRow),
      unplaced: unplacedResult.count ?? 0,
    };
  },
);

/**
 * The programs in one conference, for the drawer's Teams section — school
 * then squad, the order the Teams table uses.
 *
 * Service role: an admin is not a member of these programs, and the drawer
 * needs every one of them.
 */
export async function getAdminConferenceTeams(
  conferenceId: string,
): Promise<AdminConferenceTeam[]> {
  await requireAdminOrNotFound();
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("programs")
    .select("id, school_name, team, status, crest_path")
    .eq("conference_id", conferenceId)
    .order("school_name", { ascending: true })
    .order("team", { ascending: true });

  if (error) {
    console.error("[admin conferences] could not list teams", {
      conferenceId,
      error: error.message,
    });
    return [];
  }

  const rows = (data ?? []) as {
    id: string;
    school_name: string;
    team: string | null;
    status: string;
    crest_path: string | null;
  }[];

  return Promise.all(
    rows.map(async (row) => ({
      id: row.id,
      name: programDisplayName(row.school_name, row.team),
      crestUrl: await crestUrl(row.crest_path),
      status: row.status,
    })),
  );
}
