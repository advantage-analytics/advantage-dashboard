'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect, RedirectType } from 'next/navigation';
import {
  WORKSPACE_COOKIE,
  getWorkspaceContext,
} from './active-workspace-server';
import {
  canUploadForProgram,
  isProgramStaff,
  type Workspace,
} from './types';

const WORKSPACE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

const DASHBOARD_HOME = '/dashboard';

/**
 * Route trees that exist only inside a team workspace.
 *
 * Both already bounce a personal workspace to `/dashboard` from their own
 * layout (`dashboard/team/layout.tsx`, `dashboard/opponents/layout.tsx`). This
 * is the same rule read *before* the navigation instead of during it: leaving
 * it to those layouts means the switch depends on a guard firing inside a
 * revalidation pass, on a route that no longer exists for the viewer.
 */
const TEAM_ONLY_TREES = ['/dashboard/team', '/dashboard/opponents'] as const;

/**
 * Lists whose deeper segments name one program's row — a roster player, a
 * fixture, a scouted opponent.
 *
 * Each of those pages resolves the id against the *active* program and 404s
 * when it belongs to another (`team/roster/[playerId]`,
 * `team/schedule/[eventId]`, `opponents/[programId]`), so a coach switching
 * between two squads lands on the list rather than on a not-found page.
 *
 * `/dashboard/matches/[matchId]` is deliberately absent: `getMatchDetailData()`
 * reads the match by id under RLS rather than by workspace, so that page keeps
 * rendering what it was showing.
 */
const PROGRAM_RECORD_LISTS = [
  '/dashboard/team/roster',
  '/dashboard/team/schedule',
  '/dashboard/opponents',
] as const;

/**
 * Pages a member of a program can be turned away from, where they land
 * instead, and — crucially — *the page's own predicate*, not a second copy of
 * it.
 *
 * This was `STAFF_ONLY_PAGES`, a path→fallback map read behind one
 * `!isProgramStaff(target)` test. That stopped being true of the upload page
 * the moment `programs.players_can_upload` started being enforced: staff are
 * no longer the only people it admits, so a single shared staff test would
 * divert a player to the schedule from a page that would have rendered for
 * them. Holding each page's actual guard here is what makes the two agree by
 * construction rather than by remembering — `admits` is the same function the
 * page calls, so the pair cannot drift apart in a later edit.
 *
 * `settings/team/page.tsx` really is staff-only and keeps `isProgramStaff`.
 *
 * The upload page's *other* guard, which sends a personal workspace to
 * `/dashboard/matches/new`, has no entry here and needs none: `TEAM_ONLY_TREES`
 * matches that path first and goes home before this map is read.
 */
const RESTRICTED_PAGES: Record<
  string,
  { admits: (workspace: Workspace) => boolean; fallback: string }
> = {
  '/dashboard/team/upload': {
    admits: canUploadForProgram,
    fallback: '/dashboard/team/schedule',
  },
  '/dashboard/settings/team': {
    admits: isProgramStaff,
    // The literal path, deliberately, not `nav.ts`'s SETTINGS_DEFAULT_HREF:
    // that constant is `SETTINGS_SECTIONS[0].href`, so promoting a staff-only
    // section to first would make this entry's fallback the very page it is
    // diverting away from — a bounce, or a loop. `settings/team/page.tsx`
    // hardcodes the same literal for the same reason.
    fallback: '/dashboard/settings/profile',
  },
};

function isUnder(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

/**
 * Where a switch into `target` should land, given the page it was made from.
 *
 * Most switches stay put — `/dashboard/matches` is `/dashboard/matches` in
 * either kind of workspace, and landing somewhere else would be its own kind of
 * surprise. The exceptions are the routes the new workspace cannot render, and
 * every one of them is a route that already redirects or 404s on arrival; this
 * function names them in advance so the switch ends on a page instead of on a
 * bounce.
 */
function landingPath(target: Workspace, from: string): string {
  let path: string;
  try {
    // Parsed rather than trusted: `from` comes from the browser and ends up in
    // `redirect()`. Resolving it against a dummy origin and keeping only the
    // pathname is what makes that safe — the host, the query and the hash are
    // all discarded, so "//example.com/steal" and "https://example.com/steal"
    // both come back as a path on this site and then have to survive the
    // `/dashboard` test below like any other.
    path = new URL(from, 'http://workspace.invalid').pathname;
  } catch {
    return DASHBOARD_HOME;
  }

  if (!isUnder(path, DASHBOARD_HOME)) return DASHBOARD_HOME;

  if (
    target.kind !== 'team' &&
    TEAM_ONLY_TREES.some((tree) => isUnder(path, tree))
  ) {
    return DASHBOARD_HOME;
  }

  // `path` always begins with `/dashboard` by the test above, so this lookup
  // cannot land on an inherited `Object.prototype` key.
  const restricted = RESTRICTED_PAGES[path];
  if (restricted && !restricted.admits(target)) return restricted.fallback;

  return (
    PROGRAM_RECORD_LISTS.find((list) => isUnder(path, list)) ?? path
  );
}

/**
 * Switch the active workspace, and land on a page that exists inside it.
 *
 * Re-resolves membership server-side rather than trusting the id that arrives.
 * The cookie is client-writable, so this action is the only place that decides
 * a switch is legitimate — a request naming a program the viewer has no
 * membership row for is dropped, not honoured, and nothing navigates.
 *
 * The redirect is what performs the switch. Writing the cookie and revalidating
 * only re-renders whatever path the switcher was clicked on, which is the wrong
 * page whenever that path belongs to the workspace being left. Redirecting here
 * gives the browser one server render, of a route the new workspace has, made
 * after the cookie was written — so the sidebar and the page body cannot
 * disagree about which workspace is active: they arrive together, from the same
 * render. Next streams the destination's Flight response as part of the action
 * response, so this is a client-side navigation, not a reload.
 *
 * `fromPath` is the browser's current pathname and is treated as untrusted
 * input — see `landingPath`.
 */
export async function setActiveWorkspace(
  workspaceId: string,
  fromPath: string
): Promise<void> {
  const context = await getWorkspaceContext();
  if (!context) return;

  const target = context.available.find(
    (workspace) => workspace.id === workspaceId
  );
  if (!target) return;

  const cookieStore = await cookies();
  cookieStore.set(WORKSPACE_COOKIE, target.id, {
    path: '/',
    maxAge: WORKSPACE_COOKIE_MAX_AGE,
    sameSite: 'lax',
  });

  // Every page under the dashboard layout reads the workspace, so all of it is
  // stale — the sidebar's navigation, not just its label. This also tells the
  // client router to drop what it has prefetched for the workspace being left.
  revalidatePath('/dashboard', 'layout');

  // Last, because `redirect()` throws. `replace` rather than the Server Action
  // default of `push`: the page being left may not exist in the new workspace,
  // and Back should not return to a route that will only bounce again.
  redirect(landingPath(target, fromPath), RedirectType.replace);
}
