"use server";

import { requireAdminOrNotFound } from "@/lib/services/programs/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  programDisplayName,
  programSubtitle,
} from "@/lib/data/programs-server";
import { PROGRAM_CRESTS_BUCKET } from "@/lib/data/teams-server";
import { USER_AVATARS_BUCKET } from "@/lib/user/avatar";
import { formatMatchDayShortYear } from "@/lib/data/match-day";
import type {
  AdminSearchHit,
  AdminSearchKind,
} from "@/components/admin/search/types";

/**
 * The admin header's Search: teams, people, matches and conferences.
 *
 * Matching is `public.admin_search` (migration `20261028213310_admin_search`):
 * accent- and case-insensitive, typo-tolerant, at most `limit` rows per kind,
 * already ordered best-first within each kind. That function is executable by
 * `service_role` only and re-checks that `p_viewer` is an admin, so this
 * action passes the id `requireAdminOrNotFound()` resolved — never one the
 * client sent.
 *
 * What it adds on top is the part the browser needs and SQL should not build:
 * public URLs for crests and photos, a match's calendar day as a label, and
 * where each row goes.
 *
 * A person goes to the team page of a program they belong to (owner, then
 * coach, staff, player), because that is the one admin page that shows a
 * person in context and can act on them. Someone with no team goes to
 * Pilots — the console has no per-person page, and Pilots is where an
 * individual account is managed. It reads no `?email=`, so none is sent.
 */

/** Rows per kind. Four groups of five fit the panel without a long scroll. */
const PER_KIND = 5;

const KINDS = new Set<AdminSearchKind>([
  "team",
  "person",
  "match",
  "conference",
]);

/** Which membership a person's row opens, best first. */
const ROLE_RANK: Record<string, number> = {
  owner: 0,
  coach: 1,
  staff: 2,
  player: 3,
};

interface SearchRow {
  kind: string;
  id: string;
  title: string | null;
  subtitle: string | null;
  extra: Record<string, unknown> | null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

export async function adminSearch(term: string): Promise<AdminSearchHit[]> {
  const { id: viewer } = await requireAdminOrNotFound();

  const query = term.trim();
  if (query.length === 0) return [];

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("admin_search", {
    p_viewer: viewer,
    p_term: query,
    p_limit: PER_KIND,
  });

  // Thrown, not swallowed: the panel's "Couldn't search." is for exactly
  // this, and an empty list would read as "nothing matches".
  if (error) {
    console.error("[admin search] admin_search failed", {
      error: error.message,
    });
    throw new Error("Couldn't search.");
  }

  const rows = ((data ?? []) as SearchRow[]).filter((row) =>
    KINDS.has(row.kind as AdminSearchKind),
  );

  // Where each person goes: the program they hold the most standing in.
  const personIds = rows.filter((r) => r.kind === "person").map((r) => r.id);
  const teamOf = new Map<string, { programId: string; rank: number }>();
  if (personIds.length > 0) {
    const { data: members, error: membersError } = await admin
      .from("program_members")
      .select("user_id, program_id, role")
      .in("user_id", personIds);
    if (membersError) {
      // Not fatal — the row still opens, on Pilots instead of a team.
      console.error("[admin search] could not read memberships", {
        error: membersError.message,
      });
    }
    for (const member of (members ?? []) as {
      user_id: string;
      program_id: string | null;
      role: string | null;
    }[]) {
      if (!member.program_id) continue;
      const rank = ROLE_RANK[member.role ?? ""] ?? 9;
      const held = teamOf.get(member.user_id);
      if (!held || rank < held.rank) {
        teamOf.set(member.user_id, { programId: member.program_id, rank });
      }
    }
  }

  const publicUrl = (bucket: string, path: string | null) =>
    path ? admin.storage.from(bucket).getPublicUrl(path).data.publicUrl : null;

  return rows.map((row): AdminSearchHit => {
    const extra = row.extra ?? {};
    const title = row.title ?? "";
    const subtitle = text(row.subtitle);

    switch (row.kind as AdminSearchKind) {
      case "team":
        return {
          kind: "team",
          id: row.id,
          title,
          subtitle,
          href: `/admin/teams/${row.id}`,
          markUrl: publicUrl(PROGRAM_CRESTS_BUCKET, text(extra.crestPath)),
          shortCode: text(extra.shortCode),
        };
      case "person": {
        const team = teamOf.get(row.id);
        return {
          kind: "person",
          id: row.id,
          title,
          subtitle,
          href: team ? `/admin/teams/${team.programId}` : "/admin/pilots",
          markUrl: publicUrl(USER_AVATARS_BUCKET, text(extra.avatarPath)),
          shortCode: null,
        };
      }
      case "match": {
        const date = text(extra.date);
        // Some imports store the match title as its tournament; repeating
        // the title underneath says nothing.
        const tournament = subtitle && subtitle !== title ? subtitle : null;
        return {
          kind: "match",
          id: row.id,
          title,
          subtitle:
            [date ? formatMatchDayShortYear(date) : null, tournament]
              .filter(Boolean)
              .join(" · ") || null,
          href: `/admin/matches/${row.id}`,
          markUrl: null,
          shortCode: null,
        };
      }
      case "conference":
        return {
          kind: "conference",
          id: row.id,
          title,
          subtitle,
          href: `/admin/conferences?id=${row.id}`,
          markUrl: publicUrl(PROGRAM_CRESTS_BUCKET, text(extra.crestPath)),
          shortCode: text(extra.shortName),
        };
    }
  });
}

/**
 * Team-only search for the Conference drawer's `AddTeamPopover`.
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
  /** `programs.conference_id`; null for a program with no conference. */
  conferenceId: string | null;
  /**
   * The conference's label — `programs.conference`, the trigger-fed mirror of
   * `conferences.label`, so no join is needed to read it.
   */
  conferenceLabel: string | null;
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
    .select("id, school_name, team, division, conference, conference_id")
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
      conference_id: string | null;
    }[]
  ).map((row) => ({
    id: row.id,
    name: programDisplayName(row.school_name, row.team),
    subtitle: programSubtitle(row.division, row.conference),
    conferenceId: row.conference_id,
    conferenceLabel: row.conference,
  }));
}
