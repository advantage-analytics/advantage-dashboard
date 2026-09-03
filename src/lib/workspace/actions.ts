'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect, RedirectType } from 'next/navigation';
import {
  WORKSPACE_COOKIE,
  getWorkspaceContext,
} from './active-workspace-server';
import type { Workspace } from './types';

const WORKSPACE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function workspaceHome(workspace: Workspace): string {
  return workspace.kind === 'team' ? '/dashboard/team' : '/dashboard';
}

/**
 * Switch the active workspace and navigate to its home page.
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
 */
export async function setActiveWorkspace(workspaceId: string): Promise<void> {
  const target = await writeActiveWorkspace(workspaceId);
  if (!target) return;

  // Last, because `redirect()` throws. `replace` rather than the Server Action
  // default of `push`: the page being left belongs to the workspace being left,
  // and Back should not return to a route that will only bounce again.
  redirect(workspaceHome(target), RedirectType.replace);
}

/**
 * Switch the active workspace and STAY on the current page.
 *
 * The exception to the rule above, for the one route both kinds of workspace
 * share: the New match wizard. Its step 1 carries a Workspace field, and
 * "Upload for a teammate" moves the match to the team without leaving the
 * form — the other two fields are left alone and the roster picker opens in
 * place. A redirect to the team's home would throw away the step the person
 * is standing on to land them somewhere they did not ask to go.
 *
 * Same validation and the same cookie write; only the navigation differs. The
 * layout revalidation re-renders the current route under the new workspace,
 * and because it is the same route the wizard's client state survives it.
 *
 * Returns whether the switch happened, so the caller can tell a refused id
 * (no membership row) from a completed switch.
 */
export async function setActiveWorkspaceInPlace(
  workspaceId: string
): Promise<boolean> {
  const target = await writeActiveWorkspace(workspaceId);
  return target !== null;
}

/**
 * The half the two actions share: re-resolve membership, write the cookie,
 * revalidate. Null when the id names no workspace the viewer belongs to.
 */
async function writeActiveWorkspace(
  workspaceId: string
): Promise<Workspace | null> {
  const context = await getWorkspaceContext();
  if (!context) return null;

  const target = context.available.find(
    (workspace) => workspace.id === workspaceId
  );
  if (!target) return null;

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

  return target;
}
