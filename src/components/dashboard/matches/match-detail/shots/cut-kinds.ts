/**
 * Which frame each Visualizations cut is drawn on — the one place these
 * lists live. Pure and value-import-free (a type-only import of `Cut`), so
 * both `viz-model.ts` and the plain geometry module `court-geometry.ts` can
 * import it without the geometry module reaching back into the model layer.
 */

import type { Cut } from "./viz-model";

/** Cuts plotted where the ball LANDED, on the full-court landing frame
 * (rally placement, return placement, errors) — as against the contact-side
 * cuts. Serve lands too, but on its own service-box frame, so it is not here. */
export function isPlacementCut(cut: Cut): boolean {
  return (
    cut === "returnPlacement" || cut === "rallyPlacement" || cut === "errors"
  );
}

/** Every cut plotted where the ball landed — the placement cuts and serve. */
export function isLandingCut(cut: Cut): boolean {
  return cut === "serve" || isPlacementCut(cut);
}
