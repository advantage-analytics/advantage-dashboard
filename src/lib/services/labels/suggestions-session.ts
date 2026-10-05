/**
 * The labelling console's Dismiss of a suggestion, admin-gated: remember that
 * the labeller looked at a proposed stroke (or point) and said no
 * (`suggestions.ts`).
 *
 * Same shape as site-removal-session.ts: the entry point re-checks
 * `requireAdmin`, runs on the service-role client, refuses a `complete`
 * session and one whose `marks_enabled` is false — that session's labels
 * were made blind to the derivation and has no suggestion to dismiss; the
 * ground-truth match is never written from here — and decides what to write
 * with the pure rule the console ran for its optimistic update.
 *
 * Its ONE write is an UPDATE of `label_points` setting `dismissed` to the
 * array it read plus the key, matched on the id AND on the status the row
 * was read with, so a point deleted or restored in another tab meanwhile is
 * not written under it. No other table, no other column, no row removed.
 * `tests/label-operations.spec.ts` scans this file for a removal call.
 */

import type { AdminClient } from "@/lib/supabase/admin";
import {
  defaultLabelWriteDependencies,
  type LabelWriteDependencies,
} from "./edit-session";
import {
  gated,
  normaliseId,
  updateIfUnchanged,
  type LabelOpResult,
} from "./operations-session";
import type { LabelPointStatus } from "./session";
import { planDismiss } from "./suggestions";

export type LabelDismissSuggestionResult = LabelOpResult<{
  dismissed: string[];
}>;

const FROZEN = "This session is complete, so its labels can no longer change.";
const BLIND =
  "This session is labelled without the site's marks, so there is nothing to dismiss.";

interface DismissRow {
  id: string;
  session_id: string;
  status: LabelPointStatus;
  /** Raw column — an array of keys, or null on a row older than the column. */
  dismissed: unknown;
}

interface SessionGate {
  status: string;
  marks_enabled: boolean | null;
}

/** Refuses anything but an open session that computes marks. */
async function checkSessionDismissable(
  supabase: AdminClient,
  sessionId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("label_sessions")
    .select("status, marks_enabled")
    .eq("id", sessionId)
    .maybeSingle<SessionGate>();
  if (error) return `Could not read the session: ${error.message}`;
  if (!data) return "Session not found.";
  if (data.status !== "labelling") return FROZEN;
  if (data.marks_enabled !== true) return BLIND;
  return null;
}

function keysOf(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((key): key is string => typeof key === "string")
    : [];
}

/** Read the point, check its session, write the one column. Never throws. */
export async function writeLabelSuggestionDismiss(params: {
  supabase: AdminClient;
  pointId: unknown;
  key: unknown;
}): Promise<LabelDismissSuggestionResult> {
  const { supabase } = params;
  const pointId = normaliseId(params.pointId);
  if (!pointId) return { error: "Invalid point id." };

  const { data: row, error } = await supabase
    .from("label_points")
    .select("id, session_id, status, dismissed")
    .eq("id", pointId)
    .maybeSingle<DismissRow>();
  if (error) return { error: `Could not read the point: ${error.message}` };
  if (!row) return { error: "Point not found." };

  const refused = await checkSessionDismissable(supabase, row.session_id);
  if (refused) return { error: refused };

  const plan = planDismiss({ dismissed: keysOf(row.dismissed) }, params.key);
  if ("error" in plan) return plan;

  const raced = await updateIfUnchanged(
    supabase,
    "label_points",
    pointId,
    row.status,
    { dismissed: plan.write.dismissed },
    "dismiss the suggestion",
  );
  if (raced) return { error: raced };
  return { ok: true, dismissed: plan.write.dismissed };
}

/** The admin-gated entry point behind `dismissLabelSuggestionAction`. */
export function dismissLabelSuggestion(
  pointId: unknown,
  key: unknown,
  deps: LabelWriteDependencies = defaultLabelWriteDependencies,
): Promise<LabelDismissSuggestionResult> {
  return gated(
    deps,
    (supabase) => writeLabelSuggestionDismiss({ supabase, pointId, key }),
    "dismiss the suggestion",
  );
}
