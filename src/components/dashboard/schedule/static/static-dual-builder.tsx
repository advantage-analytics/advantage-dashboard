"use client";

import { useState } from "react";
import { DualSchoolStep } from "@/components/dashboard/schedule/static/dual-school-step";

/**
 * The new-dual flow's shell — `2c` then `2b`, rendered from fixtures.
 *
 * Two steps and one piece of state to say which, because the design's own
 * eyebrow says "step 1 of 2" and because the second screen is a different
 * layout rather than the first with more fields: `2c` is one padded column,
 * `2b` is master–detail with the chosen school pinned to a rail. A boolean
 * either way, not a form object — nothing on `2c` is an answer this shell
 * needs to carry, since every row it can pick is already in the fixtures.
 *
 * Deliberately thin. `2b` (T6) and the lineup editing over it (T7) both land
 * inside `DualBuildStep`, and neither should need this file re-read to do it —
 * the whole of what is here is the branch.
 *
 * `dual-form.tsx` is the DB-wired implementation of the same two steps and
 * stays where it is, dormant, for the re-wiring. This shell does not import it.
 */
export function StaticDualBuilder() {
  const [step, setStep] = useState<"find-school" | "build">("find-school");

  if (step === "find-school") {
    return <DualSchoolStep onContinue={() => setStep("build")} />;
  }

  return <DualBuildStepStub onBack={() => setStep("find-school")} />;
}

/**
 * STUB — not `2b`, and not a screen. Placeholder for step two.
 *
 * `2b` is the master–detail builder: the chosen school on a rail at the left
 * while date, site, format and the nine lines fill in on the right. None of
 * that is built. T6 replaces the body of this function with the real screen
 * and T7 extends it; until then Continue lands here so the branch is reachable
 * and obviously unfinished rather than silently dead.
 *
 * Named and worded so a reviewer cannot mistake it for finished work. Its
 * "Back" control is scaffolding, not design copy — nothing on `2c` or `2b`
 * draws it — and it exists only so the step is not a trap.
 */
function DualBuildStepStub({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-3 bg-[var(--surface-card)] p-10">
      <div className="flex max-w-[46ch] flex-col items-center gap-2 rounded-[var(--radius-element)] border border-dashed border-[var(--border-medium)] px-8 py-7 text-center">
        <span className="eyebrow">Not built yet</span>
        <span className="text-[13px] font-medium text-[var(--ink-900)]">
          Step 2 — the dual builder
        </span>
        <span className="text-micro text-pretty">
          Artboard 2b: date, site, format and the nine lines, with the school
          you picked on a rail at the left. This is a placeholder, not the
          screen.
        </span>
        <button
          type="button"
          onClick={onBack}
          className="mt-1 cursor-pointer text-[12px] font-medium text-[var(--blue-text)]"
        >
          Back to step one
        </button>
      </div>
    </div>
  );
}
