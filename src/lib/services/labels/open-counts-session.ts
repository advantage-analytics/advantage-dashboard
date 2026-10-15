/**
 * The console's open counts, saved on its session (`label_sessions.open_counts`)
 * so Admin › Labels can show the work left without rebuilding each session's
 * marks. A cache: the console writes it when its own numbers change, never as
 * an Undo step, and the list reads it as "when last opened".
 */

import { isUuid } from "@/lib/admin/validation";
import { requireAdmin } from "@/lib/services/programs/admin-guard";
import { createAdminClient, type AdminClient } from "@/lib/supabase/admin";
import type { FlagCounts } from "./job-groups";

export type LabelOpenCounts = FlagCounts;

export type LabelOpenCountsResult = { ok: true } | { error: string };

export interface OpenCountsDependencies {
  requireAdmin: () => Promise<{ id: string } | null>;
  createAdminClient: () => AdminClient;
}

const defaults: OpenCountsDependencies = { requireAdmin, createAdminClient };

const count = (n: unknown): n is number =>
  typeof n === "number" && Number.isInteger(n) && n >= 0 && n < 100_000;

export async function recordLabelOpenCounts(
  sessionId: string,
  counts: LabelOpenCounts,
  deps: OpenCountsDependencies = defaults,
): Promise<LabelOpenCountsResult> {
  const viewer = await deps.requireAdmin();
  if (!viewer) return { error: "Admin access required." };
  if (!isUuid(sessionId)) return { error: "No such session." };
  if (!count(counts?.amber) || !count(counts?.grey)) {
    return { error: "Counts must be whole numbers." };
  }
  const { error } = await deps
    .createAdminClient()
    .from("label_sessions")
    .update({
      open_counts: { amber: counts.amber, grey: counts.grey },
      open_counts_at: new Date().toISOString(),
    })
    .eq("id", sessionId);
  if (error) {
    console.error("[labels] open counts not saved", {
      sessionId,
      message: error.message,
    });
    return { error: "Could not save the open counts." };
  }
  return { ok: true };
}
