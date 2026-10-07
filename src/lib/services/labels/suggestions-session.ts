/**
 * The console's Dismiss of a suggestion: remember that the labeller looked at a
 * proposed stroke (or point) and said no (`suggestions.ts`). Admin-gated like
 * edit-session.ts, with the marks gate (`checkSessionOpen` with `blind`).
 *
 * Its one write is an UPDATE of `label_points` setting `dismissed` to the array
 * it read plus the key, matched on the id and on the status the row was read
 * with, so a point deleted or restored in another tab meanwhile is not written
 * under it.
 */

import type { AdminClient } from "@/lib/supabase/admin";
import {
  checkSessionOpen,
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

const BLIND =
  "This session is labelled without the site's marks, so there is nothing to dismiss.";

interface DismissRow {
  id: string;
  session_id: string;
  status: LabelPointStatus;
  /** Raw column — an array of keys, or null on a row older than the column. */
  dismissed: unknown;
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

  const refused = await checkSessionOpen(supabase, row.session_id, {
    blind: BLIND,
  });
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
