"use server";

import { requireAdminOrNotFound } from "@/lib/services/programs/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  programDisplayName,
  programSubtitle,
} from "@/lib/data/programs-server";

/**
 * The admin header's jump-to-a-team search.
 *
 * **Not `search_programs`.** That RPC exists and is what the claim flow uses,
 * but it is built for a different question: it excludes custom organisations
 * (a program a coach created rather than one the NCAA directory seeded), and
 * it returns the directory *key* rather than the `programs.id` this console
 * navigates by. Both are correct for picking your school during onboarding and
 * both are wrong here — an admin has to be able to reach every row, including
 * the ones a coach made, and the destination is `/admin/teams/[id]`.
 *
 * So this is a plain service-role read instead. Service role for the same
 * reason the rest of the console uses it: an admin is deliberately not scoped
 * to "programs I belong to", and the guard below is what stands in for that
 * scoping. `programs` is publicly readable, so this leaks nothing a signed-out
 * visitor could not already see — but it is fronted by
 * `requireAdminOrNotFound()` anyway, because a server action is a public
 * endpoint and re-checking is cheaper than reasoning about whether it matters.
 */

export interface AdminSearchResult {
  id: string;
  /** "Stanford Women's Tennis" — the same name the table's rows carry. */
  name: string;
  /** "D-I · Pac-12", either half omitted when the column is null. */
  subtitle: string;
}

/** How many rows the header's dropdown shows. Eight fits without scrolling. */
const SEARCH_LIMIT = 8;

export async function adminSearchTeams(
  term: string,
): Promise<AdminSearchResult[]> {
  await requireAdminOrNotFound();

  const query = term.trim();
  if (query.length === 0) return [];

  const admin = createAdminClient();

  // `%term%`, not `term%`: an admin looking for "UCLA" should find
  // "University of California, Los Angeles" too, and this runs at most eight
  // rows deep over a 1,940-row table — the prefix index the directory picker
  // leans on is not worth the miss here.
  //
  // `%`, `_` and `\` are PostgREST `ilike` wildcards; escaped so a typed `%`
  // searches for a literal percent sign instead of matching the whole table.
  const pattern = query.replace(/[\\%_]/g, (char) => `\\${char}`);

  const { data, error } = await admin
    .from("programs")
    .select("id, school_name, team, division, conference")
    .ilike("school_name", `%${pattern}%`)
    .order("school_name", { ascending: true })
    .limit(SEARCH_LIMIT);

  if (error) {
    console.error("[admin search] could not search programs", {
      error: error.message,
    });
    return [];
  }

  return (
    (data ?? []) as {
      id: string;
      school_name: string;
      team: string | null;
      division: string | null;
      conference: string | null;
    }[]
  ).map((row) => ({
    id: row.id,
    name: programDisplayName(row.school_name, row.team),
    subtitle: programSubtitle(row.division, row.conference),
  }));
}
