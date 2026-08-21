'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import {
  WORKSPACE_COOKIE,
  getWorkspaceContext,
} from './active-workspace-server';

const WORKSPACE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Switch the active workspace.
 *
 * Re-resolves membership server-side rather than trusting the id that arrives.
 * The cookie is client-writable, so this action is the only place that decides
 * a switch is legitimate — a request naming a program the viewer has no
 * membership row for is dropped, not honoured.
 *
 * Revalidates the dashboard layout because the sidebar's navigation, not just
 * its label, changes with the workspace kind.
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

  revalidatePath('/dashboard', 'layout');
}
