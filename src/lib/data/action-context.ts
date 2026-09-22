import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import type { Workspace } from "@/lib/workspace/types";

/**
 * The context every server action in the match report needs: the
 * cookie-authenticated client (never `admin.ts`) and the caller's active
 * workspace, resolved server-side — never trusted from the client. `null`
 * means "no session or no active workspace" — every caller turns that into
 * its own `{ ok: false, error: "forbidden" }`.
 */
export interface ActionContext {
  supabase: SupabaseClient;
  workspace: Workspace;
  viewerId: string;
}

export async function requireWorkspaceContext(): Promise<ActionContext | null> {
  const ctx = await getWorkspaceContext();
  if (!ctx) return null;
  const supabase = await createClient();
  return { supabase, workspace: ctx.active, viewerId: ctx.viewer.id };
}
