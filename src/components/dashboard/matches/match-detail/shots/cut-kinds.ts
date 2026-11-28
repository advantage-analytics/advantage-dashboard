/**
 * Which frame each Visualizations cut is drawn on — the one place these
 * lists live. Pure and value-import-free (a type-only import of `Cut`), so
 * both `viz-model.ts` and the plain geometry module `court-geometry.ts` can
 * import it without the geometry module reaching back into the model layer.
 */

import type { Cut } from "./viz-model";

/** Cuts plotted where the ball LANDED, on the full-court landing frame
 * (rally placement, return placement, errors, approaches — where the
 * approach shot landed) — as against the contact-side cuts. Serve lands too,
 * but on its own service-box frame, so it is not here. */
export function isPlacementCut(cut: Cut): boolean {
  return (
    cut === "returnPlacement" ||
    cut === "rallyPlacement" ||
    cut === "errors" ||
    cut === "approaches"
  );
}

/** Every cut plotted where the ball landed — the placement cuts and serve. */
export function isLandingCut(cut: Cut): boolean {
  return cut === "serve" || isPlacementCut(cut);
}

/**
 * Cuts whose marks are SHOTS, several to a point — the two rally cuts. On
 * every other cut one mark is one point (a serve, a return, the error that
 * ended it), so a count of marks is a count of points and may be worded as
 * one. Here it may not: "97 points" over 97 rally shots from 77 points says
 * something untrue. Anything that words a count of marks asks this first.
 */
export function marksAreShots(cut: Cut): boolean {
  return cut === "rallyPlacement" || cut === "rallyPosition";
}

/** The return cuts: Returns is one chart drawn as Placement or Contact. */
export function isReturnCut(cut: Cut | null): boolean {
  return cut === "returnPlacement" || cut === "returnContact";
}

/** Which half a cut's bands describe — `null` for Serve (service boxes, no
 * bands) and Errors (shares of the errors, not points won per band). */
export function bandKindFor(cut: Cut): "depth" | "contact" | null {
  if (cut === "serve" || cut === "errors") return null;
  return isPlacementCut(cut) ? "depth" : "contact";
}
