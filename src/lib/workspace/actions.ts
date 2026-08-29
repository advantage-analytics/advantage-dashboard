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
  // default of `push`: the page being left belongs to the workspace being left,
  // and Back should not return to a route that will only bounce again.
  redirect(workspaceHome(target), RedirectType.replace);
}
