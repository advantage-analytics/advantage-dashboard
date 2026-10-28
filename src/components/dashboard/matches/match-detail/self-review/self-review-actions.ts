"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { UUID_RE } from "@/lib/admin/validation";
import { requestMatchInsights } from "@/lib/services/splitstep/request-insights";
import type { PointFix } from "@/lib/data/self-review";

export type SaveSelfReviewResult =
  { ok: true; edited: number; changed: number } | { ok: false; error: string };

/** The most fixes one save carries: a long match, every point touched. */
const MAX_FIXES = 600;

const SIDES = new Set(["p1", "p2"]);
const ENDINGS = new Set([
  "winner",
  "error",
  "ace",
  "double_fault",
  "service_winner",
]);
const ERROR_KINDS = new Set(["forced", "unforced"]);
const STROKES = new Set(["forehand", "backhand", "volley", "overhead"]);

/**
 * Save a self review (docs/plans/advantage-review.md, step 2): Fix points'
 * "Save N fixes". `self_review_save` runs as the signed-in user and is the
 * authority — it checks who may fix (the uploader of a personal match, a
 * team's owner or coaches), refuses a Verified match, seeds the match's self
 * session on first use, patches `points.won_by_player1` / `result_type` and
 * recomputes `match_stats`. It never sets `verified`.
 *
 * The insights request goes through the service role only AFTER that call
 * succeeded with something changed: `generate-insights` accepts a signed-in
 * caller only when they uploaded the match, and a coach fixing a team
 * player's match did not. The function proved the right to change it.
 */
export async function saveSelfReview(
  matchId: string,
  fixes: PointFix[],
): Promise<SaveSelfReviewResult> {
  if (typeof matchId !== "string" || !UUID_RE.test(matchId)) {
    return { ok: false, error: "That match could not be found." };
  }
  if (!Array.isArray(fixes) || fixes.length === 0) {
    return { ok: false, error: "Nothing to save." };
  }
  if (fixes.length > MAX_FIXES) {
    return { ok: false, error: "That's too many fixes for one save." };
  }
  const payload = [];
  for (const fix of fixes) {
    const clean = cleanFix(fix);
    if (!clean) return { ok: false, error: "One of the fixes isn't complete." };
    payload.push(clean);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("self_review_save", {
    p_match_id: matchId,
    p_fixes: payload,
  });
  if (error) {
    console.error("[self-review] save failed", {
      matchId,
      code: error.code,
      error: error.message,
    });
    if (error.code === "42501") {
      return {
        ok: false,
        error: /Verified/.test(error.message)
          ? "This match is Verified by Advantage, so its points are locked."
          : "You can't fix the points on this match.",
      };
    }
    if (error.code === "22023") return { ok: false, error: error.message };
    return { ok: false, error: "Couldn't save your fixes. Try again." };
  }

  const result = (data ?? {}) as { edited?: number; changed?: number };
  const changed = Number(result.changed ?? 0);
  if (changed > 0) {
    await requestMatchInsights({ supabase: createAdminClient(), matchId });
  }
  revalidatePath(`/dashboard/matches/${matchId}`);
  return { ok: true, edited: Number(result.edited ?? 0), changed };
}

function cleanFix(fix: unknown): Record<string, unknown> | null {
  if (!fix || typeof fix !== "object") return null;
  const f = fix as Record<string, unknown>;
  if (typeof f.pointId !== "string" || !UUID_RE.test(f.pointId)) return null;
  if (f.reset === true) return { point_id: f.pointId, reset: true };
  if (typeof f.winner !== "string" || !SIDES.has(f.winner)) return null;
  if (typeof f.ending !== "string" || !ENDINGS.has(f.ending)) return null;
  const errorKind =
    typeof f.errorKind === "string" && ERROR_KINDS.has(f.errorKind)
      ? f.errorKind
      : null;
  const lastStroke =
    typeof f.lastStroke === "string" && STROKES.has(f.lastStroke)
      ? f.lastStroke
      : null;
  return {
    point_id: f.pointId,
    winner: f.winner,
    ending: f.ending,
    error_kind: errorKind,
    last_stroke: lastStroke,
  };
}
