import { cache } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { getInitials } from '@/lib/data/match-utils';
import type {
  ProgramRole,
  Viewer,
  Workspace,
  WorkspaceContextValue,
} from './types';

/**
 * Resolve the viewer's workspaces for one request.
 *
 * Wrapped in React `cache()` for the same reason `getMatchDetailData()` is —
 * the layout and the pages beneath it both need this, and without it every
 * segment refetches the user row. One fetch per request, shared.
 *
 * The active workspace is a cookie, not a URL segment. That keeps every
 * existing route path intact; the cost is that a shared `/dashboard/matches`
 * link resolves per-viewer. When sharing becomes a real workflow the upgrade is
 * `/dashboard/w/[workspaceId]/…`, and this function is where it starts.
 */

const WORKSPACE_COOKIE = 'advantage_workspace';

/** A cookie naming a workspace the viewer no longer belongs to falls back here. */
function personalWorkspace(viewer: Viewer): Workspace {
  return {
    // Not an invention: `processing_usage` already keys an individual's
    // allowance by user id with account_type 'individual', so this IS the
    // account id that ledger uses. A synthetic row would be a second source of
    // truth for something already keyed.
    id: viewer.id,
    kind: 'personal',
    name: 'Personal',
    team: null,
    role: 'owner',
    mark: viewer.initials,
    canSubmitVideo: true,
    // A program-wide policy about *other* people, in a workspace whose only
    // member is its owner. False is the honest value; `canUploadForProgram()`
    // never consults it here because it answers on `kind` first.
    playersCanUpload: false,
  };
}

/**
 * Team workspaces the viewer belongs to.
 *
 * Filtered to `userId` explicitly. RLS alone is NOT enough here: the select
 * policy is `user_id = auth.uid() OR is_program_staff(program_id)`, so a coach
 * reading this table gets the whole roster back. Every one of those rows maps
 * to the same program id, and the cookie lookup downstream takes the first
 * match by `joined_at` — so a coach who joined after one of their players
 * resolved as `role: 'player'` and lost every staff control on their own team,
 * with the workspace name still correct on screen.
 *
 * `canSubmitVideo` comes from the program's claim state, not from the
 * membership: a program still in review can invite people and build a roster
 * but must not spend the vendor budget, because that spend cannot be taken
 * back. `programStatusFor()` maps a claim to `claim_pending`, which is exactly
 * the state that withholds it.
 */
async function listProgramWorkspaces(
  supabase: SupabaseClient,
  userId: string
): Promise<Workspace[]> {
  const { data, error } = await supabase
    .from('program_members')
    .select(
      'role, programs!inner(id, school_name, team, status, players_can_upload)'
    )
    .eq('user_id', userId)
    .order('joined_at');

  if (error) {
    // Never fatal: a viewer who cannot load their programs should still get
    // their personal workspace rather than a broken dashboard.
    console.error('[workspace] could not load program memberships', {
      error: error.message,
    });
    return [];
  }

  return (data ?? []).flatMap((row) => {
    const program = (
      Array.isArray(row.programs) ? row.programs[0] : row.programs
    ) as
      | {
          id: string;
          school_name: string;
          team: string;
          status: string;
          players_can_upload: boolean;
        }
      | undefined;
    if (!program) return [];

    return [
      {
        id: program.id,
        kind: 'team' as const,
        name: program.school_name,
        team: program.team === 'womens' ? ('womens' as const) : ('mens' as const),
        role: row.role as ProgramRole,
        mark: program.school_name.trim().charAt(0).toUpperCase(),
        // 'active' means the claim settled. 'claim_pending' is a live workspace
        // whose video submission waits — see /claim/review, which promises
        // exactly that.
        canSubmitVideo: program.status === 'active',
        // The program's own answer to "anyone, or coaches?" from Team
        // settings. Read here rather than at the page, so the upload page's
        // gate and the switcher's `landingPath()` are looking at one value
        // resolved once per request — see `Workspace.playersCanUpload`.
        playersCanUpload: program.players_can_upload,
      },
    ];
  });
}

function toViewer(
  id: string,
  email: string,
  row: {
    first_name: string | null;
    last_name: string | null;
    plan: string | null;
    role: string | null;
    created_at: string | null;
  } | null
): Viewer {
  const firstName = row?.first_name ?? null;
  const lastName = row?.last_name ?? null;

  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
  const localPart = email.split('@')[0] ?? email;

  return {
    id,
    email,
    name: fullName || localPart,
    // The shared rule, which also handles single-word and "A & B" names the
    // inline version here did not.
    initials: (fullName && getInitials(fullName)) || localPart.slice(0, 2).toUpperCase(),
    plan: row?.plan ?? 'free',
    role: row?.role ?? null,
    // Formatted here rather than on each page: Profile and Plan both rendered
    // "Mon YYYY" from their own client-side fetch of this same column, in two
    // copies that were not pinned to the same timezone.
    memberSince: row?.created_at
      ? new Date(row.created_at).toLocaleDateString('en-US', {
          month: 'short',
          year: 'numeric',
          timeZone: 'UTC',
        })
      : null,
  };
}

export const getWorkspaceContext = cache(
  async (): Promise<WorkspaceContextValue | null> => {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    // Own row only — `users` RLS is a blanket `auth.uid() = id`, which is also
    // why other members' names need a SECURITY DEFINER lookup rather than a
    // select from here.
    const { data: row } = await supabase
      .from('users')
      .select('first_name, last_name, plan, role, created_at')
      .eq('id', user.id)
      .single();

    const viewer = toViewer(user.id, user.email ?? '', row);

    const available = [
      personalWorkspace(viewer),
      ...(await listProgramWorkspaces(supabase, user.id)),
    ];

    const cookieStore = await cookies();
    const requested = cookieStore.get(WORKSPACE_COOKIE)?.value;

    // Validate against membership rather than trusting the cookie. A stale or
    // hand-edited value must land on the personal workspace, never on someone
    // else's program.
    const active =
      available.find((workspace) => workspace.id === requested) ?? available[0];

    return { active, available, viewer };
  }
);

export { WORKSPACE_COOKIE };
