/**
 * The program directory, read by the claim flow.
 *
 * Every function here runs BEFORE an account exists — screens F2 and F3 are
 * anonymous. `programs` is readable by `anon` for exactly that reason, and the
 * two things that are not (contact addresses, and the owner's identity) come
 * back through `program_public_status()`, which projects an owner as
 * "Elena V." and never an address.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

/** Enough to render one row of the F3 result list. */
export interface ProgramSearchResult {
  programKey: string;
  schoolName: string;
  team: 'mens' | 'womens';
  division: string | null;
  conference: string | null;
  state: string | null;
  status: ProgramStatus;
  /** "Coach D. Wu" on a claimed row, null otherwise. */
  ownerDisplay: string | null;
}

export type ProgramStatus = 'unclaimed' | 'claim_pending' | 'active' | 'suspended';

export interface ProgramPublicStatus extends ProgramSearchResult {
  claimedAt: string | null;
}

/** "mens" → "Men's". The dataset stores the key; the UI never shows it raw. */
export function teamLabel(team: string): string {
  return team === 'womens' ? "Women's" : "Men's";
}

/**
 * The dataset stores `D1`; every screen in the design writes `D-I`.
 *
 * NAIA and JUCO are already how they are said out loud, so they pass through.
 */
const DIVISION_LABEL: Record<string, string> = {
  D1: 'D-I',
  D2: 'D-II',
  D3: 'D-III',
};

export function divisionLabel(division: string | null): string | null {
  if (!division) return null;
  return DIVISION_LABEL[division] ?? division;
}

/** "D-I · Big Sky", skipping whichever half is missing. */
export function programSubtitle(
  division: string | null,
  conference: string | null
): string {
  return [divisionLabel(division), conference].filter(Boolean).join(' · ');
}

const SEARCH_LIMIT = 8;

/** Shape both the search RPC and the status RPC return. */
function toResult(row: Record<string, unknown>): ProgramSearchResult {
  return {
    programKey: row.program_key as string,
    schoolName: row.school_name as string,
    team: row.team as 'mens' | 'womens',
    division: row.division as string | null,
    conference: row.conference as string | null,
    state: row.state as string | null,
    status: row.status as ProgramStatus,
    ownerDisplay: (row.owner_display as string | null) || null,
  };
}

/**
 * Typeahead over 1,940 programs.
 *
 * Goes through `search_programs()` rather than selecting from the table,
 * because each row needs its owner's display name and an anonymous visitor
 * cannot read `users`. One definer call for the page of results, not one per
 * row. The prefix-vs-contains reasoning lives with the function.
 */
export async function searchPrograms(
  supabase: SupabaseClient,
  term: string
): Promise<ProgramSearchResult[]> {
  const query = term.trim();
  if (query.length < 2) return [];

  const { data, error } = await supabase.rpc('search_programs', {
    p_term: query,
    p_limit: SEARCH_LIMIT,
  });

  if (error) {
    console.error('[programs] search failed', { error: error.message });
    return [];
  }

  return ((data ?? []) as Record<string, unknown>[]).map(toResult);
}

/**
 * One program, with its owner's display name.
 *
 * Goes through the SECURITY DEFINER projection rather than selecting from
 * `programs` and joining `users` — the join is impossible under RLS for an
 * anonymous visitor, and widening `users` to allow it would expose an address
 * next to every name.
 */
export async function getProgramPublicStatus(
  supabase: SupabaseClient,
  programKey: string
): Promise<ProgramPublicStatus | null> {
  const { data, error } = await supabase
    .rpc('program_public_status', { p_program_key: programKey })
    .maybeSingle();

  if (error) {
    console.error('[programs] status lookup failed', { error: error.message });
    return null;
  }
  if (!data) return null;

  const row = data as Record<string, unknown>;
  return {
    ...toResult(row),
    claimedAt: (row.claimed_at as string | null) || null,
  };
}

/**
 * "6 hours" — how long a pending claim has been sitting.
 *
 * Shown in mono on F3.4 because it is the only new fact on that screen: a coach
 * deciding whether to wait or to object needs to know whether this happened six
 * hours ago or six weeks ago.
 */
export function claimAge(claimedAt: string | null, nowMs = Date.now()): string | null {
  if (!claimedAt) return null;
  const then = Date.parse(claimedAt);
  if (!Number.isFinite(then)) return null;

  const minutes = Math.max(1, Math.round((nowMs - then) / 60000));
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;

  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'}`;

  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'}`;
}
