import { cache } from 'react';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { getInitials } from '@/lib/data/match-utils';
import type {
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
  };
}

/**
 * Team workspaces the viewer belongs to.
 *
 * Returns nothing until the program tables land — `programs` and
 * `program_members` do not exist yet, and querying a missing table is an error
 * rather than an empty result. This is the seam Track B fills: when membership
 * is real, this reads `program_members` joined to `programs` and everything
 * above it already works.
 *
 * Deliberately not faked. A synthetic team workspace here would let the whole
 * shell be built against a shape the database never confirms, which is how a
 * switcher ships that cannot switch.
 */
async function listProgramWorkspaces(): Promise<Workspace[]> {
  return [];
}

function toViewer(
  id: string,
  email: string,
  row: {
    first_name: string | null;
    last_name: string | null;
    plan: string | null;
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
      .select('first_name, last_name, plan')
      .eq('id', user.id)
      .single();

    const viewer = toViewer(user.id, user.email ?? '', row);

    const available = [
      personalWorkspace(viewer),
      ...(await listProgramWorkspaces()),
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
