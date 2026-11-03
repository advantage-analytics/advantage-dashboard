/**
 * Which session a label write is about, and who may make it.
 *
 * Every `*-session.ts` service names its rows one of five ways — a session, a
 * point, a shot, or a batch of either — and the gate (`requireLabelActor`,
 * admin-guard.ts) wants a session id. `resolveLabelSessionId` reads the owning
 * `label_sessions.id` service-role, one query per target, and answers `null`
 * when the rows name no session or more than one: a batch that straddles two
 * sessions is refused whole rather than gated on whichever came first, since
 * a labeller assigned to one of them could otherwise slip a row of the other
 * into the same call.
 *
 * `requireLabelActorFor` composes the two in the order that reads least: an
 * admin passes on `checkAdmin()` alone, with no row read; a signed-out caller
 * is refused before any; only a signed-in non-admin costs the resolve and the
 * labeller check.
 */

import {
  defaultLabelActorDependencies,
  requireLabelActor,
  type LabelActor,
  type LabelActorDependencies,
} from "@/lib/services/programs/admin-guard";
import { UUID_RE } from "@/lib/admin/validation";
import type { AdminClient } from "@/lib/supabase/admin";

export type LabelActorTarget =
  | { sessionId: string }
  | { pointId: string }
  | { shotId: string }
  | { pointIds: readonly string[] }
  | { shotIds: readonly string[] };

/**
 * A target naming no session, for the one write made before a session exists
 * (seeding). An admin passes on `checkAdmin()` alone; anyone else resolves
 * to no session and is refused.
 */
export const NO_SESSION: LabelActorTarget = { sessionId: "" };

/**
 * An id the service has not validated yet (`unknown`, straight from the
 * server action) as a target field: a non-string becomes "", which the
 * resolve refuses. The service's own validation still answers its sentence
 * for an admin, who passes the gate with no resolve.
 */
export function targetId(id: unknown): string {
  return typeof id === "string" ? id : "";
}

/** `targetId` over a list: a non-array is an empty one, which is refused. */
export function targetIds(ids: unknown): string[] {
  return Array.isArray(ids) ? ids.map(targetId) : [];
}

/** The distinct well-formed uuids of `ids`, or `null` when any is not one. */
function uuidSet(ids: readonly unknown[]): string[] | null {
  const out = new Set<string>();
  for (const id of ids) {
    if (typeof id !== "string" || !UUID_RE.test(id)) return null;
    out.add(id);
  }
  return [...out];
}

/**
 * The one `label_sessions.id` the target's rows belong to, or `null` when they
 * belong to none, to more than one, or any id is malformed. A `sessionId`
 * target is answered as given (the gate reads that row itself).
 */
export async function resolveLabelSessionId(
  db: AdminClient,
  target: LabelActorTarget,
): Promise<string | null> {
  if ("sessionId" in target) {
    const ids = uuidSet([target.sessionId]);
    return ids?.[0] ?? null;
  }

  const table =
    "pointId" in target || "pointIds" in target
      ? "label_points"
      : "label_shots";
  const raw =
    "pointId" in target
      ? [target.pointId]
      : "shotId" in target
        ? [target.shotId]
        : "pointIds" in target
          ? target.pointIds
          : target.shotIds;
  const ids = uuidSet(raw);
  if (!ids || ids.length === 0) return null;

  const { data, error } = await db
    .from(table)
    .select("session_id")
    .in("id", ids);
  if (error || !data) return null;

  const sessions = new Set<string>();
  for (const row of data as { session_id: string | null }[]) {
    if (row.session_id) sessions.add(row.session_id);
  }
  if (sessions.size !== 1) return null;
  return [...sessions][0];
}

/**
 * `requireLabelActor` for whatever the write names. `null` for every refusal,
 * including rows that resolve to no single session.
 */
export async function requireLabelActorFor(
  target: LabelActorTarget,
  deps: LabelActorDependencies = defaultLabelActorDependencies,
): Promise<LabelActor | null> {
  const check = await deps.checkAdmin();
  if (check.ok) return { id: check.id, kind: "admin" };
  if (check.status === 401) return null;

  const sessionId = await resolveLabelSessionId(
    deps.createAdminClient(),
    target,
  );
  if (!sessionId) return null;
  return requireLabelActor(sessionId, deps);
}
