/**
 * Loader for `/label`: the labelling sessions assigned to the signed-in
 * viewer that are still theirs to see — `labelling` (in their hands) or
 * `submitted` (waiting on an admin). A `complete` session has left their list.
 *
 * Service-role, because a labeller holds no RLS grant on `label_sessions`;
 * the boundary is the `assigned_to` filter, keyed by the id the gate took from
 * the server-side session — never a parameter a client could set. The row
 * shape deliberately carries no match id, player names, program or job id:
 * a labeller works a session, not a match, and the list has no business
 * naming whose match it is.
 */

import { requireLabelViewerOrNotFound } from "@/lib/services/programs/admin-guard";
import { createAdminClient, type AdminClient } from "@/lib/supabase/admin";
import type { LabelActor } from "@/lib/services/programs/admin-guard";
import type { FlagCounts } from "@/lib/services/labels/job-groups";
import {
  countLabelPointProgress,
  readOpenCounts,
} from "@/lib/data/labels-server";

/** One session on the labeller's list. */
export interface AssignedLabelSession {
  id: string;
  status: "labelling" | "submitted";
  /** When an admin assigned it; null for a row assigned before the column. */
  assignedAt: string | null;
  /** When the labeller handed it in; null while still `labelling`. */
  submittedAt: string | null;
  /** `label_points` with `checked_at` set, excluding tombstones. */
  checked: number;
  /** `label_points` excluding tombstones. */
  total: number;
  /** The console's last open-flag count, or null before it has counted. */
  openCounts: FlagCounts | null;
}

export interface LabelAssignmentsDependencies {
  /** The viewer, from the server-side session (the `/label` gate). */
  requireViewer: () => Promise<LabelActor>;
  createAdminClient: () => AdminClient;
  /** Checked/total per session; `countLabelPointProgress` in production. */
  countProgress: (
    db: AdminClient,
    sessionIds: string[],
  ) => Promise<Map<string, { checked: number; total: number }>>;
}
const defaults: LabelAssignmentsDependencies = {
  requireViewer: () => requireLabelViewerOrNotFound(),
  createAdminClient,
  countProgress: countLabelPointProgress,
};

interface DbAssignedSession {
  id: string;
  status: "labelling" | "submitted";
  assigned_at: string | null;
  submitted_at: string | null;
  open_counts: unknown;
}

/**
 * The viewer's assigned sessions, newest assignment first. An admin sees the
 * ones assigned to themselves, like anyone else — the full board is
 * `/admin/labels`.
 */
export async function listAssignedLabelSessions(
  deps: LabelAssignmentsDependencies = defaults,
): Promise<AssignedLabelSession[]> {
  const viewer = await deps.requireViewer();
  const db = deps.createAdminClient();

  const { data, error } = await db
    .from("label_sessions")
    .select("id, status, assigned_at, submitted_at, open_counts")
    .eq("assigned_to", viewer.id)
    .in("status", ["labelling", "submitted"])
    .order("assigned_at", { ascending: false, nullsFirst: false })
    .returns<DbAssignedSession[]>();
  if (error) {
    throw new Error(`Could not read assigned label sessions: ${error.message}`);
  }
  const sessions = data ?? [];
  if (sessions.length === 0) return [];

  const progress = await deps.countProgress(
    db,
    sessions.map((session) => session.id),
  );

  return sessions.map((session) => {
    const counts = progress.get(session.id);
    return {
      id: session.id,
      status: session.status,
      assignedAt: session.assigned_at,
      submittedAt: session.submitted_at,
      checked: counts?.checked ?? 0,
      total: counts?.total ?? 0,
      openCounts: readOpenCounts(session.open_counts),
    };
  });
}
