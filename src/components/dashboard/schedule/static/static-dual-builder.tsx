"use client";

import { useState } from "react";
import { DualBuildStep } from "@/components/dashboard/schedule/static/dual-build-step";
import { DualSchoolStep } from "@/components/dashboard/schedule/static/dual-school-step";

/**
 * The new-dual flow's shell — `2c` then `2b`, rendered from fixtures.
 *
 * Two steps and one piece of state to say which, because the design's own
 * eyebrow says "step 1 of 2" and because the second screen is a different
 * layout rather than the first with more fields: `2c` is one padded column,
 * `2b` is master–detail with the school pinned to a rail.
 *
 * ── Why the chosen school does not travel ──────────────────────────────────
 * A flag, not the picked row. An earlier pass threaded the chosen
 * `DirectorySchool` through to step two so its header could name it — and that
 * put one school's name over another school's data: `2b`'s date, site, format
 * and nine lines are Ridgeline's, drawn, and they do not vary, so picking
 * Ridgemont Tech on `2c` produced "vs Ridgemont Tech" above Ridgeline's
 * lineup. Reachable four of the five ways through step one.
 *
 * `2b` draws Ridgeline throughout — header, rail check, subline, footer. The
 * artboard has one path, so the faithful reproduction of it has one path too;
 * making the header follow the selection was behaviour invented beyond the
 * design, and removing it is what fixes the defect. Selection still advances
 * the step, which is all `2c`'s Continue is drawn to do.
 *
 * Deliberately thin. The lineup editing over `2b` (T7) lands inside
 * `DualBuildStep`, and should not need this file re-read to do it — the whole
 * of what is here is the branch.
 *
 * `dual-form.tsx` is the DB-wired implementation of the same two steps and
 * stays where it is, dormant, for the re-wiring. This shell does not import
 * it. Note that the re-wiring DOES have to make the school travel — see the
 * note on `DUAL_DRAFT_SCHOOL` in `dual-build-step.tsx`.
 *
 * ── No way back, on purpose ────────────────────────────────────────────────
 * Neither artboard draws one. `2b`'s Cancel goes to the schedule, which is a
 * screen this run rebuilt, so step two is an exit and not a trap — which is
 * the only reason the stub that used to sit here carried a "Back" control at
 * all, and why that control leaves with it.
 */
export function StaticDualBuilder() {
  const [step, setStep] = useState<"find-school" | "build">("find-school");

  if (step === "find-school") {
    return <DualSchoolStep onContinue={() => setStep("build")} />;
  }

  return <DualBuildStep />;
}
