"use client";

import { useState } from "react";
import {
  DualBuildStep,
  type ChosenSchool,
} from "@/components/dashboard/schedule/static/dual-build-step";
import { DualSchoolStep } from "@/components/dashboard/schedule/static/dual-school-step";

/**
 * The new-dual flow's shell — `2c` then `2b`.
 *
 * Two steps and one piece of state to say which, because the design's own
 * eyebrow says "step 1 of 2" and because the second screen is a different
 * layout rather than the first with more fields: `2c` is one padded column,
 * `2b` is master–detail with the school pinned to a rail.
 *
 * ── The school is the step ─────────────────────────────────────────────────
 * The state is the school step one chose, or null while it is still being
 * asked — not a flag beside it. Step two renders only once that answer
 * exists, so it cannot open on a school nobody picked, and there is no second
 * value to fall out of step with the first. Every path through step one ends
 * in `onContinue` with what it chose: the directory row for a pick, the typed
 * text and no row for a club side or a school the directory never had.
 *
 * ── Why the school travels now, and did not before ─────────────────────────
 * An earlier pass threaded the picked row through while step two's date,
 * site, format and nine lines were still Ridgeline's fixtures, drawn and
 * unvarying — so picking Ridgemont Tech printed "vs Ridgemont Tech" above
 * Ridgeline's lineup, four of the five ways through step one. The guard was
 * to stop threading it. It comes out now because the data travels with the
 * school rather than because the guard was unwanted: step two holds its own
 * date, site, surface and format as controlled state, lists the real
 * conference and this program's real head-to-head off `useNewDualData()`,
 * and draws no opponent roster it did not get from this school. What is still
 * the design's — the nine lines — is OUR side, which no school's name sits
 * over wrongly; seeding it from the ladder is T23's, with `createDual`.
 *
 * Deliberately thin. The lineup editing over `2b` lands inside
 * `DualBuildStep`, and should not need this file re-read to do it — the whole
 * of what is here is the branch. `dual-form.tsx` is the dormant DB-wired
 * implementation of the same two steps and stays where it is until T23.
 *
 * ── No way back, on purpose ────────────────────────────────────────────────
 * Neither artboard draws one. `2b`'s Cancel goes to the schedule, which is a
 * screen this run rebuilt, so step two is an exit and not a trap — which is
 * the only reason the stub that used to sit here carried a "Back" control at
 * all, and why that control leaves with it.
 */
export function StaticDualBuilder() {
  const [school, setSchool] = useState<ChosenSchool | null>(null);

  if (school === null) {
    return (
      <DualSchoolStep
        onContinue={(name, program) =>
          // The row alone for a pick — its name is read off it downstream —
          // and the text alone otherwise, so the two can never disagree.
          setSchool(
            program ? { kind: "program", program } : { kind: "text", name }
          )
        }
      />
    );
  }

  return <DualBuildStep school={school} />;
}
