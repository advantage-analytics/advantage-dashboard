/*
 * ── Optional follow-ups (Phase 2a conferences plan — not required) ─────────
 * Recorded verbatim from the plan's "Optional follow-ups" paragraph:
 *
 *   Optional follow-ups (not required): move `getConferenceTable`
 *   (`opponents-server.ts:289`), `dual-school-step.tsx`, the Teams
 *   `?conference=` filter, `search_programs` tiers 2–3 (join `conferences` to
 *   answer "PL"), `update_program_settings`/`admin_create_program`
 *   (`p_conference_id`), `ConferenceSelect` (ids), `scripts/seed-programs.ts`
 *   to `conference_id`; eventually drop `programs.conference` and its two text
 *   indexes.
 *
 * As a checklist:
 *   - [ ] `getConferenceTable` (`opponents-server.ts:289`) → `conference_id`
 *   - [ ] `dual-school-step.tsx` → `conference_id`
 *   - [ ] the Teams `?conference=` filter → `conference_id`
 *   - [ ] `search_programs` tiers 2–3 → join `conferences` (to answer "PL")
 *   - [ ] `update_program_settings` / `admin_create_program` → `p_conference_id`
 *   - [ ] `ConferenceSelect` → ids
 *   - [ ] `scripts/seed-programs.ts` → `conference_id`
 *   - [ ] eventually drop `programs.conference` and its two text indexes
 */
import { cache } from "react";

import { requireAdminOrNotFound } from "@/lib/services/programs/admin-guard";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { programDisplayName } from "@/lib/data/programs-server";
import type {
  AdminConferenceRow,
  ConferenceSquads,
} from "@/lib/data/admin-conferences-view";
import { PROGRAM_CRESTS_BUCKET } from "@/lib/data/teams-server";

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
 * The pure helpers (`applyConferenceView`, `sortConferences`,
 * `conferenceMeta`) and the row types live in `admin-conferences-view.ts`,
 * which has no server import, so the client page content can filter and sort
 * without pulling this module into the browser bundle. Import them from there.
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

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

function squadsFor(hasMens: boolean, hasWomens: boolean): ConferenceSquads {
  if (hasMens && hasWomens) return "both";
  if (hasMens) return "mens";
  if (hasWomens) return "womens";
  return null;
}

function toAdminConferenceRow(raw: RawConferenceRow): AdminConferenceRow {
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

    // Throw rather than fall back to `{ rows: [], unplaced: 0 }`: an empty
    // table reads as "there are no conferences", which is a claim, not an
    // error. `admin/error.tsx` catches this and says the page failed instead.
    if (listResult.error) {
      throw new Error(
        `Could not list conferences: ${listResult.error.message}`,
      );
    }
    if (unplacedResult.error) {
      throw new Error(
        `Could not count unplaced programs: ${unplacedResult.error.message}`,
      );
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
 * Throws on a failed read.
 *
 * **Unguarded.** The only caller is `loadConferenceTeams`, a server action
 * that runs `requireAdmin()` first; anything else that calls this must gate
 * on its own. Service role: an admin is not a member of these programs, and
 * the drawer needs every one of them.
 */
export async function readConferenceTeams(
  conferenceId: string,
): Promise<AdminConferenceTeam[]> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("programs")
    .select("id, school_name, team, status, crest_path")
    .eq("conference_id", conferenceId)
    .order("school_name", { ascending: true })
    .order("team", { ascending: true });

  // Throw, not `[]`: an empty list would draw "no teams" for a conference that
  // has them. `loadConferenceTeams` catches this and returns `{ ok: false }`,
  // which is what puts the drawer in its error state.
  if (error) {
    throw new Error(`Could not list teams: ${error.message}`);
  }

  const rows = (data ?? []) as {
    id: string;
    school_name: string;
    team: string | null;
    status: string;
    crest_path: string | null;
  }[];

  // `crestUrl()`'s rule on the client already open: the bucket is public, so
  // the URL is a pure function of the key, and no key means no crest.
  const crests = admin.storage.from(PROGRAM_CRESTS_BUCKET);

  return rows.map((row) => ({
    id: row.id,
    name: programDisplayName(row.school_name, row.team),
    crestUrl: row.crest_path
      ? crests.getPublicUrl(row.crest_path).data.publicUrl
      : null,
    status: row.status,
  }));
}
